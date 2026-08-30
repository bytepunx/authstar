# authstar-clients

Client SDKs for validating the JWTs [authstar](https://github.com/bytepunx/authstar)'s
`portcullis` reverse proxy issues, across languages and HTTP frameworks — mirrors
[signet-clients](https://github.com/bytepunx/signet-clients)' own one-repo-per-ecosystem,
one-top-level-directory-per-language layout.

## What this validates

portcullis mints two distinct JWTs, both ES256, both carrying a `kid` (a stable
fingerprint of the signing key, for rotation) — see
`authstar/portcullis/crates/authstar-middleware/src/jwt/{session,internal}.rs` for the
authoritative source:

- **Session JWT** (`sub`, `idp`, `identityHash`, `iss`, `aud`, `iat`, `exp`) — the
  long-lived `jwt` cookie. Consumed mainly by portcullis itself.
- **Internal JWT** (`sub`, `idp`, `identityHash`, `enrichmentStatus`, `accountId?`,
  `organizationMemberships`, `roles`, `permissions`, `usage?`, `isNewAccount?`, `iat`,
  `exp` in the payload, plus a `tenant` field on the **protected header** alongside
  `alg`/`kid`/`typ` — ADR 0089) — a 60-second,
  upstream-facing `Authorization: Bearer` token portcullis mints fresh on every proxied
  request. Its own doc comment says it plainly: *"downstream services verify it
  independently against the tenant's public key, per ADR 0030's 'defense in depth'"* —
  this repo is that verification, so adopting services never have to hand-roll it. This
  is almost certainly the one your HTTP framework middleware needs.
  `enrichmentStatus: "degraded"` is a real, load-bearing case (portcullis's fail-open
  path when tower's `/enrich` is unreachable) — `roles`/`permissions`/`organizationMemberships`/`usage`
  are deliberately empty in that case, never fabricated. Handle it the same way, don't
  discard it as an error. `roles` is an open, app-owned vocabulary; `permissions` is a
  closed, authstar-owned vocabulary tower's own authorization is built on (ADR 0069) —
  the two are never merged. `organizationMemberships` (ADR 0100) is every organization
  the account currently belongs to, each with its own independent `roles` list — an
  account can belong to more than one at once, each conferring different standing.

Both JWTs are independently verifiable via a live JWKS endpoint: `GET
https://<tenant-host>/.well-known/jwks.json` (ADR 0086/0087), serving the tenant's
current internal-key public key as a standard JWK, plus a `publicKeyPem` member for
client libraries whose crypto API prefers PEM/DER over a JWK's raw EC point.

Which key-provider to use depends on how your service learns which tenant a request is
for:

- **`jwksKeyProvider(url)`** — a single, fixed JWKS URL. The right choice for portcullis
  itself, or any service reached at a tenant-branded host (`Host`-based tenant
  resolution, ADR 0002).
- **`perTenantJwksKeyProvider(resolveDomain)`** — for a service with no Host-based
  tenant signal at all (tower/keep/herald/web: one shared deployment serving every
  tenant, per ADR 0089). Reads the internal JWT's own `tenant` header field, resolves
  that tenant's own registered domain via `resolveDomain` (a `(tenantSlug) => string |
  undefined | Promise<string | undefined>` callback — tenants bring their own, unrelated
  domains, ADR 0091, so there's no fixed-formula `baseDomain` anymore, as of
  `@bytepunx/authstar-core@0.3.0`), then fetches `https://authstar.<tenant's own
  domain>/.well-known/jwks.json` (the tenant's reserved `authstar` application host),
  caching one `createRemoteJWKSet` per tenant for the life of the process. This is
  almost certainly what a non-portcullis backend service needs — see ADR 0091 for why
  trusting the unverified header this way is safe (the same principle `kid` selection
  already relies on) and the function's own doc comment for the SSRF guard on the tenant
  value before it's used to build a URL.
- **`staticKeyProvider(jwks)`** — a fixed, locally-held key set. For tests, or any
  deployment that prefers pinning keys over a runtime fetch.

Neither JWT has a distinct `email` claim — `sub` *is* the email, by design (see
`internal.rs`/`session.rs`'s own doc comments). Each core library exposes a `getEmail()`
helper rather than making every consumer rediscover that fact.

## Layout

```
typescript/
  core/      @bytepunx/authstar-core    -- JWT parsing/verification, framework-agnostic
  fastify/   @bytepunx/authstar-fastify -- Fastify plugin, bundles core's source in
             (no other language's directories exist yet)
```

## Core, and how framework packages consume it

Each language gets a "core" implementation (parse, verify, typed claims, pluggable key
resolution) that framework-specific middleware wires in from **local source**, not a
separately-published, separately-versioned package dependency — the goal is avoiding
version-skew between core and N framework wrappers. The concrete mechanism is
ecosystem-appropriate, not identical across languages:

- **TypeScript**: an npm workspace (`core` and `fastify` as sibling packages); each
  framework package's build (`tsup`) bundles core's compiled output directly into its
  own published `dist` — the published package has zero runtime dependency on a
  separately-published core. `core` is *also* published standalone, for non-HTTP
  consumers (workers, CLI tools) — framework packages just never depend on that
  published artifact themselves.
- **Go** (when added): a single module with subpackages needs no bundling trick at all.
- **Rust / Python / C#** (when added): crates.io/PyPI/NuGet publishing constraints make
  true local-only linking impractical for a *published* artifact — the idiomatic
  equivalent there is one published package per language with framework integrations
  as optional features/extras, rather than N separately-published framework packages.
