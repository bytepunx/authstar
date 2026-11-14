---
id: T-0117
type: task
nature: remediation
title: Install Playwright's chromium in make install and in CI for steward and web
status: done
parent: S-0022
owner: bytepunx
created: 2026-11-09T22:10:10Z
updated: 2026-11-14T11:14:31Z
transitions:
  - to: ready
    at: 2026-11-14T11:12:03Z
    by: agent-S-0022
  - to: in-progress
    at: 2026-11-14T11:12:03Z
    by: agent-S-0022
  - to: done
    at: 2026-11-14T11:14:31Z
    by: agent-S-0022
stream: S-0022
tags: [web]
touches: [scripts/lib-projects.sh, scripts/install.sh, ".github/workflows/ci.yml", docs/contributors/index.md, steward/TESTING.md]
usage:
  source: log
  seconds: 148
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 11
      output: 2140
      cache_read: 1244080
      cache_write: 13523
      cost: 0.3961
---
# T-0117 Install Playwright's chromium in make install and in CI for steward and web

## Work

Once web's `npm test` runs Playwright, every place that runs it needs chromium. Nothing installs it today: `steward/TESTING.md` asks for `npx playwright install chromium` by hand, and `.github/workflows/ci.yml` runs `npm test` with no browser step.

- In `scripts/lib-projects.sh`, add `PLAYWRIGHT_PROJECTS="steward web"`.
- In `scripts/install.sh`, after the `npm ci` loop, run `npx playwright install chromium` in each of `PLAYWRIGHT_PROJECTS`.
- In `.github/workflows/ci.yml`'s `node` job, add a step after `npm ci` that runs `npx playwright install --with-deps chromium` when the matrix project is `steward` or `web`.

Waits for nothing.

## Done when

- `make install` installs chromium for steward and web.
- `ci.yml` installs chromium before `npm test` for steward and web only.
- `actionlint`, or a YAML parse when it is missing, accepts `ci.yml`.

## Notes

`scripts/install.sh` may change under S-0021 too: a trial merge judges that.
