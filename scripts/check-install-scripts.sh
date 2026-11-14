#!/usr/bin/env sh
# After `npm ci`, fails when a project has a blocked install script that its
# `allowScripts` neither approves nor denies, or when a farmhash copy it
# installs does not load (`scripts/install.sh` runs it; see design/tech/npm.md).
# Usage: scripts/check-install-scripts.sh <project-dir> [<project-dir> ...]
set -eu

# Projects whose suites load farmhash's native module (I-0016).
FARMHASH_PROJECTS="herald keep tower"

[ "$#" -gt 0 ] || { echo "usage: $0 <project-dir> [<project-dir> ...]" >&2; exit 2; }

failed=0
for dir in "$@"; do
  name="$dir"

  # npm 12 lists each blocked script with no allowScripts decision as a
  # change "pending"; `npm install-scripts ls` exits 0 either way.
  json=$(cd "$dir" && npm install-scripts ls --json)
  pending=$(printf '%s' "$json" | node -e '
    let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => {
      const keys = [];
      for (const pkg of JSON.parse(s).allowScripts || []) {
        for (const c of pkg.changes || []) if (c.change === "pending") keys.push(c.key);
      }
      process.stdout.write(keys.join(" "));
    });')
  if [ -n "$pending" ]; then
    echo "check-install-scripts: $name: npm blocked the install scripts of $pending, which allowScripts neither approves nor denies." >&2
    echo "  In $name, run npm install-scripts approve <pkg> or npm install-scripts deny <pkg>, then make install again (design/tech/npm.md)." >&2
    failed=1
  fi

  case " $FARMHASH_PROJECTS " in
    *" $(basename "$dir") "*)
      # Load every installed farmhash copy, not only the hoisted one.
      if ! (cd "$dir" && find node_modules \( -path 'node_modules/farmhash/package.json' -o -path '*/node_modules/farmhash/package.json' \) | node -e '
        const path = require("path");
        let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => {
          const files = s.split("\n").filter(Boolean);
          if (files.length === 0) { console.error("  no farmhash copy is installed"); process.exit(1); }
          let bad = 0;
          for (const f of files) {
            const d = path.resolve(path.dirname(f));
            const v = require(path.join(d, "package.json")).version;
            try { require(d); } catch (e) {
              console.error("  farmhash@" + v + " (" + path.dirname(f) + ") does not load: " + String(e.message).split("\n")[0]);
              bad = 1;
            }
          }
          process.exit(bad);
        });'); then
        echo "check-install-scripts: $name: farmhash's native module does not load after the install." >&2
        echo "  Approve the farmhash version npm installs in $name's allowScripts (npm install-scripts approve farmhash), then make install again (design/tech/npm.md)." >&2
        failed=1
      fi
      ;;
  esac
done
exit "$failed"
