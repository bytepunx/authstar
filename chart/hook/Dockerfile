# Multi-stage build: compile TypeScript in a full node image, ship only the
# compiled dist/ + production node_modules in a slim runtime image.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Runs to completion and exits -- no long-lived server, no exposed port.
ENTRYPOINT ["node", "dist/index.js"]
