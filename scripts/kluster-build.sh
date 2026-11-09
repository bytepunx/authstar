#!/usr/bin/env sh
# Build one service's image for a kluster deploy (the kluster block's components,
# design/system/kluster.md in system-flow), tagged FLAI_KLUSTER_TAG, and list its
# reference, one a line, in the file FLAI_KLUSTER_IMAGES names.
#   kluster-build.sh <service>
# The service may come from FLAI_KLUSTER_COMPONENT instead; the argument wins.
# Every service's Dockerfile copies only from its own folder (no `file:` dependency
# and no COPY of a sibling), so each builds with its own folder as the context.
set -eu
cd "$(dirname "$0")/.."

die() { echo "kluster-build.sh: $*" >&2; exit 2; }

service="${1:-${FLAI_KLUSTER_COMPONENT:-}}"
[ -n "$service" ] || die "no service given: pass one of tower, keep, herald, lookout, chronicle, steward, web, portcullis, or set FLAI_KLUSTER_COMPONENT"

case "$service" in
  tower|keep|herald|lookout|chronicle|steward|web|portcullis) context="$service" ;;
  *) die "unknown service '$service': expected one of tower, keep, herald, lookout, chronicle, steward, web, portcullis" ;;
esac

[ -n "${FLAI_KLUSTER_TAG:-}" ] || die "FLAI_KLUSTER_TAG is not set: flai sets it for a kluster build, such as s-0019-<commit>"
[ -n "${FLAI_KLUSTER_IMAGES:-}" ] || die "FLAI_KLUSTER_IMAGES is not set: flai names the file the build lists its image in"
command -v docker > /dev/null 2>&1 || die "docker is not on PATH"

ref="docker.io/bytepunx/authstar-${service}:${FLAI_KLUSTER_TAG}"
echo "kluster-build.sh: building $ref from $context/Dockerfile" >&2
docker build -t "$ref" -f "$context/Dockerfile" "$context"
echo "$ref" >> "$FLAI_KLUSTER_IMAGES"
echo "kluster-build.sh: built $ref, listed in $FLAI_KLUSTER_IMAGES" >&2
