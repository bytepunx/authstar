#!/usr/bin/env sh
# Shared by the test scripts: the components and how each is tested.
# Sourced, not run. Paths are relative to the repository root.

# npm projects whose `npm test` is the behavior and e2e tiers.
NODE_PROJECTS="chart/hook chronicle clients/typescript herald keep lookout steward tower web"

# npm projects with a `test:integration` script (real adapters via testcontainers; needs Docker).
INTEGRATION_PROJECTS="chronicle herald keep lookout steward tower web"

# Runs a command in a project directory, printing what it does; exits non-zero on failure.
run_in() {
  dir="$1"; shift
  echo "==> $dir: $*"
  (cd "$dir" && "$@")
}
