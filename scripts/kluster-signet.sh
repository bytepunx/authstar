#!/usr/bin/env sh
# Seed one kluster namespace's signet bundles and cross-service policies, for
# scripts/kluster-deploy.sh once the namespace's databases and vhost exist
# (design/system/kluster.md in system-flow; S-0575's spec.sh and storens).
#   kluster-signet.sh
# Reads $FLAI_KLUSTER_STATE/amqp-url, which the deploy writes. Keeps the
# namespace's operator tokens in $FLAI_KLUSTER_STATE/tokens.env, made once and
# reused by every later deploy, and the fresh keys of its bundles in
# $FLAI_KLUSTER_STATE/signet-secrets.json. Writes nothing to the checkout.
# Seeding again replaces the bundles in place; the teardown cannot delete
# them, since the signet CLI removes only a policy.
# KLUSTER_DRY_RUN=1 prints the bundles (secret names, never values) and the
# signet commands instead of running them.
set -eu
cd "$(dirname "$0")/.."
. scripts/lib-kluster.sh

kluster_require
kluster_need node bash openssl
mkdir -p "$FLAI_KLUSTER_STATE"
[ -s "$FLAI_KLUSTER_STATE/amqp-url" ] \
  || kluster_die "$FLAI_KLUSTER_STATE/amqp-url is missing; scripts/kluster-deploy.sh writes it when it makes the namespace's vhost"

trust_domain="${KLUSTER_TRUST_DOMAIN:-authstar.cluster.local}"
tokens="$FLAI_KLUSTER_STATE/tokens.env"
if [ ! -s "$tokens" ]; then
  (umask 077 && printf 'TOWER_OPERATOR_TOKEN=%s\nHERALD_OPERATOR_TOKEN=%s\n' \
    "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > "$tokens")
fi
# shellcheck source=/dev/null
. "$tokens"
export TOWER_OPERATOR_TOKEN HERALD_OPERATOR_TOKEN

trap signet_disconnect EXIT
signet_connect

kluster_step "signet bundles for $FLAI_KLUSTER_NAMESPACE"
KLUSTER_SIGNET_SERVER="${KLUSTER_SIGNET_SERVER:-}" KLUSTER_SIGNET_TOKEN_FILE="${KLUSTER_SIGNET_TOKEN_FILE:-}" \
  KLUSTER_DEFAULT_NAMESPACE="$KLUSTER_DEFAULT_NAMESPACE" KLUSTER_DRY_RUN="$KLUSTER_DRY_RUN" \
  node scripts/kluster-signet-push.mjs

# ADR-0103's cross-service writes: herald puts into tower, keep, and
# portcullis, and tower into portcullis. `signet policy create` does not
# dedupe, so a grant already listed is skipped, as integration/scripts/provision.sh does.
kluster_step "signet policies for $FLAI_KLUSTER_NAMESPACE"
policies="$(signet_cli policy list)"
for grant in herald:tower herald:keep herald:portcullis tower:portcullis; do
  id="spiffe://$trust_domain/ns/$FLAI_KLUSTER_NAMESPACE/sa/${grant%%:*}"
  target="${grant#*:}"
  pattern="$FLAI_KLUSTER_NAMESPACE/$target/*"
  if printf '%s\n' "$policies" | awk -v id="$id" -v pat="$pattern" '$2==id && $4==pat {found=1} END{exit !found}'; then
    kluster_log "policy exists: $id -> put on $pattern"
    continue
  fi
  kluster_log "creating policy: $id -> put on $pattern"
  signet_cli policy create --spiffe-id "$id" --namespace "$FLAI_KLUSTER_NAMESPACE" \
    --service "$target" --permission put
done
