#!/usr/bin/env sh
# Integration tests: one service against real adapters. Run after behavior tests pass (`make integration`).
# These use testcontainers (Postgres, RabbitMQ, ClickHouse) and need a running Docker daemon.
set -eu
cd "$(dirname "$0")/.."
. scripts/lib-projects.sh
docker info >/dev/null 2>&1 || { echo "integration.sh: Docker is not running; the integration tier needs it" >&2; exit 2; }
for p in $INTEGRATION_PROJECTS; do
  [ -d "$p/node_modules" ] || { echo "integration.sh: $p has no node_modules; run make install" >&2; exit 2; }
  run_in "$p" npm run test:integration
done
