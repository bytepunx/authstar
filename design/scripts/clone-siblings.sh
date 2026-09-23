#!/usr/bin/env bash
set -euo pipefail

# Clones every bytepunx/authstar-* repo (discovered live via `gh`, so a
# newly created service repo is picked up automatically -- nothing here to
# keep in sync by hand) as a sibling directory of this repo, e.g. running
# this from ~/git/authstar/design populates ~/git/authstar/tower,
# ~/git/authstar/keep, ~/git/authstar/web, etc. `authstar-design` itself is
# skipped since it's already checked out (that's how you're running this).
#
# Directory names drop the "authstar-" prefix to match the existing local
# convention (authstar-tower -> tower). `gh repo clone` is used instead of
# a bare `git clone` so this works over whatever auth `gh` already has
# configured, without assuming an SSH key is set up for github.com.

if ! command -v gh >/dev/null 2>&1; then
	echo "error: the GitHub CLI (gh) is required -- https://cli.github.com" >&2
	exit 1
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
parent_dir=$(dirname "$repo_root")

repos=$(gh repo list bytepunx --limit 100 --json name --jq '.[].name | select(startswith("authstar-"))')

for repo in $repos; do
	if [ "$repo" = "authstar-design" ]; then
		continue
	fi

	dir_name=${repo#authstar-}
	target="$parent_dir/$dir_name"

	if [ -e "$target" ]; then
		echo "skip: $target already exists"
		continue
	fi

	echo "clone: bytepunx/$repo -> $target"
	gh repo clone "bytepunx/$repo" "$target"
done
