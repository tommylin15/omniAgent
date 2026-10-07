# Chat ownership, storage lifecycle, and historical data gate

> Architecture revision: 2026-10-07.
> This file preserves the Janus→omniAgent ownership migration gate while adding the approved steady-state storage direction.

## 1. Current migration boundary

omniAgent owns the target `omni_chat` schema and Chat API source. `infra/postgres/migrations/001_chat_ownership.sql` and `002_skill_storage.sql` are for an independent omniAgent database. The recorded checkpoint does not prove those migrations are applied to a live omniAgent database.

Janus remains the recorded live writer until a separately accepted cutover. No document change here authorizes routing, credential, IAM, bucket, database, or production-resource changes.

Historical Janus data must be copied only through an approved export/reader path. omniAgent must not directly read Janus PostgreSQL, GCS, Iceberg, or internal source packages.

## 2. Steady-state omniAgent storage model

The target storage design is intentionally tiered.

| Layer | Role | Source-of-truth rule |
| --- | --- | --- |
| PostgreSQL / `omni_chat` | owners, threads, turns, current events, approvals, Skills, dispatch state, cursors, idempotency, summaries, archive pointers | authoritative for live operational state |
| GCS artifact/object layer | large message bodies, attachments, tool/worker output, exports and other large immutable payloads | authoritative for the referenced object after write/digest verification |
| Iceberg on GCS | long-term conversation/event history, worker/tool execution history, usage/cost telemetry, audit/analytics records | historical archive after archive/reconciliation acceptance |
| BigLake/BigQuery target | analytics/query over historical lakehouse data | analytical view; never the live turn state machine |

This design does **not** replace PostgreSQL with Iceberg for the Chat hot path.

## 3. Large text and artifact policy

PostgreSQL can retain normal recent Chat text and event data. Long-term scale will be controlled by lifecycle policy, not by moving every message directly to Iceberg at write time.

The target pattern is:

1. persist the user/turn/event transaction in PostgreSQL;
2. for payloads above a future approved threshold, store the large immutable body/artifact in GCS and persist an owner-bound reference + digest + size/media metadata;
3. asynchronously archive eligible event/history records to Iceberg;
4. verify archive completeness and digests before any hot-data pruning;
5. retain enough owner/thread/turn metadata and archive references to reconstruct authorized historical conversations.

Thresholds, hot-retention duration, compaction cadence, snapshot expiry, and deletion policy remain **TBD by measurement**. No 30/60/90-day value is approved by this document.

## 4. Iceberg layout direction

Candidate archive datasets include conversation events, worker executions, tool executions, provider usage, approval audit, task/workflow history, and other immutable research telemetry.

Every archive record must preserve `owner_id` and stable source IDs. However, physical partitioning SHOULD avoid a separate partition for every owner. The preferred starting design is time-based partitioning such as `days(event_time)` plus a bucket/hash transform on `owner_id`, then tune from actual file-size and query evidence.

Small-file compaction, snapshot expiration, retention, and BigQuery/BigLake query integration are operational work items, not assumptions of completion.

## 5. Credential data is excluded from the lake

Neither PostgreSQL Chat content nor GCS artifacts nor Iceberg historical rows may contain raw provider secrets.

Target credential architecture is BYOK + platform credentials:

- owner/provider credential metadata and secret references may be stored in PostgreSQL;
- raw provider key/token/auth bundle lives only in an approved secret store;
- an entitled owner may use a platform credential without sharing memory with any other owner;
- experiment/audit rows may record `credential_source=owner|platform` and a non-secret profile identifier, but never the secret.

Codex auth/session state receives the same treatment and additionally requires owner-isolated execution directories/session/thread/workspace state.

## 6. Historical Janus migration sequence

If approved cutover requires historical Janus Chat/Skill copy:

1. take a reproducible, read-only Janus export/snapshot through the authorized Janus export/reader path;
2. produce owner-scoped manifests containing counts, sequence ranges, source snapshot IDs and payload digests, without credentials;
3. verify each Google issuer+subject ↔ Janus user mapping before setting any legacy link;
4. copy non-destructively into the independent omniAgent destination while preserving stable IDs/order where required;
5. verify counts/digests, approvals, event replay order, skill revisions/state, orphan references, and explicit exceptions;
6. preserve Janus source data throughout validation;
7. perform real dev owner/auth/runtime/rollback acceptance before any routing or write-ownership switch.

The existing Janus export may not include every relational index required for deterministic reconstruction; missing fields must be reported rather than inferred.

## 7. Cutover and rollback rule

A successful archive pipeline, a successful local migration test, or a successful provider call does not prove writer cutover readiness.

Before omniAgent becomes the live Chat writer, acceptance still requires:

- independent live database/role and applied migrations;
- durable Chat→Gateway execution;
- real browser identity and multi-owner isolation;
- BYOK/platform credential isolation if those modes are enabled;
- Codex execution isolation if Codex is enabled;
- event replay/reconnect;
- historical copy reconciliation when required;
- tested rollback/reverse-sync for post-cutover writes;
- explicit routing/write-ownership approval.

No destructive historical deletion is authorized by this document.
