#!/usr/bin/env bash
# Provisions signet itself for authstar's integration harness: admin RBAC,
# SOPS age key, the 24 placeholder secrets across the 6 services that
# currently have real signet wiring (see lib-secrets.sh's SECRET_ENTRIES),
# the GitHub deploy key + repo registration, and an initial sync. Idempotent
# — safe to re-run against an already-provisioned cluster. Adapted from
# signet-smoke-test/scripts/provision.sh's exact pattern, generalized from
# one toy "echo" service to 8 real authstar services.
#
# Unlike signet-smoke-test, this script does NOT create any signet policy:
# smoke-test needed one because it has a genuinely cross-namespace shared
# secret (smoke-shared/common, read by every language's echo workload).
# Authstar's services each read only their own namespace/service bundle
# (single shared "authstar" namespace, one scope per service, per ADR 0014)
# — signet's convention-first automatic-access rule already covers that with
# no policy needed, same reasoning signet-smoke-test's own README documents
# for its per-language scopes.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
source "$(dirname "${BASH_SOURCE[0]}")/lib-secrets.sh"

require_cmd kubectl
require_cmd signet
require_cmd gh
require_cmd git
require_cmd ssh-keygen

REPO_SLUG="bytepunx/authstar-integration"
REPO_GIT_URL="git@github.com:${REPO_SLUG}.git"
DEPLOY_KEY_TITLE="authstar-integration-readonly"
DEPLOY_KEY_DIR="$REPO_ROOT/.secrets"
DEPLOY_KEY_PATH="$DEPLOY_KEY_DIR/deploy_key"

cd "$REPO_ROOT"

log "applying admin RBAC fix"
kubectl apply -f manifests/admin-rbac.yaml

log "starting admin port-forward"
# The Service intentionally does not expose 8444 (admin is loopback-only by
# design — see deploy/helm/signet/templates/service.yaml's own comment).
# Forward to the Deployment directly instead, which reaches the container
# port regardless of what the Service exposes.
kubectl port-forward -n "$SIGNET_NAMESPACE" deploy/signet 8444:8444 >/tmp/authstar-integration-portforward.log 2>&1 &
PF_PID=$!
trap 'kill "$PF_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do
  nc -z localhost 8444 2>/dev/null && break
  sleep 0.5
done

signet config set server localhost:8444
TOKEN="$(admin_token)"

log "signet status"
signet status --token "$TOKEN"

log "ensuring a SOPS age key exists"
if ! signet sops-key get --token "$TOKEN" >/dev/null 2>&1; then
  log "no active key — rotating to create the first one"
  signet sops-key rotate --token "$TOKEN"
fi
# Rewrites .sops.yaml's placeholder age recipient (committed as a stand-in —
# see .sops.yaml's own comment) with the live cluster's real public key. Must
# run before the secret-authoring loop below: 'signet secret set' encrypts
# against whatever recipient .sops.yaml currently names, and the placeholder
# recipient corresponds to no real key anyone (including this cluster) holds.
signet sops-key update-config --file .sops.yaml --secrets-path secrets/ --token "$TOKEN"

log "authoring ${#SECRET_ENTRIES[@]} placeholder secrets across all services that have any"
# Values come from lib-secrets.sh, not by re-reading secrets/authstar/**/*.yaml:
# after the first real run those files become genuine SOPS ciphertext, and
# signet's threat model never hands the age private key back to CLI users to
# decrypt them locally — see lib-secrets.sh's own header comment. Re-running
# this loop with the same values is a safe no-op (same plaintext -> same
# ciphertext content, modulo SOPS's own lastmodified/mac bookkeeping).
for entry in "${SECRET_ENTRIES[@]}"; do
  service="${entry%%/*}"
  name="${entry#*/}"
  varname="SECRET_VALUE__${service}__${name}"
  varname="${varname//-/_}"
  value="${!varname:-}"
  if [[ -z "$value" ]]; then
    die "no placeholder value in lib-secrets.sh for ${entry} (expected \$${varname})"
  fi
  signet secret set "${AUTHSTAR_NAMESPACE}/${service}/${name}" \
    --value-file <(printf '%s' "$value") \
    --secrets-root secrets/ \
    --sops-config .sops.yaml \
    --token "$TOKEN"
done

log "config/ (plain, non-secret) files are already committed as static YAML in this repo — nothing to generate"
log "no secrets exist yet for steward or web: both are pending signet-client wiring on the app side (see README.md); their config/ files are already committed"

log "ensuring a read-only deploy key exists on $REPO_SLUG"
mkdir -p "$DEPLOY_KEY_DIR"
if [[ ! -f "$DEPLOY_KEY_PATH" ]]; then
  ssh-keygen -t ed25519 -N '' -C "$DEPLOY_KEY_TITLE" -f "$DEPLOY_KEY_PATH" >/dev/null
fi
if ! gh repo deploy-key list --repo "$REPO_SLUG" | grep -q "$DEPLOY_KEY_TITLE"; then
  gh repo deploy-key add "${DEPLOY_KEY_PATH}.pub" --repo "$REPO_SLUG" --title "$DEPLOY_KEY_TITLE"
fi

log "committing and pushing secrets/config/.sops.yaml"
git add secrets/ config/ .sops.yaml
if ! git diff --cached --quiet; then
  git commit -m "integration: provision secrets and config"
  git push
else
  log "nothing to commit (already up to date)"
fi

log "registering the repository with signet (or reusing an existing registration)"
# 'repo list' prints the --name value in column 2, not the repo URL — match
# on that (word-bounded, since "integration" isn't a prefix of anything else
# signet would have registered in a fresh cluster).
REPO_ID="$(signet repo list --token "$TOKEN" | awk '$2 == "authstar-integration" {print $1}' || true)"
if [[ -z "$REPO_ID" ]]; then
  REPO_ID="$(signet repo add \
    --name authstar-integration \
    --repo-url "$REPO_GIT_URL" \
    --branch main \
    --secrets-path secrets/ \
    --config-path config/ \
    --deploy-key "$DEPLOY_KEY_PATH" \
    --token "$TOKEN" \
    | awk '/ID:/ {print $2; exit}')"
  [[ -n "$REPO_ID" ]] || die "could not parse repo ID from 'signet repo add' output"
fi
echo "$REPO_ID" > "$REPO_ROOT/.integration-repo-id"
log "repo ID: $REPO_ID"

log "triggering an explicit sync"
signet repo sync --id "$REPO_ID" --token "$TOKEN"

log "provisioning complete."
log "verify: the 'triggering an explicit sync' step above printed added/updated/deleted"
log "counts from signet itself — nonzero 'added' on a first run (or 'updated' on a"
log "rerun with changed placeholder values) confirms the secrets really landed."
log "There is no 'signet secret get'-equivalent CLI command (by design — signetd never"
log "hands decrypted secret content to anything but an authenticated workload over"
log "mTLS); the strongest further check is deploying a real workload and reading its"
log "fetched bundle, which is the later manifests task's job, not this one's."
log "when finished, run scripts/down.sh — do not leave the cluster running"
