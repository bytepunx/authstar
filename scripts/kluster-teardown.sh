#!/usr/bin/env sh
# Remove what scripts/kluster-deploy.sh made for a story's namespace outside the
# namespace itself, the kluster block's `teardown` (design/system/kluster.md in
# system-flow): its RabbitMQ vhost and user, its prefixed Postgres and ClickHouse
# databases, its signet policies, and its signet bundles, which
# scripts/kluster-signet-remove.mjs deletes. flai deletes the Kubernetes
# namespace and FLAI_KLUSTER_STATE afterwards.
#   kluster-teardown.sh
# It refuses the default namespace and an empty prefix: a teardown never drops
# main's databases or bundles. Each step removes only what is present, so a
# second run passes.
set -eu
cd "$(dirname "$0")/.."
. scripts/lib-kluster.sh

KLUSTER_TRUST_DOMAIN="${KLUSTER_TRUST_DOMAIN:-authstar.cluster.local}"

kluster_require
if kluster_is_default; then
  kluster_die "refusing to tear down the default namespace $KLUSTER_DEFAULT_NAMESPACE: it holds main's deploy"
fi
[ -n "$FLAI_KLUSTER_PREFIX" ] \
  || kluster_die "refusing a teardown with an empty FLAI_KLUSTER_PREFIX: it would drop main's databases"

ns="$FLAI_KLUSTER_NAMESPACE"
prefix="$FLAI_KLUSTER_PREFIX"

kluster_step "rabbitmq: delete vhost and user $ns"
kluster_need_pod "$KLUSTER_RMQ_NAMESPACE" "$KLUSTER_RMQ_POD" RabbitMQ
rmq_exec "
  if rabbitmqctl -q list_vhosts | grep -qx '$ns'; then rabbitmqctl -q delete_vhost '$ns'; fi
  if rabbitmqctl -q list_users | cut -f1 | grep -qx '$ns'; then rabbitmqctl -q delete_user '$ns'; fi"

kluster_step "postgres: drop ${prefix}tower, ${prefix}keep, ${prefix}herald"
kluster_need_pod "$KLUSTER_PG_NAMESPACE" "$KLUSTER_PG_POD" Postgres
for db in tower keep herald; do
  pg_exec postgres "DROP DATABASE IF EXISTS ${prefix}${db} WITH (FORCE)"
done

kluster_step "clickhouse: drop ${prefix}chronicle"
kluster_need_pod "$KLUSTER_CH_NAMESPACE" "$KLUSTER_CH_POD" ClickHouse
ch_exec "DROP DATABASE IF EXISTS ${prefix}chronicle"

kluster_step "signet: remove the policies of spiffe://$KLUSTER_TRUST_DOMAIN/ns/$ns/sa/*"
trap signet_disconnect EXIT
signet_connect
if kluster_dry_run; then
  signet_cli policy list
  policies=""
  kluster_log "dry run: the policy list is empty, so no policy is removed"
else
  # Columns: ID, SPIFFE ID, NAMESPACE, PATTERN, PERMISSIONS, whitespace-separated.
  policies="$(signet_cli policy list | awk -v id="spiffe://$KLUSTER_TRUST_DOMAIN/ns/$ns/sa/" \
    'NR > 1 && index($2, id) == 1 { print $1 }')"
fi
removed=0
for policy in $policies; do
  signet_cli policy remove --id "$policy"
  removed=$((removed + 1))
done
kluster_log "signet: removed $removed policies"

kluster_step "signet: delete the bundles under signet namespace $ns"
kluster_need node bash
if [ ! -d tower/node_modules/@bytepunx/signet-client ]; then
  if kluster_dry_run; then
    kluster_log "dry run: tower has no node_modules; a real teardown runs npm ci in tower first"
  else
    kluster_need npm
    kluster_log "tower has no @bytepunx/signet-client, which the bundle delete needs; running npm ci in tower"
    (cd tower && npm ci --no-audit --no-fund) >&2
  fi
fi
KLUSTER_SIGNET_SERVER="${KLUSTER_SIGNET_SERVER:-}" KLUSTER_SIGNET_TOKEN_FILE="${KLUSTER_SIGNET_TOKEN_FILE:-}" \
  KLUSTER_DEFAULT_NAMESPACE="$KLUSTER_DEFAULT_NAMESPACE" KLUSTER_DRY_RUN="$KLUSTER_DRY_RUN" \
  node scripts/kluster-signet-remove.mjs
