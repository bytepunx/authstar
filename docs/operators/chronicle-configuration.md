---
title: Chronicle configuration
updated: 2026-11-06
status: active
---

# Chronicle configuration

Every setting chronicle reads, where it comes from, and how chronicle verifies the requests it serves. Chronicle stores analytics events in ClickHouse and serves the `analytics:read` reports.

## How chronicle picks its configuration source

Chronicle runs in one of two modes, chosen by `SIGNET_ADDR` at startup ([ADR 0102](../../design/adrs/0102-signet-precedence-and-fallback-scope.md)).

| Mode | When | Where settings come from | A missing setting |
|------|------|--------------------------|-------------------|
| Env-Only | `SIGNET_ADDR` is unset or empty | `CHRONICLE_*` environment variables | Takes the default below |
| Signet-Configured | `SIGNET_ADDR` is set | Chronicle's signet bundle: plain config and secrets ([ADR 0004](../../design/adrs/0004-signet-for-configuration-and-secrets.md)) | Startup fails, naming the field: `signet bundle missing <field>` |

In Signet-Configured Mode no `CHRONICLE_*` variable is read, so the environment never overrides the bundle. The chart renders `SIGNET_ADDR` for chronicle unconditionally, so a chart install runs Signet-Configured Mode. Its `CHRONICLE_*` entries in `chronicle.extraEnv` only matter if `SIGNET_ADDR` is removed.

## Settings

The chart column names the value that sets the setting in a chart install. `chronicle.config.<key>` and `chronicle.secrets.<key>` are pushed into chronicle's signet bundle by the chart's provisioning hook; `chronicle.extraEnv` is the Env-Only fallback.

| Setting | Env variable (Env-Only) | Bundle key (Signet-Configured) | Secret | Env-Only default | Chart value |
|---------|-------------------------|--------------------------------|--------|------------------|-------------|
| ClickHouse URL | `CHRONICLE_CLICKHOUSE_URL` | `clickhouseUrl` | No | `http://localhost:8123` | `chronicle.config.clickhouseUrl`; `extraEnv` sets `http://clickhouse.clickhouse.svc.cluster.local:8123` |
| ClickHouse user | `CHRONICLE_CLICKHOUSE_USERNAME` | `clickhouseUsername` | No | `default` | `chronicle.config.clickhouseUsername`; `extraEnv` sets `default` |
| ClickHouse password | `CHRONICLE_CLICKHOUSE_PASSWORD` | `clickhousePassword` (secret) | Yes | empty | `chronicle.secrets.clickhousePassword`; `extraEnv` reads Secret `chronicle-secrets` key `CLICKHOUSE_PASSWORD` |
| ClickHouse database | `CHRONICLE_CLICKHOUSE_DATABASE` | `clickhouseDatabase` | No | `chronicle` | `chronicle.config.clickhouseDatabase`; `extraEnv` sets `chronicle` |
| RabbitMQ URL | `CHRONICLE_RABBITMQ_URL` | `rabbitmqUrl` (config, else secret) | Yes, it carries credentials | `amqp://localhost:5672` | `chronicle.secrets.rabbitmqUrl`; `extraEnv` reads Secret `chronicle-secrets` key `RABBITMQ_URL` |
| Tower base URL | `CHRONICLE_TOWER_BASE_URL` | `towerBaseUrl` (config, else secret) | No | `http://localhost:8080` | `chronicle.config.towerBaseUrl`; `extraEnv` sets `https://tower.authstar-platform.svc.cluster.local:8080` |
| Retention, months | `CHRONICLE_RETENTION_MONTHS` | `retentionMonths` | No | `24` | `chronicle.config.retentionMonths` |
| Largest report date range, days | `CHRONICLE_MAX_DATE_RANGE_DAYS` | `maxDateRangeDays` | No | `92` | `chronicle.config.maxDateRangeDays` |
| Query timeout, ms | `CHRONICLE_QUERY_TIMEOUT_MS` | `queryTimeoutMs` | No | `10000` | `chronicle.config.queryTimeoutMs` |
| Rate limit, requests per window per tenant | `CHRONICLE_RATE_LIMIT_MAX` | `rateLimitMax` | No | `60` | `chronicle.config.rateLimitMax` |
| Rate limit window, ms | `CHRONICLE_RATE_LIMIT_WINDOW_MS` | `rateLimitWindowMs` | No | `60000` | `chronicle.config.rateLimitWindowMs` |

Notes:

- Retention builds the ClickHouse table's `TTL` when the table is created ([ADR 0036](../../design/adrs/0036-chronicle-reporting-api-and-retention-config.md), [ADR 0085](../../design/adrs/0085-chronicle-clickhouse-schema.md)). Changing it later is a schema migration, not a reload.
- An Env-Only integer that does not parse falls back to its default.
- `rabbitmqUrl` and `towerBaseUrl` are read from the bundle's plain config first, then from a secret of the same name. Plain config wins when both are set.

## Process and bootstrap variables

These are read from the environment in both modes. The `SIGNET_*` variables are only read when `SIGNET_ADDR` is set.

| Variable | Required | Default | What it does | Chart value |
|----------|----------|---------|--------------|-------------|
| `SIGNET_ADDR` | Selects the mode | unset | signet's workload gRPC address | `chronicle.signet.addr` |
| `SIGNET_NAMESPACE` | Yes, with `SIGNET_ADDR` | none | signet namespace of chronicle's bundle | `chronicle.signet.namespace` |
| `SIGNET_TRUST_DOMAIN` | Yes, with `SIGNET_ADDR` | none | SPIFFE trust domain for the workload dial | `chronicle.signet.trustDomain` |
| `SIGNET_SERVICE` | No | `chronicle` | Service name of chronicle's bundle | not set |
| `SIGNET_ADMIN_ADDR` | No | `SIGNET_ADDR` | Read for parity with the other services; chronicle makes no admin calls | not set |
| `SPIFFE_ENDPOINT_SOCKET` | Yes, with `SIGNET_ADDR` | none | SPIFFE Workload API socket, as a `unix://` URI | `chronicle.spiffe.socketValue` |
| `PORT` | No | `3000` | HTTP listen port | `chronicle.port` |
| `LOG_LEVEL` | No | `info` | Log level | not set |
| `NODE_TLS_REJECT_UNAUTHORIZED` | No | Node's default | The chart sets `0` so chronicle's call to tower's TLS endpoint succeeds without SPIFFE CA trust wiring, as herald and keep do (`design/issues/` I-0001) | `chronicle.extraEnv` |

## How chronicle verifies requests

Chronicle's `analytics:read` routes accept only the ES256 internal JWT that portcullis mints and forwards. There is no shared verification secret: `CHRONICLE_INTERNAL_JWT_SECRET`, the `internalJwtSecret` bundle secret, and the `dev-only-insecure-secret` default are gone.

For each request chronicle:

1. Reads the tenant slug from the token's protected header, `tenant` ([ADR 0089](../../design/adrs/0089-internal-jwt-carries-its-own-tenant-hint.md)).
2. Asks tower for that tenant's registered domain with `GET <towerBaseUrl>/tenants/<slug>`. The answer is cached for the life of the process, so this is one call per tenant, not per request.
3. Fetches the tenant's key set from `https://authstar.<tenant domain>/.well-known/jwks.json` and checks the ES256 signature against the key the token's `kid` names ([ADR 0086](../../design/adrs/0086-jwks-endpoint-for-internal-jwt-verification.md), [ADR 0091](../../design/adrs/0091-tenant-owned-domains-and-the-authstar-admin-surface.md)).
4. Checks the verified claims against the route.

| Response | Means |
|----------|-------|
| `401` | No token, or the token does not verify: wrong algorithm (an HS256 token, for one), unknown key, bad signature, or expired |
| `403` | The token verifies but names another tenant than the route's `:tenantSlug`, is degraded (`enrichmentStatus` not `ok`), or lacks `analytics:read` |

Chronicle therefore needs to reach tower at `towerBaseUrl`, and each tenant's `authstar.<domain>` host over HTTPS. A tenant whose domain tower cannot answer, or whose JWKS host chronicle cannot reach, gets `401` on every report.
