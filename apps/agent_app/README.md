# omniAgent Flutter client

Independent Chat UI source for omniAgent. It uses only omniAgent `/v1/threads` endpoints and does not call external legacy Chat routes or external storage. Run `flutter pub get`, `flutter analyze lib test`, `flutter test`, and `flutter build web` from this directory.

Local configuration requires `--dart-define=OMNIAGENT_API_BASE_URL=...` and `--dart-define=OMNIAGENT_GOOGLE_CLIENT_ID=...` with an approved omniAgent audience. No real values or credentials are checked in. The Web host is buildable and has a Flutter analyze/test/build CI workflow, and exact-head Flutter CI has passed for UI v1 source. Deployed browser/mobile acceptance, OAuth integration, runtime dispatch, historical import, and real external-domain connector acceptance remain open.

Threads, provider/model choice, queued messages, bounded event replay, fork, pre-dispatch cancellation, approval decisions, tool events, citations, and Markdown/code text are in the client. Tool/Skill management and external context selection intentionally show pending states where their omniAgent HTTP endpoints are not yet wired; the UI never falls back to an external system's internal or legacy Chat APIs.

## UI v1 baseline trigger

The 2026-10-07 UI v1 Slice 1 work records an exact-head Flutter baseline before source edits. This documentation-only change intentionally triggers the path-filtered Flutter workflow without changing application behavior.
