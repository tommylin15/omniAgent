# omniAgent

Independent Agent runtime, Chat API/storage target, and Flutter Chat UI source. Split Phases 0–5 are closed as migration checkpoints: the repository/build boundary, contract/security split, bounded Janus connector checkpoint, Chat API/storage ownership target, and UI extraction are established. This does **not** mean live cutover is complete.

Janus remains the live Chat writer and deployed User UI until the later deployment/cutover gates. Its API build pins the pre-split User App Web artifact to preserve the legacy Chat path, validated in GCP dev. Remaining live work is tracked as Phase 6 deployment planning, Phase 6B real dev deployment/acceptance, Phase 7 Janus cleanup, Phase 8 documentation/stale-reference migration, and Phase 9 final acceptance.

Node: run `npm ci`, `npm run build`, and `npm test` here. Flutter: run `flutter pub get`, `flutter analyze lib test`, `flutter test`, and `flutter build web` from `apps/agent_app`. No credentials or real endpoint values are checked in.

See [split execution status](docs/todo.md), [UI cutover runbook](docs/runbook-ui-cutover.md), [architecture](docs/architecture.md), [UI ownership](docs/ui.md), [migration status](docs/migration-from-janus.md), [storage gate](docs/chat-storage-migration.md), and [Janus connector](docs/janus-connector.md).
