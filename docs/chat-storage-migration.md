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
