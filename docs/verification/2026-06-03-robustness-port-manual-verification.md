---
title: Robustness Port — Manual Verification Guide
date: 2026-06-03
applies-to: reference Player (prototype/player)
related:
  - docs/superpowers/specs/2026-06-03-reference-player-robustness-port-design.md
  - docs/superpowers/plans/2026-06-03-reference-player-robustness-port.md
---

# Robustness Port — Manual Verification Guide

This guide verifies the field-hardening ported from the production production client. The
automated unit tests cover the pure logic (timeout, download-completion check, range
resolution, cache validation, dedup, concurrency, staleness, idle suppression, MQTT auth).
The steps below cover the Electron-runtime behaviour that has no unit harness.

Run a dev build with `pnpm dev` unless a step says "production build". For the production
build use `pnpm build` then launch the packaged app. The media cache lives under the
per-install userData dir (see *Per-install isolation*).

## CMS request timeout

Goal: a dead CMS must not hang the kiosk forever (30 s first-byte abort, then cached
fallback).

1. Point `serverUrl` in `kiosk-settings.json` at an unreachable host (e.g.
   `http://unreachable.invalid`).
2. Ensure the kiosk has previously synced content (so a cache exists).
3. Launch the app and trigger a sync (MQTT `app` command `{"action":"sync"}` or restart).
4. **Expect:** within ~30 s the request aborts (DevTools console shows an abort/`API error`
   rather than an indefinite spinner), and the kiosk continues serving cached content.

## Download integrity (partial cleanup + size validation)

Goal: an interrupted download leaves no corrupt file behind, and a truncated file is
rejected.

1. Start a fresh sync of a package with at least one large video.
2. Mid-download, pull the network (disable the adapter or kill the CMS).
3. **Expect:** no zero-byte or partial file remains in the media-cache dir for the
   in-flight item; the console logs a cleanup/`Download aborted`. Other already-finished
   files remain.
4. Reconnect and sync again. **Expect:** the missing item downloads cleanly and plays.

## Reuse-non-empty (offline metadata recovery)

Goal: a kiosk whose IndexedDB was wiped but whose media files survive can keep working
offline.

1. With a fully synced kiosk, close the app.
2. Wipe IndexedDB only (DevTools → Application → IndexedDB → delete `umka-kiosk`, or delete
   the `IndexedDB` dir under userData) — leave the `media-cache` files in place.
3. Relaunch and sync.
4. **Expect:** existing non-empty files are reused (console: "Reusing existing cached media
   file") rather than fully re-downloaded.

## Serve-time cache validation

Goal: a cached file corrupted/truncated after sync is dropped and re-fetched (or falls
back to the original URL).

1. With a synced kiosk, close the app.
2. Truncate one cached media file on disk (e.g. `truncate -s 1024 <file>` or overwrite with
   a few bytes).
3. Relaunch (online) and open the item whose file you truncated.
4. **Expect:** the stale metadata entry is dropped (console: "Cached media size mismatch")
   and the item is re-fetched / served from the original URL — it still plays, no broken
   media element.

## HTTP range serving (seekable video)

Goal: seeking a cached video does not re-stream from the start.

1. Play a long cached video in a dev build.
2. Open DevTools → Network, filter `media-cache`.
3. Seek backward and forward repeatedly on the progress bar.
4. **Expect:** seeks are near-instant; the media requests return `206 Partial Content` with
   `content-range` headers (not a single `200` re-download from byte 0).

## Concurrent download pool + dedup

Goal: a large package downloads with bounded parallelism and no duplicate fetches.

1. Sync a package with many media items, several of which are shared across menus (same
   image used as a thumbnail and inside a showcase).
2. Watch the console sync progress / Network panel.
3. **Expect:** no more than 4 downloads in flight at once; each unique media id is fetched
   once (shared items are not downloaded twice).

## Idle during playback

Goal: an actively playing video is never interrupted by the screensaver; idle resumes
afterwards.

1. In browse mode, start a video longer than the idle timeout (2 min) and do not touch the
   screen.
2. **Expect:** the video keeps playing past 2 min — no screensaver.
3. Let the video end (or press back) to return to the menu, then leave the kiosk idle.
4. **Expect:** after ~2 min of menu idle, the screensaver appears.

## MQTT auth

Goal: the kiosk connects to a broker that requires credentials.

1. Configure a broker requiring username/password.
2. Set `mqttUsername` and `mqttPassword` in `kiosk-settings.json`.
3. Launch the app.
4. **Expect:** the console shows `[MQTT] Connected`; commands and status flow normally.
   Removing the credentials against the same broker should fail to connect.

## Per-install isolation (production build)

Goal: two install locations do not share a userData dir / DB.

1. Build and install the app into two different folders.
2. Launch each and let it create its cache/DB.
3. **Expect:** two distinct `umka-player-<hash>` directories under the OS AppData dir, each
   with its own `media-cache` and IndexedDB.

## Display hotplug (production build)

Goal: the kiosk window follows the primary display when resolution changes or a monitor is
hot-plugged.

1. Launch the kiosk (production build) on a primary display.
2. Change the primary display resolution, or attach/detach an external monitor.
3. **Expect:** the kiosk window re-fits the primary display bounds without manual
   intervention.

## Kiosk lock-down (production build)

Goal: a visitor cannot escape the kiosk UI.

1. Launch the production build.
2. Try: `Esc`, `F11`, `Alt+F4` (Windows), the DevTools shortcut (`F12` / `Ctrl+Shift+I`),
   and check the taskbar.
3. **Expect:** none exit or minimise the app; no DevTools open; no taskbar entry. Zoom
   gestures (`Ctrl`+scroll / pinch) do not change zoom.
4. Sanity check the dev build still allows DevTools and a normal window (so developers are
   not locked out).
