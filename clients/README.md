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
  `roles`, `usage?`, `isNewAccount?`, `iat`, `exp`) — a 60-second, upstream-facing
  `Authorization: Bearer` token portcullis mints fresh on every proxied request. Its
  own doc comment says it plainly: *"downstream services verify it independently
  against the tenant's public key, per ADR 0030's 'defense in depth'"* — this repo is
  that verification, so adopting services never have to hand-roll it. This is almost
  certainly the one your HTTP framework middleware needs.
  `enrichmentStatus: "degraded"` is a real, load-bearing case (portcullis's fail-open
  path when tower's `/enrich` is unreachable) — `roles`/`usage` are deliberately empty
  in that case, never fabricated. Handle it the same way, don't discard it as an
  error.

Neither JWT carries a JWKS URL of its own yet — portcullis has no JWKS-serving route as
of this writing (`web`'s own `INTERNAL_JWT_JWKS_URL` sits unset for exactly that
reason). Every language's core library ships a static-key provider so it's fully usable
today; a JWKS-fetch provider is a drop-in addition once portcullis exposes the route.

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
