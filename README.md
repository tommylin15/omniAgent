# omniAgent

Phase 1 copy-first checkpoint from Janus `555712b34e85e6403ed400b8e2cece1791569d7e`. The Agent Gateway and its provider/bridge tests build independently here; Janus still owns all live routes, data, and deployment. This is **not** a cutover or a complete assistant application.

Run `npm ci`, `npm run build`, and `npm test` from this repository. The copied gateway retains Janus-specific compatibility names and signed internal routes. Do not deploy it as an independent service until the wire/auth boundary and runtime ownership are reviewed in later phases.

See [architecture](docs/architecture.md), [migration status](docs/migration-from-janus.md), and [Janus connector](docs/janus-connector.md).
