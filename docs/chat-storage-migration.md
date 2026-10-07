# omniAgent Chat storage ownership and optional legacy import

## Current ownership

omniAgent owns its Chat operational state and schema. Current storage implementation and acceptance are proven only from this repository and omniAgent runtime evidence.

Target lifecycle:

- PostgreSQL: hot operational truth for owners, threads, turns, events, approvals, queue/dispatch state, credential metadata and references.
- GCS: large immutable payloads/artifacts when introduced and accepted.
- Iceberg: asynchronous historical/audit/analytics archive when introduced and accepted.
- BigQuery/BigLake: optional analytics only with explicit resource/cost approval.

Iceberg or analytics storage must never become the source of truth for live QUEUED/RUNNING/APPROVAL/terminal state.

## Database gate

Before Chat Cloud Run acceptance:

1. create/verify an omniAgent logical database and least-privilege role;
2. apply `infra/postgres/migrations/001_chat_ownership.sql` and `002_skill_storage.sql`;
3. prove schema ownership and read/write behavior with runtime evidence;
4. inject `CHAT_DATABASE_URL` through the approved omniAgent secret/config path;
5. verify owner isolation and recovery behavior.

Missing live database values must be reported, not inferred.

## Dev bootstrap contract

The dev Chat database is an omniAgent-owned database boundary even when its PostgreSQL host is an approved shared dev compute host.

- Database: `omniagent_chat`.
- Login role: `omniagent_chat_app`; no superuser, createdb, createrole, or replication privilege.
- Runtime Secret: `omniagent-chat-db`; its payload is the PostgreSQL DSN used only for `CHAT_DATABASE_URL`.
- Provider secrets remain in `omniagent-provider-bundle`; database and provider credentials are not combined.
- PostgreSQL runtime uses its own container, data directory, immutable image, port, HBA file and bounded firewall rule.
- Host subnet/CIDR is discovered at bootstrap time; it is not copied into source as a fixed external-system value.
- `001_chat_ownership.sql` and `002_skill_storage.sql` are applied transactionally and then verified for schema ownership, least-privilege role properties and rollback-safe read/write behavior.
- The Chat candidate uses Direct VPC egress with `private-ranges-only`. `GET /ready` must prove a live DB connection before the no-traffic revision can pass acceptance.
- Bootstrap CI access is temporary and must be revoked after DB creation/candidate deployment; runtime Secret access, image-pull access and the bounded DB firewall rule remain.

The historical `omniagent-bundle` reference on the current live Chat revision is not the target DB Secret. Do not mutate its `latest` value to stage this migration.

## Optional legacy history import

If historical data from an external system is explicitly required:

1. obtain a reproducible read-only export through that system's approved export/reader interface;
2. map external identities to omniAgent owners using verified identifiers;
3. copy into staging/import structures;
4. reconcile counts, digests, ordering and owner isolation;
5. preserve the external source until acceptance is complete;
6. never access the external system's DB/GCS/Iceberg directly from omniAgent.

A historical import is optional migration work; it is not a prerequisite for omniAgent to own new Chat state unless an approved acceptance criterion explicitly says otherwise.

## Rollback

Before any write-routing change, prove a rollback that restores a known-good omniAgent revision without corrupting omniAgent Chat state. Do not use another project's runtime as the default rollback mechanism.
