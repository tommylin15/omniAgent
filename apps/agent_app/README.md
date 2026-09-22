# omniAgent Flutter client

Independent Chat UI source for omniAgent. It uses only omniAgent `/v1/threads` endpoints; it does not call Janus Chat routes or access Janus storage. Run `flutter pub get`, `flutter analyze lib test`, `flutter test`, and `flutter build web` from this directory.

Local configuration requires `--dart-define=OMNIAGENT_API_BASE_URL=...` and `--dart-define=OMNIAGENT_GOOGLE_CLIENT_ID=...` with an approved omniAgent audience. No real values or credentials are checked in. The Web host is buildable and has a Flutter analyze/test/build CI workflow, but no deployed CI result, deployment, OAuth integration, runtime dispatch, historical data cutover, or real Janus connector acceptance is claimed.

Threads, provider/model choice, queued messages, bounded event replay, fork, pre-dispatch cancellation, approval decisions, tool events, citations, and Markdown/code text are in the client. Tool/Skill management and Janus context selection intentionally show pending states because their omniAgent HTTP endpoints are not yet wired; the UI never falls back to Janus internal or legacy Chat APIs.
