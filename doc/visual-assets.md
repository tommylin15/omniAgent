# omniAgent visual asset registry

> Visual-direction source of record: Google Drive `OmniAgentGPT/UI_Visual_Contract`.
> This registry is documentation only. It does not place binary assets into `apps/agent_app` and is not implementation evidence.

## Approved visual references

### Twin Beast original main visual

- role: canonical direction reference supplied by the user;
- composition: paired Twin Beasts as the emotional/brand center;
- target use: character identity, warmth, rounded/chibi polish, companion feeling;
- storage: embedded in the Drive document `omniAgent UI Visual Contract — 雙生獸主視覺`.

### omniAgent-adapted main visual

- role: approved Omni UI-v1 visual-direction candidate;
- composition: Twin Beasts remain central while home/calendar symbolism is replaced with AI / Chat / Agent motifs;
- target use: UI-v1 sign-in/empty-state direction, onboarding/hero reference, future app/PWA asset derivation;
- storage: embedded in the same Drive document.

Drive document:

- folder: `OmniAgentGPT/UI_Visual_Contract`;
- document ID: `1HxL8Kr_jOgWRo3_vzt4RQ526V-vOzdwLUY1FYYt1OOo`;
- title: `omniAgent UI Visual Contract — 雙生獸主視覺`.

## Implementation contract

Codex must follow `doc/ui.md` and GitHub Issue #1.

The approved images are visual references, not proof that production Flutter assets exist. The UI implementation must preserve all current Chat API routes, payload behavior, event cursor/replay, approval binding, queued cancellation, authentication semantics, and `packages/contracts/agent.v1.json`.

Do not fabricate missing backend/provider functionality to match the visuals.

## Production asset work still required

Before the visuals are considered implementation-ready assets:

- ingest approved binaries into the Flutter asset tree through the development flow;
- register assets in `pubspec.yaml`;
- create responsive and transparent variants;
- create small-size icon/PWA/favicon variants;
- establish dark-mode handling;
- compress/optimize without visible degradation;
- add widget/snapshot/accessibility coverage as appropriate;
- run Flutter analyze/test/build;
- validate on real browser/mobile breakpoints.

## Known visual gaps

1. The formal Twin Beast character sheet is not frozen; the current Omni candidate still contains notable warm-gold/deep-blue accents rather than a strictly locked silver-white/gray-black palette.
2. Only a square 1:1 hero is approved.
3. Waiting, working, approval, success, error and empty-state variants are missing.
4. No dark-mode visual is approved.
5. omniAgent-specific iconography is still generic AI/chat/tool language.
6. Wordmark + mascot lockups and safe-area rules are not frozen.
7. Accessibility contrast and focus-state validation are pending.
8. Real-device visual acceptance is pending.

## Status rule

This registry and the Drive visual source are design evidence only. They must not be used to claim UI-v1 implementation, CI, deployment, live browser acceptance, or overall omniAgent completion.
