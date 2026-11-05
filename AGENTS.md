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

## Canonical UI icon pack
- Source: `jaksim0sec/questYourLife` branch `new`, `docs/design/seed/assets/icons/v0.14/`. Exactly 56 user-approved Soft SVG assets, mirrored under `studio/icons/svg/` without shape edits.
- Manifest: `studio/icons/manifest.json`. UI component: `studio/icons.js`; gallery: `studio.html`; scene syntax `:icon(name):`; renderer: `studio/renderer.js`.
- Prefer this icon family over emoji, arbitrary Unicode glyphs or new SVG drawings in Studio editing controls. Never synthesize Fill versions except the five real files. Do not alter the legacy player just to propagate icon styling.

## Studio video and variants
- `studio/canvas.js` now renders both preview and 720×1280 video. `studio/webm.js` fixes WebM Duration. Do not introduce a second video rendering path.
- `studio/renderer.js` parses chat content; images inside chat are `- [image] 인물 > assets/photo.jpg` and use episode-local media.
- `studio/zip.js` exports and imports **store-only** review archives with CRC validation; normal compressed ZIPs are intentionally unsupported.
- User media must remain per-episode in `josa-studio-assets-v1`. Never overwrite identical uploaded names silently or delete other episodes' media.
- Add special UI only as a reviewed module under `studio/variants/`; register `kind:variant` using `StudioCanvas.register`. Only explicitly listed scripts should load. Never evaluate JS from Markdown/episode JSON.
- The Studio recorder uses browser MediaRecorder (WebM/no audio) and does not auto-publish to GitHub. Preserve legacy `index.html` and its storage.
- Distinguish syntax and in-memory render validation from actual browser/mobile record/playback tests.
