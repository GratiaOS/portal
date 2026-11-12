# El portal as a container: one process, one config, one database file.
#
#   docker build -t portal .
#   docker run -p 3100:3100 -v portal-data:/data -v ./portal.json:/config/portal.json:ro portal
#
# What it needs from you is in INSTALL.md ("With a container") and in container/.

FROM node:22.18.0-alpine AS build
WORKDIR /src
RUN corepack enable

# the manifests first, so that the dependencies are a layer of their own
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ui/package.json ui/
COPY packages/llm-provider/package.json packages/llm-provider/
# no scripts: `prepare` sets git hooks, and there is no git here
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm run build && pnpm --filter portal-ui build


FROM node:22.18.0-alpine
LABEL org.opencontainers.image.title="El portal" \
      org.opencontainers.image.description="A room for a team and its companion: one process, one config, one database file." \
      org.opencontainers.image.source="https://github.com/GratiaOS/portal" \
      org.opencontainers.image.licenses="MPL-2.0"

ENV NODE_ENV=production \
    PORTAL_CONFIG=/config/portal.json
WORKDIR /app

# what runs: the server, its page, and the one package it imports (no dependencies of its own to install)
COPY --from=build /src/package.json ./
COPY --from=build /src/dist dist
COPY --from=build /src/ui/dist ui/dist
COPY --from=build /src/packages/llm-provider/package.json node_modules/@gratiaos/llm-provider/package.json
COPY --from=build /src/packages/llm-provider/dist node_modules/@gratiaos/llm-provider/dist

# the config is yours and comes from outside (a mount, read only); the data is the only thing the portal writes
RUN mkdir -p /data /config && chown node:node /data
VOLUME /data
USER node
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "dist/main.js"]
