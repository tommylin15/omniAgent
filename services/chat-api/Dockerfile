FROM ghcr.io/cirruslabs/flutter:stable AS ui
WORKDIR /ui
COPY apps/agent_app ./
ARG OMNIAGENT_GOOGLE_CLIENT_ID
RUN flutter pub get && flutter build web --release --dart-define=OMNIAGENT_GOOGLE_CLIENT_ID=${OMNIAGENT_GOOGLE_CLIENT_ID}

FROM node:22.20.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY services ./services
RUN npm ci && npm run build && npm prune --omit=dev

FROM node:22.20.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 OMNIAGENT_WEB_ROOT=/app/public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/chat-api/dist ./services/chat-api/dist
COPY --from=ui /ui/build/web ./public
USER node
EXPOSE 8080
CMD ["node", "services/chat-api/dist/services/chat-api/main.js"]
