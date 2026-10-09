# Production promotion — 2026-10-09

User explicitly authorized promoting the latest GHCR candidates to formal traffic.
Release SHA: 1a8e575bb9f6224e698765d268c6e823e94ba55a.
CI/candidate/smoke: GitHub Actions 37932371785 / 37932955708 / 37933132998 success, freshly read from tommylin15/omniAgent.

## Verified formal allocation

- Chat: omniagent-chat-00039-rik, 100%, Ready=True.
- Gateway: omniagent-agent-gateway-00030-coy, 100%, Ready=True.
- Shared: omniagent-shared-codex-00019-puf, 100%, Ready=True.

All three live image digests matched the successful candidate deployment log.
Chat digest: sha256:ccfa11d998bc8ffd73d1567845c89d252113ef33c068f2096cc0aff2a6f12ad9.
Gateway digest: sha256:f50d2848a4a1a771852f21ea56b03216668e4dc9139f12c2155a487e6e794f9d.
Shared digest: sha256:0f26de114b3de01f783047092cecced86b09475f22e9f92408da60a508b7c262.

Production Chat https://omniagent-chat-2oo7qbkd5q-uc.a.run.app:
/health 200; /ready 200; / 200; /main.dart.js 200; anonymous /v1/threads 401.

## Routing incident

Gateway initial update returned failure because historical tag ghcr-7937447dd85e pointed to revision 00021-boq whose referenced omniagent-bundle version 2 is DESTROYED. This demonstrates that command failure alone cannot establish unchanged routing. Saved failure readback; removed that one invalid historical tag, retried pinned allocation successfully. No revision, Secret, image or application data deleted.

## Evidence and limits

Before: production-promotion-2026-10-09-before.json.
Failure: production-promotion-2026-10-09-gateway-failure.json.
After: production-promotion-2026-10-09-after.json.

This user-authorized traffic promotion does not mark outstanding application gates PASS. Dispatch enablement, owner entitlement, Codex owner Secret mapping, real Chat provider execution, persisted SSE replay and approval/cancel/reconnect acceptance remain unverified. No billable inference, Secret payload read, revision retention or legacy resource retirement was performed. No actual production rollback rehearsal was performed. Prior GHCR candidate set f9a4a7b: Chat 00038-yog, Gateway 00029-ter, Shared 00018-poq remains available in the saved tagged inventory, but rollback health must be revalidated before use.
