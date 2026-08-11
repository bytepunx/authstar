#!/usr/bin/env bash
# Deploys all 8 authstar services into the "authstar" namespace. Run after
# scripts/provision.sh (services fetch their config/secrets from signet at
# startup — deploying before provisioning just means every pod crashloops on
# a bundle fetch failure until it's run).
#
# Requires DOCKERHUB_USERNAME / DOCKERHUB_TOKEN in the environment (a token
# with at least pull access to the private bytepunx/authstar-* repos) — used
# to create the imagePullSecret every Deployment references. Never committed
# to this repo as a manifest: a docker-registry Secret embeds the raw
# credential in its data, so it's created here from env vars instead, same
# reasoning as CI's own DOCKERHUB_USERNAME/DOCKERHUB_TOKEN secrets.
#
# Idempotent — safe to re-run (kubectl apply throughout; the imagePullSecret
# is deleted and recreated rather than patched, since `kubectl create secret`
# has no built-in upsert).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_cmd kubectl

: "${DOCKERHUB_USERNAME:?set DOCKERHUB_USERNAME to a DockerHub account with pull access to bytepunx/authstar-*}"
: "${DOCKERHUB_TOKEN:?set DOCKERHUB_TOKEN to that accounts access token}"

log "applying namespace + service accounts"
kubectl apply -f "$REPO_ROOT/manifests/00-namespace.yaml"

log "creating dockerhub-pull imagePullSecret"
kubectl delete secret dockerhub-pull -n "$AUTHSTAR_NAMESPACE" --ignore-not-found
kubectl create secret docker-registry dockerhub-pull \
  -n "$AUTHSTAR_NAMESPACE" \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username="$DOCKERHUB_USERNAME" \
  --docker-password="$DOCKERHUB_TOKEN"

log "running db-init Job (per-service Postgres databases + chronicle's ClickHouse database)"
kubectl apply -f "$REPO_ROOT/manifests/01-db-init-job.yaml"
kubectl wait --for=condition=complete job/authstar-db-init -n "$AUTHSTAR_NAMESPACE" --timeout=120s

log "applying the 8 service Deployments + Services"
for f in "$REPO_ROOT"/manifests/1[0-7]-*.yaml; do
  kubectl apply -f "$f"
done

log "waiting for rollouts"
for svc in "${SERVICES[@]}"; do
  kubectl rollout status deployment/"$svc" -n "$AUTHSTAR_NAMESPACE" --timeout=120s
done

log "all 8 services deployed and ready."
