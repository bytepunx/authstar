---
title: Operators guide
updated: 2026-11-06
status: draft
---

# authstar for operators

## Configuration

One page per service lists every setting it reads, where it comes from, and its default.

- [Chronicle configuration](chronicle-configuration.md)

### Settings by kind

| Kind | Service | Settings | Details |
|------|---------|----------|---------|
| Argument | chronicle | none | |
| Environment variable | chronicle | `SIGNET_ADDR`, `SIGNET_NAMESPACE`, `SIGNET_TRUST_DOMAIN`, `SIGNET_SERVICE`, `SIGNET_ADMIN_ADDR`, `SPIFFE_ENDPOINT_SOCKET`, `PORT`, `LOG_LEVEL`, `NODE_TLS_REJECT_UNAUTHORIZED`; with no `SIGNET_ADDR`, every `CHRONICLE_*` setting | [Process and bootstrap variables](chronicle-configuration.md#process-and-bootstrap-variables), [Settings](chronicle-configuration.md#settings) |
| Stored configuration (signet) | chronicle | `clickhouseUrl`, `clickhouseUsername`, `clickhouseDatabase`, `towerBaseUrl`, `retentionMonths`, `maxDateRangeDays`, `queryTimeoutMs`, `rateLimitMax`, `rateLimitWindowMs` | [Settings](chronicle-configuration.md#settings) |
| Stored secret (signet) | chronicle | `clickhousePassword`, `rabbitmqUrl` | [Settings](chronicle-configuration.md#settings) |

Start here.

## The dashboard

`flai dashboard` runs the system-flow dashboard for this project, and `flai serve` on the host connects it to the project. A release of flai with the published dashboard image runs as it is: flai checks that the image is on a signed digest list, and flai and the dashboard check each other's release stamp when they connect.

### Unsigned builds

A flai built from source carries no release stamp, and a dashboard image built locally is on no signed list. Both are refused by default. Allow them on purpose, for development builds only:

| Where | How | What it covers |
|-------|-----|----------------|
| The host's flai configuration | `flai config set dashboard.allow_unsigned true` | Every project that flai serves |
| `system-flow.yaml` | `dashboard.allow_unsigned: true`, or `false` | This project, over the host's setting |
| One start of the dashboard | `flai dashboard --allow-unsigned` | That start only; writes nothing |

With it, `flai serve` dials a dashboard image on no signed list and accepts a dashboard with no stamp. `flai dashboard` starts the container with `FLAIOVER_ALLOW_UNSIGNED=1`, so the dashboard accepts a flai with no stamp. A restart keeps it. A stamp that does not verify, or names another component, is still refused, and both sides still prove the agent credential.

It is shown, never silent:

- A banner on every dashboard page, headed `unsigned allowed: flai`, `unsigned allowed: dashboard`, or `unsigned allowed: flai and dashboard`, the sides with no release stamp.
- `unsigned allowed: <sides>` in `flai serve status`, `flai host status`, and `flai dashboard status`.
- One `warn` per connection in flai serve's log, `connection allowed unsigned`.

A release of flai with the published dashboard image needs no allowance and shows none of these.
