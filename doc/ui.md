# omniAgent UI Visual Contract

> UI source baseline: `main@12a94018debd11f5b389aa2fdf325339782bb9d8`; Flutter run `37625912746` PASS. Current repo also contains later omniAgent Gateway/deployment ownership cleanup validated by Node Core run `37628904846`.
> Current implementation path: `apps/agent_app/`.
> Contract revision: 2026-10-07.
> This document is the implementation contract for the first visual redesign. It does not change backend/API ownership, provider readiness, storage semantics, or completion status.

## 1. Product UI objective

omniAgent owns the generic conversational and agent UI. The first visual redesign must make the product feel **warm, cute, calm, companion-like, and trustworthy** while preserving the existing engineering truth and runtime boundaries.

The target tone is:

- warm-cozy rather than cold enterprise tooling;
- rounded and friendly rather than childish;
- light fantasy / companion feeling rather than game HUD;
- Chat-first rather than control-panel-first;
- advanced controls progressively disclosed rather than permanently occupying the main surface;
- explicit unavailable / partial states rather than fabricated capability.

External systems such as Janus remain behind bounded authenticated API/MCP contracts. The UI must never read Janus storage directly and must never imply that an unavailable backend feature is ready.

## 2. Non-negotiable implementation boundary for UI v1

UI v1 is a **visual and information-architecture refactor of the existing Flutter client**.

Codex MUST preserve the current core behavior and API contract unless a separate approved backend task changes them.

Do not change in this UI task:

- `ChatApi` route ownership or base URL behavior;
- `/v1/threads` create/list/fork semantics;
- `/v1/threads/{thread}/messages` message submission semantics;
- event cursor/replay semantics;
- approval request binding or approval payload fields;
- queued-turn cancellation semantics;
- runtime/model request fields;
- `assistantProfile: default`;
- owner/authentication contract;
- `packages/contracts/agent.v1.json`;
- backend/provider/storage implementation;
- Janus integration boundaries.

Current event delivery remains persisted cursor replay plus polling at the reviewed checkpoint. UI v1 may redesign how connection state is presented, but it must not claim continuous production streaming has been accepted.

## 3. Brand character: the novel Twin Beasts

The omniAgent mascot is the user's **novel Twin Beasts（雙生獸）**.

Current canon-safe visual baseline for product use:

- one twin is **gray-black**;
- one twin is **silver-white**;
- they are a paired visual identity and should feel mutually responsive;
- all anatomy, markings, eye color, materials, names, powers, lore, or personality details not already canonized in the novel MUST NOT be invented by the product implementation.

The mascot is not a provider avatar. Gemini, OpenRouter, Codex, Groq, or any future provider must never replace the Twin Beasts as omniAgent's product identity.

### 3.1 Product-role mapping

The twins may visually support a loose functional duality:

- **observe / think / remember / plan**;
- **act / execute / coordinate / use tools**.

This is UI symbolism only. It must not redefine the novel's canon or assign new lore.

### 3.2 Mascot usage rules

Use the Twin Beasts sparingly and intentionally:

- sign-in / welcome surface;
- empty conversation state;
- new-thread onboarding;
- waiting / thinking / working micro-state;
- approval-required state;
- success / empty / recoverable error state;
- compact brand mark in navigation.

Do not place large mascot artwork beside every message. The conversation content remains primary.

### 3.3 Approved visual reference and asset rule for UI v1

A user-supplied Twin Beast main visual and an omniAgent-adapted candidate visual now exist as the approved **visual-direction references** for UI v1.

Drive source of record:

- folder: `OmniAgentGPT/UI_Visual_Contract`;
- document: `omniAgent UI Visual Contract — 雙生獸主視覺`;
- Drive document ID: `1HxL8Kr_jOgWRo3_vzt4RQ526V-vOzdwLUY1FYYt1OOo`;
- the document embeds both the original Twin Beast visual and the Omni-adapted visual plus the known-gap review.

The Omni-adapted visual changes the surrounding lifestyle/home-calendar emphasis into AI / Chat / Agent motifs while keeping the Twin Beasts as the product identity.

Current implementation rule:

- the reference images are approved for visual direction, but are not yet production assets in `apps/agent_app`;
- Codex should use the Drive reference when replacing the mascot slot during UI v1 implementation;
- do not invent new permanent anatomy, markings, names, powers, lore, or unrelated mascot substitutions;
- production asset ingestion, variants, compression, `pubspec.yaml` registration, PWA/favicon outputs, and responsive crops belong to the Codex implementation flow and require build/test evidence;
- until those assets are actually present in the Flutter source, keep any development placeholder structurally replaceable.

## 4. Visual direction

### 4.1 Core style

Working design language:

**Warm Cozy / 奶油杏桃 / rounded but not childish / Twin Beast companion / Chat-first / progressive disclosure**

The interface should feel comfortable enough for long sessions while still clearly being a capable agent workspace.

### 4.2 Base palette

Initial visual tokens:

| Token | Value | Intended use |
| --- | --- | --- |
| Warm canvas | `#FFF8F0` | main page background |
| Soft surface | `#FFFDFC` | cards, conversation panels |
| Apricot primary | `#F3A683` | primary actions and selected accents |
| Sage secondary | `#AFC8A8` | calm status/supporting accents |
| Milk-tea neutral | `#EADBC8` | borders, muted surfaces, chips |
| Cocoa text | `#443A36` | primary text |
| Muted cocoa | `#756964` | secondary text |
| Error foreground | use accessible Material semantic error role | destructive/error state |
| Success foreground | use accessible Material semantic success role where implemented | completed state |

These values establish direction, not permission to sacrifice contrast. Text, controls, disabled states, focus indicators, and status chips must remain readable and accessible.

Provider brand colors should not dominate the shell. Provider identity is metadata, not the product brand.

### 4.3 Shape and spacing

- large shell/card radius: 20–24 px;
- normal card radius: 16–20 px;
- input/button radius: 14–18 px;
- chip radius: pill or 12–16 px;
- favor 8 / 12 / 16 / 24 / 32 spacing rhythm;
- shadows must be subtle and low-contrast;
- prefer surface separation, padding, and border tone over heavy elevation.

### 4.4 Typography

Use the platform/default Flutter text stack for UI v1 unless a separately approved bundled font is introduced later.

Requirements:

- prioritize Traditional Chinese and English readability;
- titles may be slightly softer/heavier;
- body copy remains neutral and highly legible;
- code remains monospace/selectable;
- do not use playful display fonts for normal chat or settings.

### 4.5 Motion

Motion should communicate state, not decorate continuously.

Target:

- 150–250 ms transitions for drawers, sheets, chips, and state changes;
- subtle pulse/breathing treatment may be used for waiting/working states;
- no constant bouncing mascot;
- honor reduced-motion accessibility settings where practical;
- no animation may delay approval, cancel, send, or navigation actions.

## 5. Information architecture

Target shell:

```text
Sign In
  └─ Chat Shell
      ├─ Thread Navigation
      ├─ Conversation
      │   ├─ user / assistant content
      │   ├─ status / tool / citation / usage events
      │   ├─ approval request
      │   └─ queued / cancel / terminal state
      └─ Progressive Controls
          ├─ Runtime / model
          ├─ Credential source / profile [future API]
          ├─ Tools / MCP [future management API]
          ├─ Skills [future management API]
          └─ Data Sources [bounded integrations]
```

The primary user journey is always:

**choose/open conversation → talk → see agent state → approve/cancel only when needed.**

Infrastructure controls must not compete visually with the conversation.

## 6. Responsive layout contract

### 6.1 Desktop / wide

For widths at or above the existing wide breakpoint, UI v1 should use:

- left navigation rail/panel for threads;
- central conversation column;
- optional advanced-controls surface opened on demand rather than permanently consuming a third column in v1.

The current breakpoint behavior may remain technically simple. Do not introduce a layout rewrite that risks route/API behavior merely to achieve a three-column desktop view.

### 6.2 Mobile / narrow

Mobile is conversation-first:

- thread list in Drawer or equivalent existing navigation;
- provider/model and advanced controls in modal bottom sheet;
- composer stays reachable above safe area;
- approval actions remain easy to tap;
- status text must wrap without horizontal overflow.

Do not show a permanent right-side settings panel on mobile.

## 7. Screen contracts

### 7.1 Sign-in / unauthenticated screen

Target presentation:

- warm canvas;
- compact omniAgent wordmark;
- Twin Beast mascot slot;
- concise welcome line;
- existing Google sign-in control;
- existing explicit "登入或 API 尚未設定" state when configuration is absent.

Do not conceal configuration failure behind a decorative loading state.

### 7.2 Empty / new conversation state

Replace the current form-only center state with a welcoming card.

Suggested hierarchy:

1. mascot slot;
2. short greeting such as「今天想一起完成什麼？」;
3. runtime selector;
4. model field;
5. primary「建立對話」action;
6. short helper copy explaining that runtime/model are fixed to the created thread.

UI v1 supports only the currently implemented runtime values:

- Gemini;
- OpenRouter;
- Codex.

Groq must remain absent/disabled until backend/provider contract support exists.

### 7.3 Thread navigation

Each thread item should emphasize human-recognizable metadata over raw IDs:

- runtime/model as primary or supporting label;
- selected state with warm surface/accent;
- raw `thread_id` may remain available in subdued technical text or future details, but should not dominate the list.

The existing thread selection behavior must remain unchanged.

### 7.4 Conversation header

Show:

- current runtime/model;
- connection/replay status in human-readable language;
- fork action;
- refresh/retry action where applicable;
- control/settings entry point.

Technical cursor information may remain available as subtle secondary/debug text, but「事件游標 42」should not be the dominant human status.

### 7.5 Conversation content

User and assistant messages should be visually distinct without becoming cartoon speech bubbles.

Recommended:

- user content aligned toward the user side with a soft apricot-neutral surface;
- assistant content aligned toward the assistant side with warm white/sage-neutral surface;
- comfortable max-width and readable line length on desktop;
- selectable Markdown/code behavior preserved;
- no provider logo used as the assistant avatar.

The Twin Beasts may appear only as a small omniAgent identity marker, not repeated as large artwork per assistant message.

### 7.6 Agent state language

Backend/event truth remains unchanged, but visible wording may become warmer.

Preferred visible mapping:

| Runtime truth | User-facing presentation |
| --- | --- |
| queued | 「已排隊，準備開始」 |
| connecting | 「正在連接工作環境…」 |
| connected / active | 「正在一起處理」 or neutral active indicator |
| tool_request | 「正在使用工具」 |
| tool_result | 「工具已回傳結果」 |
| approval_request | 「需要你確認一件事」 |
| approval_resolved | 「確認狀態已更新」 |
| turn_completed | 「完成」 |
| turn_cancelled | 「已取消」 |
| turn_error | 「這次沒有完成」 |
| disconnected | 「連線暫時中斷，可重新載入」 |

Friendly language must never hide failure, approval scope, expiration, or cancellation semantics.

### 7.7 Approval card

Approval is a safety-critical surface and overrides decorative simplification.

The card must preserve:

- exact operation;
- params digest;
- expiry if available;
- reject action;
- allow action;
- locked/submitting state.

Visual treatment may use the Twin Beasts in a small「需要你確認」state, but the technical operation details must stay readable.

### 7.8 Tool / citation / usage events

Keep them compact and collapsible-looking rather than giving them the same visual weight as normal conversation.

- tool request/result: tool icon + concise title;
- citation: link/source treatment;
- usage: compact metadata;
- terminal state: status row/chip.

Do not fabricate tool names or usage values when payload fields are absent.

### 7.9 Composer

The composer is a primary product surface.

Requirements:

- rounded warm surface;
- clear focus state;
- multiline 1–5 lines remains supported;
- send button remains visible and accessible;
- disabled/busy state is explicit;
- queued cancel remains a separate user-controlled action;
- keyboard submit behavior must remain compatible with existing tests/behavior.

## 8. Advanced controls and progressive disclosure

The existing Tools / Skills / Data Sources bottom sheet is retained as the baseline interaction model for UI v1.

It should be visually upgraded but must continue to state implementation truth:

- MCP management API not wired → say so;
- Skill management API/history not cut over → say so;
- Janus context only through bounded authenticated API/MCP → say so.

Future credential UI may expose Personal/BYOK and entitled Platform modes only after the matching API exists.

Never create clickable controls that imply a backend action which does not exist.

## 9. Provider and credential UX target

For each supported provider/runtime, future UI should show an explicit credential source:

- **Personal / BYOK**;
- **Platform** only when entitlement exists.

Allowed non-secret metadata:

- provider;
- credential source class;
- masked profile label;
- configured / invalid / expired / unavailable state;
- last validation time;
- replace/revoke for owner BYOK when the API exists.

Never display:

- full API keys/tokens after submission;
- backend-only secret references;
- another owner's credential metadata;
- platform credential options to non-entitled owners.

Credential source never changes the memory namespace.

## 10. Codex UX target

Codex may eventually expose:

- Personal auth configured / not configured;
- Platform auth available / unavailable by entitlement;
- login/re-auth required;
- active turn/cancel state.

UI wording must never imply that shared platform Codex authorization means shared session, thread, workspace, tools, or memory.

This UI v1 task does not implement new Codex auth behavior.

## 11. Historical conversation UX target

The user should experience one logical thread regardless of hot/archive storage location.

Rules:

- Flutter queries authorized Chat APIs only;
- Flutter never reads GCS/Iceberg directly;
- archived content restore state must be explicit and recoverable;
- ordering and owner authorization must be preserved;
- archive failure must never expose another owner's history.

This is a target UX contract, not evidence that archive reconstruction is implemented.

## 12. Accessibility and trust

UI v1 must retain:

- semantic buttons/tooltips where applicable;
- readable contrast;
- keyboard operability for core desktop flows;
- minimum comfortable tap targets on mobile;
- visible focus/disabled/error states;
- selectable message/code text;
- no color-only indication for critical success/error/approval state.

The warm/cute direction must never make safety-critical information ambiguous.

## 13. UI v1 Codex implementation order

Codex should implement the first pass from the existing `apps/agent_app` source in this order:

1. Introduce centralized visual tokens/theme in Flutter without changing API behavior.
2. Restyle unauthenticated/sign-in surface.
3. Restyle new-thread empty state.
4. Restyle thread navigation and selected state.
5. Restyle conversation header and connection/status wording.
6. Restyle message surfaces, event rows, approval card, queued state, and composer.
7. Restyle the existing Tools / Skills / Data Sources bottom sheet.
8. Add a replaceable Twin Beast mascot-slot component and temporary paired abstract placeholder only if no approved artwork exists.
9. Keep existing route/payload behavior unchanged.
10. Update/add widget tests only as required for visual structure/accessibility while preserving current behavioral assertions.
11. Run:
    - `flutter pub get`;
    - `flutter analyze lib test`;
    - `flutter test`;
    - `flutter build web`.
12. Report exact commit/test evidence separately; passing local source checks is not live acceptance.

## 14. UI v1 implemented source scope

The implemented source scope is primarily:

- `apps/agent_app/lib/main.dart`;
- `apps/agent_app/lib/chat_page.dart`;
- new presentation-only theme/widget files under `apps/agent_app/lib/` if useful;
- `apps/agent_app/test/chat_widget_test.dart` or new UI widget tests;
- `apps/agent_app/pubspec.yaml` only if a presentation-only dependency/asset declaration is truly required.

Avoid touching:

- `services/`;
- database/migrations;
- infra/deploy configuration;
- `packages/contracts/agent.v1.json`;
- authentication/backend semantics;
- Janus code/storage.

Any required change outside the presentation layer must stop and be reported as a separate dependency rather than silently expanding scope.

## 15. UI v1 acceptance checklist

### Visual

- [x] Warm Cozy / 奶油杏桃 visual direction is implemented in source.
- [x] Twin Beast identity is present through a replaceable mascot slot.
- [x] No non-canon permanent Twin Beast details were invented.
- [x] Main screen remains Chat-first.
- [x] Advanced controls use progressive disclosure.
- [ ] Desktop and mobile remain usable.
- [x] Provider branding does not override omniAgent identity.

### Behavioral regression

- [x] Google sign-in/config state behavior preserved by source/tests.
- [x] Existing `/v1/threads` route behavior preserved.
- [x] thread create/select/fork preserved.
- [x] message send preserved.
- [x] queued state and cancel preserved.
- [x] event cursor/replay merge semantics preserved.
- [x] approval exact request/digest behavior preserved.
- [x] tool/citation/usage rendering preserved.
- [x] Markdown/code selectable rendering preserved.
- [x] no external legacy Chat route introduced.

### Build/test

- [x] `flutter analyze lib test` PASS — run `37625912746`.
- [x] `flutter test` PASS — run `37625912746`.
- [x] `flutter build web` PASS — run `37625912746`.
- [x] exact UI source commit recorded: `12a94018debd11f5b389aa2fdf325339782bb9d8`.
- [x] no secret or real endpoint value committed in UI slice.

## 16. Live acceptance remains separate

A visually complete UI v1 is not production completion.

Still required separately according to SPEC/TODO:

- deployed browser login;
- two-owner isolation;
- real Chat→Gateway dispatch;
- durable dispatcher;
- credential resolver / entitlement;
- provider E2E;
- approval/cancel/reconnect/MCP E2E;
- archive/storage lifecycle where applicable;
- final routing/cutover/rollback evidence.

Do not label the system complete merely because this Visual Contract has been implemented.


## 17. Visual asset gaps and follow-up

The current main visual is sufficient to start UI v1 implementation, but the asset set is not complete.

Known gaps:

1. **Character canon sheet** — formal silver-white / gray-black palette, markings, horn/ear/tail proportions, accessories and small-size silhouette are not yet frozen. The current Omni candidate still carries substantial warm-gold and deep-blue accents.
2. **Responsive variants** — only a square 1:1 main visual is approved. Wide hero, mobile onboarding, transparent mascot-only, monochrome mark, and compact 16/32/48 px assets are still missing.
3. **State variants** — waiting, working/tool use, approval, success, recoverable error and empty-state poses/illustrations are not yet produced.
4. **Dark mode** — no approved dark-background treatment exists.
5. **omniAgent-specific symbol language** — chat/tool/knowledge motifs are currently generic; a distinct omniAgent icon/symbol system is still open.
6. **Wordmark lockup** — the fixed relationship between the `omniAgent` wordmark and Twin Beasts for app icon, sign-in, sidebar and PWA/favicon has not been approved.
7. **Accessibility validation** — contrast, focus/disabled states, approval/error semantics, keyboard and screen-reader behavior still need implementation-level verification.
8. **Real-device validation** — long chat, tool events, approvals, code blocks, mobile keyboard/composer and browser breakpoints are not yet accepted on deployed UI.
9. **Production asset pipeline** — the reference images are stored in Drive but are not yet checked into `apps/agent_app`, registered in Flutter assets, optimized, variant-generated or tested.
10. **UI implementation status** — this document and Issue #1 remain implementation instructions; they do not prove that Flutter source, CI, deployment or live acceptance has passed.
