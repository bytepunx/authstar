#!/usr/bin/env sh
# Install every component's dependencies from its lockfile (`make install`).
set -eu
cd "$(dirname "$0")/.."
. scripts/lib-projects.sh
for p in $NODE_PROJECTS; do
  run_in "$p" npm ci --no-audit --no-fund
done
run_in portcullis cargo fetch
