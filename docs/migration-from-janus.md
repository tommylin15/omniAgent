# Historical migration note — Janus → omniAgent

This file is retained only as migration history. It is **not** an active source for omniAgent deployment, credentials, runtime state, storage ownership or completion.

The generic Chat/Gateway/UI ownership targeted by the original split now belongs to omniAgent source. Current implementation and acceptance must be read from omniAgent code, `doc/`, active `docs/` control files, GitHub Actions and omniAgent runtime evidence.

Any remaining Janus relationship is an **external bounded integration** only. omniAgent must not import Janus internals or read its DB/GCS/Iceberg directly. If a future migration needs historical external data, use the approved export/import process in [chat-storage-migration.md](chat-storage-migration.md).

Do not use historical Janus revisions, images, credentials, Secret names, deployment scripts or repository state to fill missing omniAgent values.
