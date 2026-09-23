# Multi-stage SvelteKit (adapter-node) build, same shape as steward's Dockerfile: a `build`
# stage runs `npm run build:all` (vite build for the admin app -> adapter-node's `build/`, plus
# `vite.widgets.config.ts`'s separate library-mode build -> `dist-widgets/`, per TESTING.md's
# "Four directories, four different jobs" and the widgets target being "a genuinely separate
# build target from the SvelteKit admin app"), a `prod-deps` stage installs only production
# `dependencies` (`@sveltejs/adapter-node`, `jose`), and the final runtime stage assembles
# `build/` + `dist-widgets/` + production `node_modules` + `package.json` on a slim base, running
# as the image's built-in non-root `node` user.
#
# Assumption worth flagging: `dist-widgets/` is static, framework-agnostic JS meant to be loaded
# via a single <script> tag by *adopting applications* (Story 011), not served by the SvelteKit
# app itself -- there is no `static/` dir wiring it in, and TESTING.md says outright "there's no
# npm-publish or CDN-hosting step" yet. This Dockerfile ships it inside the image alongside the
# admin app (at /app/dist-widgets) so the artifact exists and can be copied out or mounted by
# whatever eventually serves it (CDN push, nginx sidecar, etc.), but the running `node
# build/index.js` process does NOT serve these files over HTTP on its own -- that wiring doesn't
# exist in the app code and this task doesn't add it.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:all

FROM node:22-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/dist-widgets ./dist-widgets
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000
# adapter-node's generated entrypoint (svelte.config.js confirms adapter-node). HOST/PORT default
# to 0.0.0.0:3000 (build/env.js); TOWER_BASE_URL/PUBLIC_TOWER_BASE_URL/INTERNAL_JWT_JWKS_URL and
# other runtime config are read from plain env vars (.env.example) -- no signet-client wiring
# exists yet for web.
CMD ["node", "build/index.js"]
