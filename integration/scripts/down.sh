#!/usr/bin/env bash
# Tears down the disposable cluster. Everything provisioned by up.sh and
# provision.sh lives inside it — nothing persists outside the cluster except
# the encrypted secrets/config committed to this repo (harmless without the
# master key, which only ever existed inside the destroyed cluster).
#
# This project has had real problems with abandoned clusters left running
# for hours — always run this when you're done with a cluster you started
# via scripts/up.sh, including throwaway `kluster up --profile authstar`
# smoke checks that didn't go through up.sh at all.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_cmd kluster

log "kluster down --name $CLUSTER_NAME"
kluster --config "$REPO_ROOT/kluster.yaml" down --name "$CLUSTER_NAME"
