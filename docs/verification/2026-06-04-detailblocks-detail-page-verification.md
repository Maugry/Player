# Manual Verification — detailBlocks / detail-page support (2026-06-04)

Verifies the reference Player renders the new CMS content model's catalog detail
pages: `detailBlocks` (image / text / video), the `showcaseVideo` hero, and the
`subtitle` field. See the design + plan under `docs/superpowers/` in the PM repo.

## Setup

Dev session points `kiosk-settings.json` (in the Electron dist dir) at the test
browse kiosk:

- CMS `http://host.example.local:40000`, MQTT `ws://host.example.local:49001`
- Kiosk slug `browse-kiosk` (ID 33), content package 84, MQTT auth `kiosk` / `REDACTED-CREDENTIAL`

Launch: `pnpm dev` from `prototype/player` (requires the test contour reachable;
VPN if off-network).

## Checks

**Video item with detailBlocks opens a detail page (not auto-play).**
1. From the browse menu, click the card backed by media 654 (catalog item `zdr0on6k`).
2. **Expect:** a scrollable detail page — its title, then the block image
   (`1355.png`) and the block video (`1354.mp4`) in order. It must NOT jump
   straight into fullscreen video playback.

**Showcase items render gracefully (no white screen).**
1. Click each of the two showcase cards (empty test stubs).
2. **Expect:** a detail page showing the card title and a muted
   "Нет дополнительного контента" line. Never a blank/white screen.

**Navigation.**
1. On any detail page, use **Назад** and **Главная**.
2. **Expect:** returns to the browse menu; the menu stays interactive.

**No render crashes.**
1. Open DevTools console (dev build).
2. **Expect:** no `Objects are not valid as a React child` errors; no uncaught errors.

**Offline media caching.**
1. After the content sync, check the player cache:
   `ls ~/.config/umka-player-*/media-cache/ | grep -E '1355|1354'`
2. **Expect:** both the image-block image (`1355.png`) and video-block video
   (`1354.mp4`) are present, so the detail page works offline.

## Notes

- A plain `video` item (no `detailBlocks`) still plays directly via the video
  player — unchanged.
- `text-block` content is plain text (Payload `textarea`); paragraphs split on
  blank lines. Titles/subtitles are richText, flattened to plain text.
- Unknown future block types are dropped during transform and never reach the view.
