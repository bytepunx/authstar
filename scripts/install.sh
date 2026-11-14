#!/usr/bin/env sh
# Install every component's dependencies from its lockfile (`make install`).
# After each npm project's install, check-install-scripts.sh fails on a blocked
# install script with no allowScripts decision, or a farmhash that does not load.
set -eu
cd "$(dirname "$0")/.."
. scripts/lib-projects.sh
for p in $NODE_PROJECTS; do
  run_in "$p" npm ci --no-audit --no-fund
  scripts/check-install-scripts.sh "$p"
done
run_in portcullis cargo fetch
