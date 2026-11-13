#!/usr/bin/env sh
# Deploy a build of authstar into FLAI_KLUSTER_NAMESPACE over the kluster's
# shared services, the kluster block's `deploy` (design/system/kluster.md in
# system-flow; S-0575's ns-up.sh after the image load, which flai does itself).
#   kluster-deploy.sh
# Steps: the namespace and its service accounts; in the default namespace, the
# removal of the Deployments and CronJobs kluster's profile made; the
# namespace's RabbitMQ vhost and user; its prefixed Postgres and ClickHouse
# databases; its signet bundles and policies (scripts/kluster-signet.sh); and
# the manifests, waiting for each of the eight rollouts. Each step is
# idempotent, so a deploy at a new commit updates the namespace in place. In the
# default namespace the prefix is empty, so main keeps the profile's names.
# KLUSTER_DRY_RUN=1 prints each cluster command instead of running it.
# KLUSTER_ROLLOUT_TIMEOUT (default 300s) bounds each rollout's wait.
set -eu
cd "$(dirname "$0")/.."
. scripts/lib-kluster.sh

kluster_require
kluster_need openssl
mkdir -p "$FLAI_KLUSTER_STATE"

ns="$FLAI_KLUSTER_NAMESPACE"
prefix="$FLAI_KLUSTER_PREFIX"
rollout_timeout="${KLUSTER_ROLLOUT_TIMEOUT:-300s}"
rendered="$FLAI_KLUSTER_STATE/rendered"
mkdir -p "$rendered"

# apply_rendered applies one manifest renamed into the namespace. It renders to
# a file first, so a failed render stops the deploy rather than a pipe hiding it.
apply_rendered() {
  _ar_out="$rendered/${1##*/}"
  kluster_render "$1" > "$_ar_out"
  kc apply -f - < "$_ar_out"
}

kluster_step "namespace $ns and its service accounts"
apply_rendered integration/manifests/00-namespace.yaml
# Cluster-scoped: grants signet-admin the administer verb the signet step needs.
kc apply -f integration/manifests/admin-rbac.yaml

kluster_step "default namespace: remove the Deployments and CronJobs kubectl apply did not make"
if kluster_is_default; then
  # kluster's authstar profile deploys the services from `latest` images with
  # no last-applied annotation; kubectl apply would only merge into them.
  # shellcheck disable=SC2016 # a go-template for kubectl, not shell
  not_applied='{{range $i := .items}}{{with $i.metadata.annotations}}{{if not (index . "kubectl.kubernetes.io/last-applied-configuration")}}{{$i.metadata.name}}{{"\n"}}{{end}}{{else}}{{$i.metadata.name}}{{"\n"}}{{end}}{{end}}'
  for kind in deployment cronjob; do
    if kluster_dry_run; then
      kc -n "$ns" get "$kind" -o go-template="$not_applied"
      names=""
    else
      names="$(kc -n "$ns" get "$kind" -o go-template="$not_applied")"
    fi
    for name in $names; do
      kluster_log "removing $kind/$name, made by the kluster profile"
      kc -n "$ns" delete "$kind" "$name" --wait=true --timeout=300s
    done
  done
else
  kluster_log "skipped: $ns is a story namespace"
fi

kluster_step "rabbitmq: vhost and user $ns"
kluster_need_pod "$KLUSTER_RMQ_NAMESPACE" "$KLUSTER_RMQ_POD" RabbitMQ
amqp_password="$FLAI_KLUSTER_STATE/amqp-password"
if [ ! -s "$amqp_password" ]; then
  (umask 077 && openssl rand -hex 24 > "$amqp_password")
fi
# The password goes on stdin, never in an argument, so neither a dry run nor
# the host's process list shows it.
# shellcheck disable=SC2016 # expanded by the pod's shell, not this one
rmq_setup='ns="$1"
IFS= read -r pw
rabbitmqctl -q list_vhosts | grep -qx "$ns" || rabbitmqctl -q add_vhost "$ns"
if rabbitmqctl -q list_users | cut -f1 | grep -qx "$ns"; then
  rabbitmqctl -q change_password "$ns" "$pw" >/dev/null
else
  rabbitmqctl -q add_user "$ns" "$pw" >/dev/null
fi
rabbitmqctl -q set_permissions -p "$ns" "$ns" ".*" ".*" ".*"'
kc -n "$KLUSTER_RMQ_NAMESPACE" exec -i "$KLUSTER_RMQ_POD" -c "$KLUSTER_RMQ_CONTAINER" -- \
  sh -c "$rmq_setup" rmq-setup "$ns" < "$amqp_password"
(umask 077 && printf 'amqp://%s:%s@rabbitmq.rabbitmq.svc.cluster.local:5672/%s\n' \
  "$ns" "$(cat "$amqp_password")" "$ns" > "$FLAI_KLUSTER_STATE/amqp-url")

kluster_step "databases: ${prefix}tower, ${prefix}keep, ${prefix}herald, ${prefix}chronicle"
kluster_need_pod "$KLUSTER_PG_NAMESPACE" "$KLUSTER_PG_POD" Postgres
kluster_need_pod "$KLUSTER_CH_NAMESPACE" "$KLUSTER_CH_POD" ClickHouse
for db in tower keep herald; do
  query="SELECT 1 FROM pg_database WHERE datname='${prefix}${db}'"
  if kluster_dry_run; then
    pg_exec postgres "$query"
    exists=""
  else
    exists="$(pg_exec postgres "$query")"
  fi
  if [ -z "$exists" ]; then
    pg_exec postgres "CREATE DATABASE ${prefix}${db}"
  else
    kluster_log "postgres database ${prefix}${db} exists"
  fi
done
ch_exec "CREATE DATABASE IF NOT EXISTS ${prefix}chronicle"

kluster_step "signet: bundles and policies for $ns"
if [ ! -d tower/node_modules/@bytepunx/signet-client ]; then
  if kluster_dry_run; then
    kluster_log "dry run: tower has no node_modules; a real deploy runs npm ci in tower first"
  else
    kluster_log "tower has no @bytepunx/signet-client, which the signet step needs; running npm ci in tower"
    (cd tower && npm ci --no-audit --no-fund) >&2
  fi
fi
scripts/kluster-signet.sh

kluster_step "deploy: apply the manifests and wait for eight rollouts"
# 01-db-init-job.yaml is left out: it creates the fixed database names, and the
# databases step above makes the namespace's prefixed ones.
for f in integration/manifests/1[0-7]-*.yaml; do
  apply_rendered "$f"
done
for svc in $KLUSTER_SERVICES; do
  if ! kc rollout status "deployment/$svc" -n "$ns" --timeout="$rollout_timeout"; then
    kc -n "$ns" get pods >&2 || true
    kc -n "$ns" logs "deployment/$svc" --tail=50 >&2 || true
    kluster_die "deployment/$svc in $ns did not roll out within $rollout_timeout; its pods and last 50 log lines are above"
  fi
done
kluster_log "deployed $FLAI_KLUSTER_TAG into $ns"
