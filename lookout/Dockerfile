# Multi-stage Node/TypeScript build, following the shape of portcullis's cargo-chef Dockerfile
# (separate stages for building vs. the slim runtime image) adapted to npm/tsc: a `build` stage
# compiles `src/` to `dist/` via `tsc` (package.json's `build` script), a `prod-deps` stage
# installs only production `dependencies` (no devDependencies -- vitest, testcontainers, tsx,
# typescript itself never ship), and the final runtime stage assembles just `dist/` + production
# `node_modules` + `package.json` on top of a slim base, running as the image's built-in
# non-root `node` user.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# ADR 0105: a plain, unparsed declaration of what signet config/secrets this service needs --
# read by authstar-chart's manifest-aggregation tool straight from the published image, not
# consumed by lookout itself at runtime. Absolute destination path (not WORKDIR-relative) so the
# aggregation tool can extract from the same fixed path across every service's image, regardless
# of that service's own WORKDIR (e.g. portcullis's cargo-chef build doesn't use /app).
COPY --chown=node:node signet-manifest.json /signet-manifest.json

USER node
EXPOSE 3000
# Real entrypoint per src/server.ts -- compiles to dist/server.js (tsc mirrors src/'s layout).
# Production config (rabbitmqUrl) is sourced from signet when SIGNET_ADDR is present (Story 002,
# ADR 0102), falling back to the plain LOOKOUT_RABBITMQ_URL env var otherwise -- see
# src/lib/signet-config.ts. No signet CLI flags needed here either way; the mode switch is
# entirely env-driven.
CMD ["node", "dist/server.js"]
