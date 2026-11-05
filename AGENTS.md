# AGENTS.md · 조상님 단톡쓰신다

## Purpose
This repository is a **browser-based episode editor for historical parody Shorts**. The user should mainly review and tweak generated episodes. AI agents should prepare episode files, scene templates, and reviewable GitHub changes.

## Read before modifying
1. `docs/studio/ARCHITECTURE.md`
2. `episodes/manifest.json` and the target episode's `episode.json`
3. Only the scene files and renderer code relevant to the requested change
4. `index.html` only when fixing the legacy chat player or bridge

## Existing behavior is sacred
- `index.html` is the original single-file DSL player and WebM recorder. Do not rewrite or replace it just to add new studio scene types.
- Legacy localStorage `history-chat-story-v1` and IndexedDB `history-chat-player-assets-v1` must remain readable.
- Studio localStorage: `josa-studio:v1:draft:<episodeId>`. Images: `josa-studio-assets-v1` IndexedDB keyed by episode ID.
- Never silently overwrite an episode's local draft when updating GitHub sources. Never delete other episodes' drafts in a reset.

## File responsibilities
- `episodes/manifest.json`: published episode index
- `episodes/<id>/episode.json`: ordered scene references, duration, styles, episode settings
- `episodes/<id>/scenes/*`: individual scene content (Markdown or chat)
- `episodes/<id>/assets/*`: repository-tracked media
- `studio/renderer.js`: reusable scene renderers
- `studio/app.js`: episode workspace, visual editor, local drafts, timeline, preview
- `studio/zip.js`: portable review bundle export
- `studio.html`: new editor route
- `docs/studio/ARCHITECTURE.md`: authoritative design contract

## Agent workflow
- Prefer **editing the target episode's files** over altering platform code.
- Reuse existing `kind` and `variant` before introducing a new renderer. Every new reusable scene type should be renderer code, never hardcoded dialogue/UI inside a monolithic script.
- A one-off UI variant is a **reviewed, trusted repository module**, not executable user Markdown.
- Preserve the existing UI's tone, data format and file names unless a migration is explicitly requested.
- Do not add server/database/auth infrastructure without a demonstrated need.
- Avoid collecting secrets or using GitHub PATs in browser code.
- Prefer short, source-based history setup, dramatic chat/SNS, short grounded conclusion.

## Verification and status
- Validate JSON and the referenced scene paths.
- Syntax-check edited JS, render supported examples, verify per-episode save/switch/export preservation.
- Distinguish **code/JSON validity**, **deployed HTTP readiness**, **actual UI test**, and **recorded-video validation**. Do not claim the latter two unless performed.
- Exported review ZIP is a handoff, **not a GitHub publication**. Agent applies its contents through approved GitHub tools, ideally in a reviewable PR.
- For a complete request, report implemented vs deferred items explicitly.
