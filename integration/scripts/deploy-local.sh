#!/usr/bin/env bash
# Local-build variant of deploy.sh, for developers without DOCKERHUB_USERNAME/
# DOCKERHUB_TOKEN (or who just want a fully offline loop): builds all 8
# service images from their own repos' Dockerfiles, imports them directly
# into the k3d server node's containerd (bypassing DockerHub entirely, same
# `ctr -n k8s.io images import` mechanism kluster's own rabbitmq-kickr addon
# already documents for exactly this class of problem — see kluster-lib/
# addon/rabbitmq.go's header comment), then applies the same manifests
# deploy.sh does with every `imagePullPolicy: Always` rewritten to
# `IfNotPresent` on the fly (sed, into a scratch copy — the committed
# manifests themselves stay `Always`, correct for the real DockerHub-backed
# CI/prod path). No imagePullSecret is created: with the image already
# present and IfNotPresent set, the kubelet never attempts a pull, so the
# manifests' own `imagePullSecrets: [{name: dockerhub-pull}]` reference is
# simply never resolved -- harmless to leave unsatisfied.
#
# Expects each service repo to be a sibling of this one's own parent
# directory (~/git/authstar/<service>), matching every other authstar repo's
# actual on-disk layout -- not configurable, since this script is dev-loop
# tooling, not something CI ever runs (CI uses deploy.sh against real
# published images).
#
# Idempotent — safe to re-run (kubectl apply throughout; a re-run after
# rebuilding an image needs `kubectl rollout restart` since the tag never
# changes, same ":latest is mutable" caveat as deploy.sh's own images).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_cmd kubectl
require_cmd docker

SERVICE_REPOS_ROOT="$(cd "$REPO_ROOT/.." && pwd)"
K3D_SERVER_CONTAINER="k3d-${CLUSTER_NAME}-server-0"

docker ps --format '{{.Names}}' | grep -qx "$K3D_SERVER_CONTAINER" \
  || die "k3d server container '$K3D_SERVER_CONTAINER' not running -- run scripts/up.sh first"

log "building all 8 service images from $SERVICE_REPOS_ROOT/<service>"
for svc in "${SERVICES[@]}"; do
  log "  building arobson/authstar-$svc:latest"
  # Literal tag, no shell-variable-immediately-before-colon interpolation --
  # this environment has a real, reproducible shell hook bug that silently
  # corrupts a "$var:text" argument (drops ":<first-char>"), confirmed
  # against `docker build -t "arobson/authstar-$svc:latest"` producing
  # "arobson/authstar-${svc}atest:latest" instead. Building into a fixed
  # local var first and using it as a single opaque token sidesteps it.
  image="arobson/authstar-${svc}"
  tag="latest"
  ref="${image}:${tag}"
  (cd "$SERVICE_REPOS_ROOT/$svc" && docker build -t "$ref" .) \
    || die "docker build failed for $svc"
done

log "importing all 8 images into $K3D_SERVER_CONTAINER's containerd (k8s.io namespace)"
for svc in "${SERVICES[@]}"; do
  ref="arobson/authstar-${svc}:latest"
  docker save "$ref" | docker exec -i "$K3D_SERVER_CONTAINER" ctr -n k8s.io images import - \
    || die "image import failed for $svc"
done

log "applying namespace + service accounts"
kubectl apply -f "$REPO_ROOT/manifests/00-namespace.yaml"

log "running db-init Job (per-service Postgres databases + chronicle's ClickHouse database)"
kubectl apply -f "$REPO_ROOT/manifests/01-db-init-job.yaml"
kubectl wait --for=condition=complete job/authstar-db-init -n "$AUTHSTAR_NAMESPACE" --timeout=120s

log "applying the 8 service Deployments/Services + CronJobs (imagePullPolicy: Always -> IfNotPresent)"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
for f in "$REPO_ROOT"/manifests/1[0-7]-*.yaml; do
  out="$TMPDIR/$(basename "$f")"
  sed 's/imagePullPolicy: Always/imagePullPolicy: IfNotPresent/' "$f" > "$out"
  kubectl apply -f "$out"
done

log "waiting for rollouts"
for svc in "${SERVICES[@]}"; do
  kubectl rollout status deployment/"$svc" -n "$AUTHSTAR_NAMESPACE" --timeout=180s
done

log "all 8 services built, imported, and deployed (locally-built images, no DockerHub needed)."
