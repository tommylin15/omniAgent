# omniAgent

Phase 2 contract/security ownership checkpoint, following the Phase 1 copy from Janus `555712b34e85e6403ed400b8e2cece1791569d7e`. The Gateway and tests build independently; Janus still owns all live routes, data, and deployment. This is **not** a cutover or a complete assistant application.

Run `npm ci`, `npm run build`, and `npm test` from this repository. `packages/contracts/agent.v1.json` owns generic Agent envelopes and `agent_security.ts` owns generic approval/egress checks; Janus retains its context wire and domain policy. The copied gateway still has Janus-specific compatibility names and routes. Do not deploy it independently until auth and runtime integration are validated.

See [architecture](docs/architecture.md), [migration status](docs/migration-from-janus.md), and [Janus connector](docs/janus-connector.md).
