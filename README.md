# omniAgent

Independent Agent runtime, Chat API/storage target, and Flutter Chat UI source. Janus remains the live Chat writer and deployed User UI until a separate, verified cutover; this repository is not deployed as a complete assistant application.

Node: run `npm ci`, `npm run build`, and `npm test` here. Flutter: run `flutter pub get`, `flutter analyze lib test`, `flutter test`, and `flutter build web` from `apps/agent_app`. No credentials or real endpoint values are checked in.

See [architecture](docs/architecture.md), [UI ownership](docs/ui.md), [migration status](docs/migration-from-janus.md), [storage gate](docs/chat-storage-migration.md), and [Janus connector](docs/janus-connector.md).
