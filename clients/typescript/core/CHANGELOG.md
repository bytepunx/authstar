# Changelog

## [1.0.0](https://github.com/bytepunx/authstar-clients/compare/core-v0.3.0...core-v1.0.0) (2026-08-20)


### ⚠ BREAKING CHANGES

* **core:** perTenantJwksKeyProvider's first parameter changes from a baseDomain string to a (tenantSlug) => string | undefined | Promise<string | undefined> resolver function. Callers (tower, and web once it adopts this) must supply a resolver instead of a baseDomain -- see ADR 0091 for the recommended tower-backed, cached implementation.

### Features

* **core:** perTenantJwksKeyProvider takes a domain resolver, not a baseDomain string ([382c563](https://github.com/bytepunx/authstar-clients/commit/382c56352098468d40003fa9ae603b556a9eee91))

## [0.3.0](https://github.com/bytepunx/authstar-clients/compare/core-v0.2.0...core-v0.3.0) (2026-08-18)


### Features

* **core:** InternalClaims gains organizationId ([c0d1b5c](https://github.com/bytepunx/authstar-clients/commit/c0d1b5c8d5e590c1b17e4a0585a73e322e222ddd))

## [0.2.0](https://github.com/bytepunx/authstar-clients/compare/core-v0.1.0...core-v0.2.0) (2026-08-14)


### Features

* **core:** add getEmail() helper, document the sub-is-email contract ([4d243db](https://github.com/bytepunx/authstar-clients/commit/4d243db53537cce213fc54fa331d6a8da20048b4))
* **core:** add perTenantJwksKeyProvider, InternalClaims gains tenant ([c61f3fe](https://github.com/bytepunx/authstar-clients/commit/c61f3fe7ceb15acc7f64126ecb702a44d3a074a5))
* InternalClaims gains permissions; JWKS is now the recommended path ([0ceb945](https://github.com/bytepunx/authstar-clients/commit/0ceb945ee52433c95b1284b58a8fa20cc72600fc))
