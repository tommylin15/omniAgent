FROM node:22.20.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY services/agent-gateway ./services/agent-gateway
COPY services/shared-codex ./services/shared-codex
RUN npm ci && ./node_modules/.bin/tsc -p services/shared-codex/tsconfig.json && npm prune --omit=dev

FROM node:22.20.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 \
    OMNIAGENT_GATEWAY_ENTRYPOINT=shared-codex \
    CODEX_SANDBOX_MODE=read-only \
    SANDBOX_ROOT=/tmp \
    CODEX_BIN=/app/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex \
    CODEX_CA_CERTIFICATE=/etc/ssl/certs/ca-certificates.crt
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/shared-codex/dist ./dist
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
USER node
EXPOSE 8080
CMD ["node", "dist/shared-codex/server.js"]
