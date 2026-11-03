FROM node:22.20.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY services ./services
RUN npm ci && npx tsc -p services/agent-worker/tsconfig.json && npm prune --omit=dev
FROM node:22.20.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 AGENT_RUNTIME_ENABLED=false
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/agent-worker/dist ./dist
USER node
EXPOSE 8080
CMD ["node","dist/services/agent-worker/main.js"]
