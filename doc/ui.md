# omniAgent UI specification

> Implementation baseline reviewed: `main@75336a248381d935c7b23dd8afab06f5e9c4151a`.
> Current implementation path: `apps/agent_app/`.
> Architecture revision: 2026-10-07.

## 1. UI ownership

omniAgent owns the generic conversational UI. External domain systems such as Janus remain behind bounded APIs/MCP.

The UI must never receive or display raw provider secrets after submission.

## 2. Current source checkpoint

Current source includes:

- Google ID-token sign-in integration;
- responsive thread navigation;
- new thread runtime/model selection for Gemini / OpenRouter / Codex;
- event replay/cursor status;
- composer/send;
- queued cancellation;
- generic event, approval, citation, usage and terminal-state rendering.

Current event behavior at the reviewed source checkpoint is cursor replay + approximately two-second polling, not accepted continuous streaming.

Direct Groq selection and credential-profile management are not current implementation evidence.

## 3. Target provider and credential UX

For each supported provider/runtime, the owner should be able to see an explicit credential source:

- **Personal / BYOK** — owner-managed credential/profile;
- **Platform** — visible/selectable only when the authenticated owner has platform-credential entitlement.

The UI may show:

- provider;
- credential source class;
- masked profile label;
- configured/not configured/invalid/expired status;
- last validation time where available;
- replace/revoke action for owner BYOK.

The UI MUST NOT show:

- full API keys/tokens after submission;
- secret references intended only for backend use;
- another owner's credential metadata;
- platform credentials to non-entitled owners.

A user's provider selection and credential source do not change the memory namespace; threads/history remain keyed by the authenticated owner.

## 4. Codex UX

Codex should expose status such as:

- Personal auth configured / not configured;
- Platform auth available / unavailable by entitlement;
- login/re-auth required;
- active turn/cancel state.

The UI must not imply that a shared platform Codex credential means a shared Codex session. Session/thread/workspace context remains owner-isolated on the backend.

## 5. Target information architecture

```text
Sign In
  └─ Chat Shell
      ├─ Threads
      ├─ Conversation
      │   ├─ messages / streamed or replayed events
      │   ├─ tools / approvals / citations / usage
      │   └─ turn state / cancel
      └─ Controls
          ├─ Runtime / model
          ├─ Credential source / profile
          ├─ Tools / MCP
          ├─ Skills
          └─ Data Sources
```

## 6. Provider options

Target provider list:

- Gemini;
- OpenRouter;
- Codex;
- Groq.

Groq must remain hidden/disabled or clearly unavailable until backend support exists. UI presence alone must never be used to claim provider readiness.

## 7. Historical conversation UX

The user should experience one logical thread history regardless of whether older payloads have moved to GCS/Iceberg.

Target rules:

- UI queries authorized Chat APIs, not GCS/Iceberg directly;
- hot recent state comes from the operational Chat layer;
- archived historical content may be reconstructed by backend archive readers;
- loading/restoring archived history must preserve owner/thread ordering and show a clear recoverable state on failure;
- an archive failure must not make another owner's history visible.

## 8. Required UI acceptance

- [ ] real browser login on deployed origin;
- [ ] two-owner thread/event isolation;
- [ ] real Chat→Gateway provider response;
- [ ] Personal/BYOK profile add/replace/revoke without secret exposure;
- [ ] Platform option visible only to entitled owners;
- [ ] same platform credential used by two owners without memory/session crossover;
- [ ] Codex owner-isolated session/workspace behavior;
- [ ] Groq UI only after backend provider support;
- [ ] reconnect without duplicate/missing events;
- [ ] approval and cancellation bind to exact owner/turn/request;
- [ ] archived history reconstructs through authorized backend path;
- [ ] no raw secret appears in browser logs, rendered events, analytics payloads or crash reports.
