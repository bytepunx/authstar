#!/usr/bin/env bash
# Shared helpers sourced by the other scripts in this directory.
set -euo pipefail

CLUSTER_NAME="authstar-integration"
TRUST_DOMAIN="authstar.cluster.local"
SIGNET_NAMESPACE="signet"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The single shared signet namespace every authstar service registers under
# (ns/authstar/sa/<service> — one signet scope per service, per ADR 0014).
# Confirmed from code for portcullis (crates/authstar-config/src/env.rs's
# DEFAULT_NAMESPACE/DEFAULT_SERVICE); tower/keep/herald read SIGNET_NAMESPACE
# from the environment with no hardcoded default, so this is the value this
# harness's manifests (a later task) will set for them. lookout/chronicle/
# steward/web have no live signet wiring yet — see README.md.
AUTHSTAR_NAMESPACE="authstar"

# The 8 authstar services, in the order they're discussed in claude.md.
# scripts/provision.sh iterates this for --config-path layout only; which
# services actually have secrets to author comes from lib-secrets.sh's own
# SECRET_ENTRIES list (steward and web currently have none — see README.md).
SERVICES=(tower keep herald lookout chronicle steward web portcullis)

log() { echo "[$(date +%H:%M:%S)] $*" >&2; }
die() { echo "[$(date +%H:%M:%S)] ERROR: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command '$1' not found on PATH"
}

# kube runs kubectl on KLUSTER_KUBE_CONTEXT when it is set, else on the
# current context. scripts/kluster-deploy.sh sets it to its kluster's context.
kube() {
  if [[ -n "${KLUSTER_KUBE_CONTEXT:-}" ]]; then
    kubectl --context "$KLUSTER_KUBE_CONTEXT" "$@"
  else
    kubectl "$@"
  fi
}

# restart_mark prints a marker of a deployment's pods: each pod's name and its
# containers' restart counts. The manifests label each pod app: <deploy>. A
# container restarted in place keeps its pod and raises its count; a replaced
# pod changes its name. Either changes the marker.
restart_mark() {
  local namespace="$1" deploy="$2"
  kube get pod -n "$namespace" -l "app=${deploy}" \
    -o jsonpath='{range .items[*]}{.metadata.name}={.status.containerStatuses[*].restartCount};{end}' 2>/dev/null || true
}

# pods_ready succeeds when the deployment has a pod and every container of
# every pod is Ready.
pods_ready() {
  local namespace="$1" deploy="$2" states
  states="$(kube get pod -n "$namespace" -l "app=${deploy}" \
    -o jsonpath='{range .items[*]}{.status.containerStatuses[*].ready} {end}' 2>/dev/null || true)"
  [[ -n "${states// /}" && "$states" != *false* ]]
}

# restart_lock_logged succeeds when the deployment's log since <since> (RFC
# 3339) holds the line a workload logs as it takes signet's restart lock: the
# Node services' "signet bundle changed -- acquired restart lock"
# (tower/src/server.ts) or portcullis's "bundle changed and restart lock
# acquired" (portcullis/crates/authstar-proxy/src/main.rs).
restart_lock_logged() {
  local namespace="$1" deploy="$2" since="$3"
  kube logs -n "$namespace" -l "app=${deploy}" --all-containers=true --tail=-1 --since-time="$since" 2>/dev/null \
    | grep -qE 'acquired restart lock|restart lock acquired'
}

# wait_for_signet_restart waits for the restart a step set off by changing a
# workload's signet bundle (I-0035). <marker> is restart_mark's output taken
# before the step and <since> the time the step began, RFC 3339 in UTC.
#   1. For SIGNET_RESTART_SETTLE_SECONDS (45 by default) it watches for the
#      restart to begin: the marker changes, a container stops being Ready, or
#      the log since <since> holds the restart-lock line. The lock is
#      fleet-wide, so a workload's restart may begin only after another
#      workload's has released it; the window covers that.
#   2. Once it has begun, it waits for SIGNET_RESTART_TIMEOUT_SECONDS (120 by
#      default) until the marker has changed and every container is Ready,
#      and dies naming the deployment and its last marker if that never comes.
#   3. When no restart begins within the window, the step set none off, as on
#      a rerun that changes no bundle, and it returns 0.
wait_for_signet_restart() {
  local namespace="$1" deploy="$2" marker="$3" since="$4"
  local settle="${SIGNET_RESTART_SETTLE_SECONDS:-45}" timeout="${SIGNET_RESTART_TIMEOUT_SECONDS:-120}"
  local start="$SECONDS" begun="" current
  while :; do
    current="$(restart_mark "$namespace" "$deploy")"
    if [[ "$current" != "$marker" ]] || ! pods_ready "$namespace" "$deploy" \
      || restart_lock_logged "$namespace" "$deploy" "$since"; then
      begun="$SECONDS"
      break
    fi
    if (( SECONDS - start >= settle )); then
      log "restart wait: ${deploy} began no signet-coordinated restart within ${settle}s; going on"
      return 0
    fi
    sleep 2
  done
  log "restart wait: ${deploy} began its signet-coordinated restart $(( begun - start ))s into the wait"
  while :; do
    current="$(restart_mark "$namespace" "$deploy")"
    if [[ -n "$current" && "$current" != "$marker" ]] && pods_ready "$namespace" "$deploy"; then
      log "restart wait: ${deploy} restarted and is Ready again ($(( SECONDS - start ))s; ${marker} -> ${current})"
      return 0
    fi
    if (( SECONDS - begun >= timeout )); then
      die "restart wait: ${deploy} began a signet-coordinated restart but was not restarted and Ready within ${timeout}s (marker before ${marker}, now '${current}'); see kubectl logs -n ${namespace} deploy/${deploy} --previous"
    fi
    sleep 2
  done
}

# admin_token mints (or reuses, within this shell) a short-lived signet-admin
# token. Requires manifests/admin-rbac.yaml to already be applied — without
# it, the token authenticates fine but every admin RPC returns
# PERMISSION_DENIED (see manifests/admin-rbac.yaml's own comment for why).
#
# --audience signet is required: the chart's default signet.kubeAudiences
# value is "signet", and TokenReview rejects any token whose audience list
# doesn't include one of the configured audiences. A bare `kubectl create
# token` (no --audience) mints a token scoped to the default API server
# audiences, which does not include "signet" — that token authenticates to
# the *cluster* fine but signetd itself rejects it as Unauthenticated.
admin_token() {
  kubectl create token signet-admin -n "$SIGNET_NAMESPACE" --audience signet --duration=1h
}
