#!/usr/bin/env sh
# Behavior tests: fast, no external dependencies. Run on every iteration (`make test`).
# Each npm project's own `npm test` is its behavior and e2e tiers; portcullis runs cargo test.
set -eu
cd "$(dirname "$0")/.."
. scripts/lib-projects.sh
for p in $NODE_PROJECTS; do
  [ -d "$p/node_modules" ] || { echo "test.sh: $p has no node_modules; run make install" >&2; exit 2; }
  run_in "$p" npm test
done
run_in portcullis cargo test --workspace
run_in portcullis cargo clippy --workspace --all-targets -- -D warnings
