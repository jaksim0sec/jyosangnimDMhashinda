# Studio visual parity · mandatory regression contract

## Baseline

The original single-file player in `index.html` is the visual reference for **chat scenes**. The episode Studio must preserve the recognizable historical parody messenger instead of recreating arbitrary full-width cards.

- Canvas output: **720×1280**, authored in 360×640 logical units.
- Chat background: `#a6bbcf`. Sent messages from the selected perspective: `#ffdc53`; everyone else: white.
- Incoming avatar: 29×29, rounded. Incoming sender name only on the first of consecutive messages from that sender.
- Chat text: about 12.6 logical pixels, 19.3 line step, compact bubbles with 10px corners; avoid oversized full-width blocks.
- Right-side messages align to the safe-width limit, not against Instagram's action rail.
- Background history persists when an episode returns to the same chat room after a narration/SNS scene.
- Chat status/header and input chrome are a **per-episode setting**: compact hides fake input for Reels; classic can show it.
- Uploaded image files may be inserted as scene media or assigned to named participant avatars.

## Motion must exist in the exported frames

- Chat messages appear in script order, not all at once. Last message fades/slides into place (~280ms ease-out).
- Scroll stays anchored near latest content and advances smoothly as each message appears.
- Typing bubbles are shown sparingly immediately before the next message and animated using timeline time.
- Scene `fade` is a timestamp-derived ~360ms ease-out in the Canvas, not CSS animation hidden behind it.
- Fast consecutive system expulsions can set `paceMs` on the chat scene.
- Scrubbing to the same timestamp must paint the same frame. Replaying or recording must not depend on stale DOM animations or an unrelated playback clock.

## Architecture constraints

`studio/canvas.js` is the **only visible** scene renderer for both editor monitor and MediaRecorder output. `studio/renderer.js` remains a safe parser/DOM helper for scene assets and chat grammar. Avoid a second invisible layout that competes with the Canvas.

Avoid duplicating or redeveloping core chat rendering for individual episodes. Custom effects register a `kind:variant` Canvas painter and may delegate to the shared baseline.

## Verification checklist

1. Open `/studio.html`, default safe-zone **guides off**; with guides on, red overlays never enter video.
2. Select a chat scene: left messages are white, perspective messages are yellow, avatar/name grouping is coherent.
3. Seek to 0ms, ~700ms, ~1500ms, and the end: message count and typing/scroll state progress predictably.
4. Open SNS, narration, photo and return to the same room: prior chat is visible, new events appear in order.
5. Upload a picture, place it in a chat, assign it as avatar; inspect media in both playback and recorded WebM.
6. Export and import episode review ZIP; verify scene order, text, photos and avatar settings.
7. Confirm old `index.html` playback and old browser draft are unchanged.

**Evidence levels:** Syntax checks and canvas-command assertions do not prove a pixel-perfect match. Browser screenshots, user review, and mobile WebM playback remain distinct release checks. Never label a UI visually approved merely because a deployment is READY.
