# Multi-stage Node/TypeScript build, following the shape of portcullis's cargo-chef Dockerfile
# (separate stages for building vs. the slim runtime image) adapted to npm/tsc: a `build` stage
# compiles `src/` to `dist/` via `tsc` (package.json's `build` script), a `prod-deps` stage
# installs only production `dependencies` (no devDependencies -- vitest, testcontainers, tsx,
# typescript itself never ship), and the final runtime stage assembles just `dist/` + production
# `node_modules` + `package.json` on top of a slim base, running as the image's built-in
# non-root `node` user.

FROM node:22-slim AS build
WORKDIR /app
# consequent pulls in farmhash (via haberdasher and node-flakes), a native addon with no
# prebuilt binary for this platform -- node-gyp needs python3/make/g++ to compile it from source,
# none of which are in the slim base image.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 8080
# Real entrypoint per src/server.ts -- compiles to dist/server.js (tsc mirrors src/'s layout).
# Listens on PORT (default 8080). Fetches its config/secrets bundle from signet at startup via
# dialWorkload/waitForRestart -- needs SIGNET_WORKLOAD_ADDR, SPIFFE_SOCKET (SPIFFE CSI volume
# mount), and TRUST_DOMAIN set in the environment; no config/secret values are baked into the
# image itself. Also connects to RabbitMQ (amqp-connection-manager) to consume comms events and
# to the SMTP/email provider -- see src/server.ts for the full startup sequence.
CMD ["node", "dist/server.js"]
