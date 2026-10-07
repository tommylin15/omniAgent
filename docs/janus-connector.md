# External Janus connector — bounded integration only

This file describes one optional external-domain adapter owned by omniAgent. It is **not** a source of truth for omniAgent runtime, credentials, deployment or storage ownership.

`services/agent-gateway/janus_context_client.ts` is the omniAgent-side bounded HTTP client. It must use authenticated, approved API/MCP contracts and must never import Janus internals or read Janus PostgreSQL/GCS/Iceberg directly.

Security requirements:

- each user-scoped request carries only the request-scoped external user credential required by the approved contract;
- service-to-service calls use an approved omniAgent runtime identity and configured audience;
- multi-owner processes must not store one user's external token in global MCP configuration;
- owner/thread/turn binding, expiry, provenance/as-of, payload bounds and storage-locator rejection remain mandatory;
- live acceptance must be proven from omniAgent runtime requests and responses, not by reading the external repository.

If the external integration is unavailable, omniAgent must expose that state truthfully and continue to keep its own Chat/memory/credential/storage ownership independent.
