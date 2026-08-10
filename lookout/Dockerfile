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

USER node
EXPOSE 3000
# Real entrypoint per src/server.ts -- compiles to dist/server.js (tsc mirrors src/'s layout).
# Production config (RabbitMQ URL, etc.) is read from plain env vars today; no signet-client
# wiring exists yet for lookout (src/server.ts's own comment), so this CMD needs no signet flags.
CMD ["node", "dist/server.js"]
