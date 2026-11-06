#!/usr/bin/env sh
# Smoke tests: end-to-end paths through the whole system. Run after integration passes (`make smoke`).
# The golden-path scenario in integration/ drives a real disposable k3d cluster; bring it up first
# with integration/scripts/up.sh, provision.sh, and deploy-local.sh, and tear it down with down.sh.
set -eu
cd "$(dirname "$0")/.."
command -v kubectl >/dev/null 2>&1 || { echo "smoke.sh: kubectl not found; the smoke tier needs the k3d cluster integration/README.md describes" >&2; exit 2; }
kubectl get ns authstar >/dev/null 2>&1 || { echo "smoke.sh: no authstar namespace reachable; bring the cluster up per integration/README.md" >&2; exit 2; }
exec integration/scripts/scenario-golden-path.sh "$@"
