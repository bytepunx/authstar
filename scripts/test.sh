#!/usr/bin/env sh
# Behavior tests: fast, no external dependencies. Run on every iteration (`make test`).
# Each npm project's own `npm test` is its behavior and e2e tiers; portcullis runs cargo test.
# Usage: scripts/test.sh [project...]
#   With no argument, every project. With arguments, only those: each a path in
#   NODE_PROJECTS (scripts/lib-projects.sh) or `portcullis`, as the manifest's
#   per-project test tiers call it.
set -eu
cd "$(dirname "$0")/.."
. scripts/lib-projects.sh

known="$NODE_PROJECTS portcullis"
# The project list is space-separated paths with no spaces or globs, so splitting it is intended.
# shellcheck disable=SC2086
[ "$#" -gt 0 ] || set -- $known
for p in "$@"; do
  case " $known " in
    *" $p "*) ;;
    *) echo "test.sh: unknown project \"$p\"; known projects: $known" >&2; exit 2 ;;
  esac
done

for p in "$@"; do
  if [ "$p" = portcullis ]; then
    run_in portcullis cargo test --workspace
    run_in portcullis cargo clippy --workspace --all-targets -- -D warnings
  else
    [ -d "$p/node_modules" ] || { echo "test.sh: $p has no node_modules; run make install" >&2; exit 2; }
    run_in "$p" npm test
  fi
done
