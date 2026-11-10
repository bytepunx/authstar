---
id: T-0090
type: task
nature: feature
title: scripts/kluster-signet.sh seeds a namespace's signet bundles and cross-service policies
status: done
parent: S-0019
owner: bytepunx
created: 2026-11-09T06:54:55Z
updated: 2026-11-09T22:08:47Z
transitions:
  - to: ready
    at: 2026-11-09T22:02:26Z
    by: agent-S-0019
  - to: in-progress
    at: 2026-11-09T22:02:27Z
    by: agent-S-0019
  - to: done
    at: 2026-11-09T22:08:47Z
    by: agent-S-0019
stream: S-0019
tags: [kluster, scripts, signet]
touches: [scripts/kluster-signet.sh, scripts/kluster-signet-push.mjs, scripts/lib-kluster.sh]
after: [T-0089]
usage:
  source: log
  seconds: 380
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 74
      output: 23872
      cache_read: 7000266
      cache_write: 102699
      cost: 2.596
---
# T-0090 scripts/kluster-signet.sh seeds a namespace's signet bundles and cross-service policies

## Work

Write `scripts/kluster-signet.sh`, sourcing `scripts/lib-kluster.sh`, which the deploy calls once its databases and vhost exist. It does what S-0575's `spec.sh` and `storens` did, from the checkout's own files:

- For each of the eight services, build its bundle from `integration/config/authstar/<service>.yaml` and `integration/scripts/lib-secrets.sh`, with the namespace's values: every `*.authstar.svc.cluster.local` host in the namespace, `dbConnectionString` on `<prefix><service>`, `rabbitmqUrl` as the namespace's own user on its own vhost (passed in by the deploy), chronicle's `clickhouseDatabase` as `<prefix>chronicle`, and fresh EC keys, peppers, salts, and hex secrets, so no two namespaces share key material. Write the operator tokens it makes to `$FLAI_KLUSTER_STATE/tokens.env`, never to the repository.
- Push them under signet namespace `$FLAI_KLUSTER_NAMESPACE`, service `<service>`, through signet's admin API: a `kc port-forward` of signet's admin port and a token from `kc create token signet-admin -n signet --audience signet`. Use the `signet` CLI where it can write a bundle; where it cannot, a helper under `scripts/` the story's `scripts` touch allows. Give every bundle a `secrets/` entry, since signet refuses a bundle with config and no secrets (S-0575, What it took, row 3).
- Ensure the four cross-service policies `integration/scripts/provision.sh` makes: herald puts into tower, keep, and portcullis, and tower into portcullis.
- Kill the port-forward on exit, by its PID, not by `jobs`.

Waits for T-0089, whose `kc`, dry-run mode, and checks it uses.

## Done when

- `shellcheck` and `sh -n` pass.
- With `KLUSTER_DRY_RUN=1` for `s-0019`, it prints eight bundles whose hosts, database names, and vhost name the namespace and prefix, and four policies, and writes no secret to the checkout.

## Notes

Seeding twice into one namespace is idempotent: a second deploy at a new commit replaces the bundles in place. The teardown cannot delete them, as S-0575 found: the signet CLI removes only a policy by ID.
