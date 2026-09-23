# omniAgent UI specification

> Baseline: `main@4a5f74ca60c0859a8727568290b388101cbae6c1`.
> Current implementation path: `apps/agent_app/`.

## 1. UI ownership

omniAgent owns the generic conversational UI. Janus keeps investment-domain User/Admin UI and its independently owned bounded MCP/API surfaces.

The generic UI MUST NOT call legacy Janus generic Chat endpoints directly and MUST NOT fabricate Tool/Skill/Data Source state when corresponding omniAgent management APIs are not available.

## 2. Current implemented screens and states

### 2.1 Sign-in

Current source behavior:

- app requires `OMNIAGENT_GOOGLE_CLIENT_ID` and Chat API base configuration;
- Web uses the Google Sign-In web-rendered button;
- authenticated account state yields a Google ID token;
- ID token is passed to `ChatApi` and used as `Authorization: Bearer ...`.

Current acceptance status: **source implemented, real deployed browser login not yet accepted**.

### 2.2 Thread navigation

Implemented:

- responsive layout;
- wide view: persistent thread list at left;
- narrow view: thread list in Drawer;
- create new thread;
- select existing thread;
- fork current thread;
- display runtime + model + thread id.

### 2.3 New thread

Implemented controls:

- runtime selector: Gemini / OpenRouter / Codex;
- editable model field;
- default model suggestions:
  - Gemini: `gemini-2.5-flash`
  - OpenRouter: `openai/gpt-4o-mini`
  - Codex: `gpt-5`
- create button.

Behavioral rule: runtime/model are fixed by thread. Changing runtime/model requires a new thread or fork semantics permitted by the API.

### 2.4 Chat room

Implemented:

- current runtime/model header;
- event cursor status;
- manual refresh;
- message composer;
- send button;
- queued-turn status;
- queued-turn cancellation;
- event card list.

Current client event behavior:

1. GET `/v1/threads/{id}/events?cursor=...&limit=200`;
2. parse SSE-formatted response after the HTTP response completes;
3. merge by event id / sequence;
4. repeat approximately every two seconds while a thread is selected.

Therefore current UI should be described as **cursor replay + polling**, not accepted continuous streaming.

## 3. Event rendering

| Event | Current UI |
| --- | --- |
| `item_upsert` / message-like payload | rendered as conversation content aligned by role where available |
| `text_delta` | rendered through generic content handling |
| `tool_request` | tool call row |
| `tool_result` | tool result row |
| `approval_request` | approval card with operation, digest, expiry, Allow/Deny |
| `approval_resolved` | status row |
| `citation` | source/citation row |
| `usage` | token usage row |
| `turn_completed` | completed status |
| `turn_cancelled` | cancelled status |
| `turn_error` | failure status |

No event may display secret/provider credential material.

## 4. Tools / Skills / Data Sources panel

Current panel intentionally shows placeholders:

- Tools (MCP): management API not wired; tool events may still be displayed in Chat.
- Skills: storage exists; management API and historical cutover are not wired.
- Data Sources: Janus context may only be selected through authenticated bounded API/MCP.

This is the correct current-state behavior. Placeholder text must not be replaced with fake data or direct reads from Janus internal storage.

## 5. Target information architecture

```text
Sign In
  └─ Chat Shell
      ├─ Threads
      │   ├─ New Thread
      │   ├─ Existing Thread
      │   └─ Fork
      ├─ Conversation
      │   ├─ Messages / streaming output
      │   ├─ Tool events
      │   ├─ Approval requests
      │   ├─ Citations
      │   ├─ Usage
      │   └─ Turn status / cancel
      └─ Controls
          ├─ Runtime / model
          ├─ Tools / MCP
          ├─ Skills
          └─ Data Sources / Janus bounded context
```

## 6. API mapping

| UI action | API |
| --- | --- |
| list threads | `GET /v1/threads` |
| create thread | `POST /v1/threads` |
| read thread | `GET /v1/threads/{threadId}` |
| fork | `POST /v1/threads/{threadId}/fork` |
| send message | `POST /v1/threads/{threadId}/messages` |
| replay/events | `GET /v1/threads/{threadId}/events?cursor=...` |
| queued cancel | `POST /v1/threads/{threadId}/turns/{turnId}/cancel` |
| approval | `POST /v1/threads/{threadId}/turns/{turnId}/approvals/{requestId}` |

Not currently exposed as accepted public APIs:

- Tool/MCP management;
- Skill management;
- Data Source/context management;
- runtime login/session controls for Codex;
- deployment/admin controls.

## 7. Required UI improvements before live cutover

### UI-P0

- deployed Google login acceptance;
- real Chat→Gateway E2E response path;
- runtime-aware cancel/approval;
- owner isolation across thread/event controls;
- clear recoverable error states for auth, unavailable API, unavailable runtime, and expired approval;
- reconnect behavior proven under network interruption.

### UI-P1

- replace two-second polling with accepted streaming/reconnect semantics or explicitly approve bounded polling behavior;
- Tool/MCP management backed by omniAgent APIs;
- Skill revision/state management backed by omniAgent APIs;
- bounded Data Source/context selection backed by authorized Janus integration;
- model metadata/validation so users are not required to know arbitrary model strings;
- logout/account switch behavior;
- accessibility and keyboard-flow review.

## 8. UX state model

Thread/turn UI must distinguish at least:

- `idle`: no thread or no active turn;
- `connecting`: loading/replaying events;
- `connected`: latest replay successful;
- `disconnected`: latest replay failed;
- `queued`: message persisted but runtime has not claimed it;
- `running`: runtime events received;
- `approval_required`: blocked on bound user decision;
- `completed`;
- `cancelled`;
- `error`.

The UI must never present `queued` as if the model is already executing.

## 9. UI acceptance checklist

- [ ] real browser login on deployed origin;
- [ ] unauthenticated user cannot read threads;
- [ ] two owners cannot see or act on each other’s UI-backed data;
- [ ] create/list/select/fork thread pass against real DB;
- [ ] send produces real provider output through the full runtime path;
- [ ] reconnect does not duplicate or skip events;
- [ ] approval allow/deny bind to exact request;
- [ ] cancellation behaves correctly before and after runtime claim;
- [ ] Tool/Skill/Data Source surfaces use real management APIs only;
- [ ] no secret/credential data appears in UI or browser logs;
- [ ] narrow and wide layouts pass basic usability checks;
- [ ] Janus legacy Chat remains available as rollback until cutover is separately approved.
