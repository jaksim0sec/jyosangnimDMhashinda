# 조상님 단톡쓰신다 · Studio architecture (v0.1)

## Goal

An episode-based vertical short-form production workspace. Preserve the original `index.html` legacy chat player and its recorder while building a separate composable editor at `/studio.html`.

### Non-negotiable design rules

1. **The episode is the unit of work**, not one giant DSL blob.
2. **The timeline is only a sequence of scene references and presentation properties.** Content lives in small scene files.
3. **Scene renderers are reusable.** A renderer never contains one episode's dialogue or story.
4. **One-off visual behavior is an optional, reviewed renderer variant**, not arbitrary HTML/JS pasted into dialogue.
5. **The main browser application is not the canonical publisher.** GitHub holds released source. Browser edits are explicit, per-episode local drafts.
6. Never rewrite or migrate a user's old `history-chat-story-v1` local storage or shared `history-chat-player-assets-v1` IndexedDB without a deliberate migration.

## Stable file contract

```text
index.html                                  # legacy player / recorder (unchanged)
studio.html                                 # new studio UI
studio/
  studio.css                               # editor and preview styles
  app.js                                   # editor / state / recorder
  renderer.js                              # safe scene markup and chat parsing
  canvas.js                                # identical preview+video renderer
  webm.js                                  # WebM duration metadata repair
  zip.js                                   # reviewed episode bundle export/import
  variants/                                # code-reviewed special scene UIs
episodes/
  manifest.json                            # list of published episodes
  <slug>/
    episode.json                           # metadata, settings, ordered scene instances
    scenes/
      intro.md
      debate.chat
      announcement.post.md
      ...
    assets/
      <files>                              # tracked in GitHub, stable repo-relative names
docs/studio/ARCHITECTURE.md
```

`episode.json` is the *mainstream composition* and is intentionally small: `id`, `title`, `description`, `version`, `settings` and `scenes[]`.
Each scene instance holds `id`, `kind`, `src`, `durationMs`, `transition`, `variant`, optional `room`.
`src` is relative to the episode directory. Scene content is independent Markdown-ish `.md` or chat `.chat`.
Known kinds in v0.1: `intro`, `chat`, `post`, `narration`, `photo`, `outro`. New kinds add a renderer without altering the episode loader.

### Renderer registration

A renderer receives `{ scene, text, episode, assets }` and produces DOM in the 9:16 canvas preview. Variants are declarative: `chat:kakao`, `post:social`, `narration:webtoon`, etc. Escape all user-authored text with `textContent`, never `innerHTML` for scene data.

Per-episode exceptions should live in **reviewed code files** under `studio/variants/` and be referenced by a known variant ID. V0.1 deliberately does not execute arbitrary JS from Markdown or user-entered scene text. Additional renderer plugins require a registry implementation and code review.

### Scene content

`intro`, `narration`, `outro`: first `# Heading` (optional), subsequent paragraphs are narration. `post`: first `# Heading` is display name, optional `@handle` line, subsequent paragraphs the post. `chat`: one line per message, e.g. `- 숙종: 발표합니다`; `- [system] 사건 안내`; `- [kick] 숙종 > 송시열`; `- [share] 숙종 > announcement`. The share ID references a scene ID inside the same episode. Images use `![alt](assets/file.png)` and are resolved within the episode folder; user-uploaded local preview assets can temporarily shadow that path.

## Browser save semantics

LocalStorage key **`josa-studio:v1:draft:<slug>`** for each episode. Draft structure:
```json
{"schema":1,"episodeId":"sukjong-gisa-1689","savedAt":"ISO8601","baseVersion":1,"episode":{"id":"sukjong-gisa-1689","scenes":[{"id":"intro","kind":"intro","src":"scenes/intro.md","durationMs":2400}]},"contents":{"intro":"# ..."}}
```

Local drafts override GitHub defaults on load. Reset removes only the active episode draft, never any other episode, never the legacy player. The UI must show whether content is a local draft or the published baseline. Export a review JSON, with all edited scenes and timeline, so a GitHub-connected agent can apply changes to the corresponding source files.

**Do not put binary images in localStorage.** Existing legacy IndexedDB stays intact. Studio local image overrides should use a separate IndexedDB namespace keyed by episode ID. Image assets only become portable after uploaded under the episode's `assets/` directory. V0.1 editor does not claim to publish assets.

## Publishing workflow

1. Agent writes/updates one episode directory and manifest, with a change description.
2. User opens Studio preview, adjusts scene order, timing, text and variations, then saves a *local draft*.
3. User exports the review JSON; assistant/agent uses the GitHub connector to update source, ideally via a PR for review.
4. Reloading after a merge should not silently override a user's local draft. Explicit draft reset/rebase needed.

Automatic authenticated GitHub publishing **is not implemented** and must never use a GitHub PAT embedded in public browser code. GitHub OAuth or backend auth can be considered separately after the local editing workflow is validated.

## Planned integration checkpoints

- **v0.1 (foundation):** separate Studio URL, published episode loading, scene types, timeline editor, preview, draft save, review export. Old player is still the recording path.
- **v0.2:** shared deterministic render adapter so Studio timeline and recorder render the same scenes and timing (Canvas output parity).
- **v0.3:** per-episode image asset import/export and a tested safe GitHub review/publish handoff; optional episode-specific renderer variants.
- **v1:** reliable scene transitions and output QA, production publishing gates.

Acceptance for each stage is behavioral. JSON validity or deployment READY alone does not prove video capture or mobile UI quality.

## Shared SVG icon contract · Soft v0.14

All 56 canonical user-supplied icons from `questYourLife/new` are vendored verbatim at `studio/icons/svg/<name>.svg`; manifest at `studio/icons/manifest.json`. Geometry must not be auto-redrawn. Base: 32 outline, 5 independent fill, 19 additional outline. The five Fill variants are actual files, not CSS fill of outline.

- Renderer: `StudioIcons.icon(name,{size:18})` creates a safe, semantic CSS-mask element inheriting `currentColor`; size is clamped to 12–48px.
- Scene authoring: `:icon(name):` is an optional text token, usable in narrative, chat messages, SNS text and headings. Missing/unknown names are shown literally, never interpolated as HTML.
- Editor: the collapsible icon gallery reads the manifest, supports name filtering, click-to-insert and name copying. Icons are UI pictograms, not a substitute for historical photographs or 3D artwork.
- Source provenance and limitations: [icon README](../../studio/icons/README.md). Inline SVG mask IDs are never copied into DOM; external SVG is rendered as a CSS mask to avoid ID collisions and preserve the original files.

## Implemented Studio workflow (2026-11-06)

- **Frame parity:** `studio/canvas.js` owns the **720×1280 preview and MediaRecorder capture**. Intro, chat, post, webtoon narration, photo and outro render through one Canvas painter. Legacy `index.html` is unchanged.
- **Timing:** ordered per-episode scene durations (milliseconds in JSON, seconds in editor), seek/scrub and fade, progressive chat reveal. The recording ends automatically and passes through WebM Duration metadata repair (`studio/webm.js`).
- **Media:** multiple image upload, drop/paste, dedicated per-episode IndexedDB, gallery insertion. Chat images use `- [image] 이름 > assets/name.jpg`; other scenes use Markdown-style image references. Media in a review ZIP remains in that episode's `assets` directory.
- **Portability:** store-only ZIP with per-entry CRC validation, path and total-size checks; export includes `episode.json`, scene files, media, `studio-draft.json`, and review metadata. Import restores a ZIP to the selected episode. Compressed third-party ZIP is not supported.
- **Exceptions:** trusted modules register a `kind:variant` renderer with `StudioCanvas.register`, and may call `drawDefault`. `studio/variants/sukjong-royal.js` implements the sample `chat:royal-purge` variant. Modules are reviewed scripts included by the app, never JavaScript evaluated from scene text.
- **Safety/configuration:** safe-area percentages (top/right/bottom) are stored per episode and used during preview+recording. Red guides are overlay-only and not present in recorded pixels. Drafts are isolated by episode ID and don't mutate legacy browser storage.
- **Publishing:** direct browser→GitHub publishing is deliberately not implemented because secrets do not belong in a static client. Use a reviewed ZIP and GitHub-enabled agent to commit source/assets.

**Verification gates:** syntax/schema/ZIP roundtrip/renderer unit checks and deployment readiness can pass without proving mobile UX or end-to-end browser recording. Mark those separately until tested on device.
