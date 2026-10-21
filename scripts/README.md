# scripts

Purpose-named shell scripts for common tasks. The `Makefile` calls these; CI calls the same ones. Each script is safe to run from any directory, prints what it does, and exits non-zero on failure.

| Script | Does |
|--------|------|
| `check.sh` | Runs `flai check --strict` on this repository |
| `install.sh` | `npm ci` in every npm project and `cargo fetch` for portcullis (`make install`) |
| `test.sh` | Behavior and e2e tiers: every npm project's `npm test`, then `cargo test` and clippy for portcullis (`make test`) |
| `integration.sh` | Integration tier: `npm run test:integration` in every service that has one; needs Docker (`make integration`) |
| `smoke.sh` | The golden-path scenario in `integration/` against a running k3d cluster (`make smoke`) |
| `lib-projects.sh` | Sourced by the above: the project lists and the `run_in` helper |
