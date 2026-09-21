# Architecture — Phase 1

`services/agent-gateway` contains the copied Codex bridge, Gemini/OpenRouter adapters, MCP Host, and internal HTTP runtime. `packages/contracts/assistant.v1.json` is a compatibility copy, including Janus context definitions and domain approval denials; it is not yet the final generic wire contract. Tests run without a Janus source checkout.

Janus remains the owner of investment data, bounded context API/MCP, authentication, Chat API/storage, User/Admin UI, and the currently deployed gateway. omniAgent must consume Janus only through a future authenticated bounded API/MCP contract; it must not import Janus internals or access its PostgreSQL, GCS, or Iceberg directly. No cross-project runtime integration is claimed in this phase.
