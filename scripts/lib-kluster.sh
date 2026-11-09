# shellcheck shell=sh
# Shared helpers for the kluster scripts flai runs (design/system/kluster.md):
# scripts/kluster-deploy.sh, scripts/kluster-signet.sh, scripts/kluster-teardown.sh.
# Source it; it sets no shell options of its own.
#
# Variables flai gives every command: FLAI_KLUSTER_NAMESPACE, FLAI_KLUSTER_PREFIX,
# FLAI_KLUSTER_TAG, FLAI_KLUSTER_STATE, FLAI_KLUSTER_CONTEXT, KUBECONFIG.
#
# Variables of this library, each with its default:
#   KLUSTER_DRY_RUN=1            print each cluster command instead of running it
#   KLUSTER_DEFAULT_NAMESPACE    authstar: the namespace the manifests name, main's
#   KLUSTER_PG_NAMESPACE/POD     postgres / postgresql-0
#   KLUSTER_PG_PASSWORD          postgres
#   KLUSTER_CH_NAMESPACE/POD     clickhouse / clickhouse-shard0-0
#   KLUSTER_CH_PASSWORD          clickhouse
#   KLUSTER_RMQ_NAMESPACE/POD    rabbitmq / rabbitmq-0
#   KLUSTER_RMQ_CONTAINER        rabbitmq

KLUSTER_DRY_RUN="${KLUSTER_DRY_RUN:-}"
KLUSTER_DEFAULT_NAMESPACE="${KLUSTER_DEFAULT_NAMESPACE:-authstar}"
KLUSTER_PG_NAMESPACE="${KLUSTER_PG_NAMESPACE:-postgres}"
KLUSTER_PG_POD="${KLUSTER_PG_POD:-postgresql-0}"
KLUSTER_PG_PASSWORD="${KLUSTER_PG_PASSWORD:-postgres}"
KLUSTER_CH_NAMESPACE="${KLUSTER_CH_NAMESPACE:-clickhouse}"
KLUSTER_CH_POD="${KLUSTER_CH_POD:-clickhouse-shard0-0}"
KLUSTER_CH_PASSWORD="${KLUSTER_CH_PASSWORD:-clickhouse}"
KLUSTER_RMQ_NAMESPACE="${KLUSTER_RMQ_NAMESPACE:-rabbitmq}"
KLUSTER_RMQ_POD="${KLUSTER_RMQ_POD:-rabbitmq-0}"
KLUSTER_RMQ_CONTAINER="${KLUSTER_RMQ_CONTAINER:-rabbitmq}"

# The eight services, in the order the manifests number them.
# shellcheck disable=SC2034 # read by the scripts that source this file
KLUSTER_SERVICES="tower keep herald lookout chronicle steward web portcullis"

# kluster_log prints its arguments as one line to stderr.
kluster_log() {
  printf '%s\n' "$*" >&2
}

# kluster_die prints what failed and what to do to stderr, then exits 1.
kluster_die() {
  printf '%s: %s\n' "${0##*/}" "$*" >&2
  exit 1
}

# kluster_step prints a dated "==> <name>" line to stderr as a step starts.
kluster_step() {
  printf '%s ==> %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

# kluster_dry_run is true when KLUSTER_DRY_RUN=1.
kluster_dry_run() {
  [ "$KLUSTER_DRY_RUN" = 1 ]
}

# kluster_need fails naming each command missing from PATH.
kluster_need() {
  _kn_missing=""
  for _kn_cmd in "$@"; do
    command -v "$_kn_cmd" >/dev/null 2>&1 || _kn_missing="$_kn_missing $_kn_cmd"
  done
  [ -z "$_kn_missing" ] || kluster_die "missing on PATH:$_kn_missing; install them and run again"
}

# kluster_is_default is true when FLAI_KLUSTER_NAMESPACE is the default namespace.
kluster_is_default() {
  [ "${FLAI_KLUSTER_NAMESPACE:-}" = "$KLUSTER_DEFAULT_NAMESPACE" ]
}

# kluster_require checks flai's variables and kubectl; a dry run needs no cluster.
kluster_require() {
  for _kr_var in FLAI_KLUSTER_NAMESPACE FLAI_KLUSTER_TAG FLAI_KLUSTER_STATE; do
    eval "_kr_val=\${$_kr_var:-}"
    [ -n "$_kr_val" ] || kluster_die "$_kr_var is not set; flai sets it, or set it to run this by hand"
  done
  # The prefix must be set, and may be empty only in the default namespace.
  [ "${FLAI_KLUSTER_PREFIX+set}" = set ] \
    || kluster_die "FLAI_KLUSTER_PREFIX is not set; flai sets it, empty for the default namespace"
  if [ -z "$FLAI_KLUSTER_PREFIX" ] && ! kluster_is_default; then
    kluster_die "FLAI_KLUSTER_PREFIX is empty for namespace $FLAI_KLUSTER_NAMESPACE; only $KLUSTER_DEFAULT_NAMESPACE has no prefix"
  fi
  kluster_dry_run && return 0
  [ -n "${FLAI_KLUSTER_CONTEXT:-}" ] \
    || kluster_die "FLAI_KLUSTER_CONTEXT is not set; the scripts never use the host's current context"
  [ -n "${KUBECONFIG:-}" ] || kluster_die "KUBECONFIG is not set; point it at the kluster's kubeconfig"
  kluster_need kubectl
}

# kc runs kubectl on FLAI_KLUSTER_CONTEXT; a dry run prints it, and its stdin when an argument is "-".
kc() {
  if kluster_dry_run; then
    printf '+ kubectl --context %s %s\n' "${FLAI_KLUSTER_CONTEXT:-k3d-dry-run}" "$*"
    for _kc_arg in "$@"; do
      if [ "$_kc_arg" = - ]; then
        cat
        break
      fi
    done
    return 0
  fi
  kubectl --context "$FLAI_KLUSTER_CONTEXT" "$@"
}

# kluster_render prints a manifest renamed into FLAI_KLUSTER_NAMESPACE with FLAI_KLUSTER_TAG's images.
kluster_render() {
  [ -f "$1" ] || kluster_die "manifest $1 not found; run from the checkout's root"
  _kr_from="$KLUSTER_DEFAULT_NAMESPACE"
  _kr_ns="$FLAI_KLUSTER_NAMESPACE"
  sed \
    -e "s/^\([[:space:]]*namespace:\)[[:space:]]*${_kr_from}[[:space:]]*\$/\1 ${_kr_ns}/" \
    -e "s/^\([[:space:]]*name:\)[[:space:]]*${_kr_from}[[:space:]]*\$/\1 ${_kr_ns}/" \
    -e "s/^\([[:space:]]*value:\)[[:space:]]*${_kr_from}[[:space:]]*\$/\1 ${_kr_ns}/" \
    -e "s/\.${_kr_from}\.svc\.cluster\.local/.${_kr_ns}.svc.cluster.local/g" \
    -e "s#image:[[:space:]]*bytepunx/authstar-\([a-z]*\):latest#image: docker.io/bytepunx/authstar-\1:${FLAI_KLUSTER_TAG}#" \
    -e 's/imagePullPolicy:[[:space:]]*Always/imagePullPolicy: IfNotPresent/' \
    -e 's/signet\.signet\.svc\.cluster\.local:8444/signet.signet.svc.cluster.local:8443/' \
    -e '/^[[:space:]]*imagePullSecrets:[[:space:]]*$/{
N
/\n[[:space:]]*-[[:space:]]*name:[[:space:]]*dockerhub-pull[[:space:]]*$/d
}' \
    -e '/^[[:space:]]*-[[:space:]]*name:[[:space:]]*dockerhub-pull[[:space:]]*$/d' \
    "$1"
}

# pg_exec runs SQL as postgres on database $1 in the shared Postgres pod.
pg_exec() {
  kc -n "$KLUSTER_PG_NAMESPACE" exec "$KLUSTER_PG_POD" -- \
    env PGPASSWORD="$KLUSTER_PG_PASSWORD" psql -U postgres -tAq -d "$1" -c "$2"
}

# ch_exec runs a query in the shared ClickHouse pod.
ch_exec() {
  kc -n "$KLUSTER_CH_NAMESPACE" exec "$KLUSTER_CH_POD" -- \
    clickhouse-client --password "$KLUSTER_CH_PASSWORD" -q "$1"
}

# rmq_exec runs a shell script, such as rabbitmqctl calls, in the shared RabbitMQ pod.
rmq_exec() {
  kc -n "$KLUSTER_RMQ_NAMESPACE" exec "$KLUSTER_RMQ_POD" -c "$KLUSTER_RMQ_CONTAINER" -- sh -c "$1"
}
