# Soft SVG · 56 icons

Canonical source: `jaksim0sec/questYourLife` branch `new`, `docs/design/seed/assets/icons/v0.14/`, based on user-supplied `soft-icons-v014-56.zip`.

- 32 Core Outline · 5 independent Fill · 19 additional Outline
- 24×24 viewBox, rounded 1.8 stroke and currentColor. Geometry copied unchanged.
- Only five named Fill icons exist: `home-fill`, `chat-fill`, `users-fill`, `user-fill`, `check-circle-fill`.
- Do not convert outline to fill using CSS or replace supplied shapes with library icons.

## Usage in Studio

1. Open the **SVG 아이콘** gallery under the episode scene editor.
2. Search by name and click an icon to insert `:icon(name):` at the cursor.
3. Tokens render in narration, chat and post text. For UI controls call `StudioIcons.icon('name', {size:18})`.
4. Standalone SVGs can be referenced at `studio/icons/svg/name.svg`. The manifest is `studio/icons/manifest.json`.

Source pack is user-owned; copied into this project at user's explicit request. Film artwork and episode-specific imagery remain separate assets.
