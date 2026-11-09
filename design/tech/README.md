---
title: Technology index
updated: 2026-11-09
status: active
---

# Technology choices

One file per technology: version, where used, why chosen, what was considered.

| Technology | Version | Used in | File |
|------------|---------|---------|------|
| SvelteKit, Svelte, Vite, Playwright | kit ^3.1.1, svelte ^5.57.1 | web, steward | [sveltekit.md](sveltekit.md) |
| vitest | ^5.1.0 (chart/hook ^2.0.0) | Node services, web, steward, chart/hook | [vitest.md](vitest.md) |
| testcontainers | ^12.2.1 | chronicle, herald, keep, lookout, tower | [testcontainers.md](testcontainers.md) |
| npm and `allowScripts` | npm 12 | every Node project | [npm.md](npm.md) |
| Node, Fastify, consequent, Rust/axum, Postgres, ClickHouse, RabbitMQ, signet, SPIFFE | see file | all components | [tech-stack.md](tech-stack.md), the consolidated record carried over from the original design repository; split one file per technology when a dependency next changes |
