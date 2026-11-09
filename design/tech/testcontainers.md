---
title: testcontainers
updated: 2026-11-09
status: active
topics: [node, sveltekit]
---

# testcontainers

testcontainers starts the real Postgres and RabbitMQ that the Node services' integration tier runs against (`npm run test:integration`, `make integration`). It needs a running Docker daemon.

## Versions

| Project | `testcontainers` | Modules |
|---------|------------------|---------|
| chronicle | ^12.2.1 | `@testcontainers/rabbitmq` ^12.2.1 |
| herald | ^12.2.1 | `@testcontainers/postgresql`, `@testcontainers/rabbitmq` ^12.2.1 |
| keep | ^12.2.1 | `@testcontainers/postgresql`, `@testcontainers/rabbitmq` ^12.2.1 |
| lookout | ^12.2.1 | `@testcontainers/rabbitmq` ^12.2.1 |
| tower | ^12.2.1 | `@testcontainers/postgresql` ^12.2.1 |

web and steward do not use it: their integration tiers run their own server against a fake tower or keep over real HTTP.

S-0020 moved the services from testcontainers 10 to 12, after a forced `npm audit fix`. No integration spec needed a change.

lookout's audit fix had moved it down from ^12.1.0 to ^10.10.4. Through dockerode's `tar-fs`, 10.10.4 carries three high advisories, so lookout is back on ^12.2.1 like the other services. 12.x carries moderate, dev-only advisories through `archiver` and its `glob`/`minimatch`; npm's only offered fix is the downgrade to 10.10.4, which is worse.

## Install scripts

testcontainers pulls in `ssh2` and `cpu-features`, whose install scripts only speed up SSH connections to a remote Docker host. Every project denies them under npm 12 ([npm.md](npm.md)); the suites pass without them.
