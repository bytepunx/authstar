# Changelog

## [1.0.0](https://github.com/bytepunx/authstar-clients/compare/fastify-v0.2.2...fastify-v1.0.0) (2026-08-20)


### ⚠ BREAKING CHANGES

* **fastify:** perTenantJwksKeyProvider (re-exported from authstar-core) now takes a domain resolver function, not a baseDomain string -- same breaking change as core 0.3.0, just actually propagated this time.

### Bug Fixes

* **fastify:** pin authstar-core dependency, re-bundle against 0.3.0 ([98b009d](https://github.com/bytepunx/authstar-clients/commit/98b009d91f72da4b1b0ad2d2393b7e09da874468))
* regenerate lock file after core's 1.0.0 release, bump fastify's pin ([51f7cbb](https://github.com/bytepunx/authstar-clients/commit/51f7cbb5e6d2bf2d2f10929459241435913ad7f9))

## [0.2.2](https://github.com/bytepunx/authstar-clients/compare/fastify-v0.2.1...fastify-v0.2.2) (2026-08-18)


### Bug Fixes

* **fastify:** actually bundle core's types, not just its JS ([6523ab5](https://github.com/bytepunx/authstar-clients/commit/6523ab5535671d8eec0c0932c1b24950033b90ed))

## [0.2.1](https://github.com/bytepunx/authstar-clients/compare/fastify-v0.2.0...fastify-v0.2.1) (2026-08-14)


### Bug Fixes

* **fastify:** re-export perTenantJwksKeyProvider from core ([9a4221a](https://github.com/bytepunx/authstar-clients/commit/9a4221a0d8d39d1c34fe6b5ff3ec9988a40c9532))

## [0.2.0](https://github.com/bytepunx/authstar-clients/compare/fastify-v0.1.0...fastify-v0.2.0) (2026-08-14)


### Features

* **core:** add perTenantJwksKeyProvider, InternalClaims gains tenant ([c61f3fe](https://github.com/bytepunx/authstar-clients/commit/c61f3fe7ceb15acc7f64126ecb702a44d3a074a5))
