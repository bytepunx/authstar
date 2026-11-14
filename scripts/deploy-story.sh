#!/bin/zsh

if [[ $# == 1 ]]; then
        Story=$1
  	flai kluster up                  # writes .flai-cache/kluster/kubeconfig again: the API port moved 41600 -> 40820 (I-0023)
	flai kluster deploy $Story       # first deploy into $Story
	flai kluster deploy $Story       # second deploy: must pass too
	flai kluster teardown $Story     # first teardown, now with the signet bundle delete (T-0129)
	flai kluster teardown $Story     # second teardown: must pass with nothing left
	flai kluster teardown $Story     # clears
	flai kluster promote             # clears
else
  	echo "This script takes one and only one story serial number as an argument"
fi;

