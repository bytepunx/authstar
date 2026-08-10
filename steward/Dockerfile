# Multi-stage SvelteKit (adapter-node) build, following the same build/runtime-split shape as
# lookout/chronicle's Dockerfiles: a `build` stage runs `npm run build` (vite build, producing
# adapter-node's `build/` output -- a self-contained Node server under `build/server`, entrypoint
# `build/index.js`), a `prod-deps` stage installs only production `dependencies` (steward's
# package.json currently declares none -- adapter-node bundles its own runtime deps into
# `build/` -- so this stage is a no-op today but keeps the same shape as web's Dockerfile and
# stays correct if a runtime dependency is ever added), and the final runtime stage assembles
# just `build/` + production `node_modules` + `package.json` on a slim base, running as the
# image's built-in non-root `node` user.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000
# adapter-node's generated entrypoint (svelte.config.js confirms adapter-node, chosen per its own
# comment: steward is "a plain long-lived Node process reached only via direct port-forward").
# HOST/PORT default to 0.0.0.0:3000 (build/env.js); TOWER_URL and other runtime config are read
# from plain env vars -- no signet-client wiring exists yet for steward.
CMD ["node", "build/index.js"]
