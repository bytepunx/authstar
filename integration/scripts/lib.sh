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
