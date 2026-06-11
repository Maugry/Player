# Player — Browse Dual-Display Manual Verification Runbook

**Date:** 2026-06-11
**Covers:** Epic A — Browse dual-display (#221). Renders the existing ContentPackage across two physical displays in Browse mode: primary = touch panel (card grid), secondary = demonstration screen (selected item's media).
**Repo:** `prototype/player`

> **Where this lives.** The player repo keeps dated manual-verification guides in `prototype/player/docs/verification/` (e.g. `2026-06-10-epic-s-themes-floors-manual-verification.md`). This is a *runbook* for an ongoing feature rather than a one-shot Epic sign-off, so it is placed under `prototype/player/docs/runbooks/`. When you complete a dual-display sign-off for a specific date/rig, capture the result as a dated copy under `docs/verification/` following the existing pattern.

All commands are copy-paste ready and run from `prototype/player` unless noted.

---

## What this does / does not change

- **Dual-display is browse-only and strictly opt-in.** It activates *only* when both are true: `kiosk-settings.json` has an explicit `"mode": "browse"` **and** `screen.getAllDisplays()` reports **≥ 2 displays**. Either condition missing → single-window, exactly as today.
- **Single-display is byte-for-byte unchanged.** One display + any mode behaves exactly as before — tapping a card opens content in the *same* window. The renderer loads with no `?role=` param (legacy path).
- **Loop is untouched.** Loop is mirror-only and out of scope here; `mode: "loop"` never spawns a demonstration window, even with two displays.
- **No `mode` field → no demonstration window.** Dual is opt-in via an explicit `"mode": "browse"`. A settings file with no `mode` does not trigger the split.
- **No CMS / `@umka/protocol` model change.** The panel/demonstration split is *derived* from existing ContentPackage data (the idle placeholder comes from `screensaver` → first showcase image → first menu-item thumbnail → package name). No new collection, field, or protocol message.

Architecture in one line: a pure `resolveWindowPlan` decides (mode=browse + ≥2 displays) whether to spawn a second `BrowserWindow` loaded with `?role=display`; the primary loads `?role=panel`; the panel's `playerService` stays the single source of truth and relays a serializable `PresentationState` to the demonstration window over IPC (cached in main, replayed on load).

---

## Before you start

- [ ] Player built / runnable. For a dev run: `pnpm install` (first run only), then `pnpm dev`. For a packaged Windows run: `pnpm build:win` artifact under `release/` (kiosks are Windows; dev is Linux).
- [ ] A reachable CMS with a Browse content package whose kiosk maps to a slug you can put in `kiosk-settings.json`. (See the Epic S verification guide for seeding a demo museum + `kiosk-1-1`.)
- [ ] For the real dual-display checks: two physical monitors attached **before** launch (kiosks boot with displays attached; mid-session hot-attach is out of scope — see Scenario 3).

### kiosk-settings.json templates

**Browse (dual-display when ≥ 2 displays attached):**
```bash
cat > kiosk-settings.json <<'JSON'
{
  "kioskId": "kiosk-demo",
  "kioskSlug": "kiosk-1-1",
  "serverUrl": "http://localhost:40000",
  "mqttUrl": "ws://localhost:49001",
  "museumId": "demo",
  "mode": "browse",
  "display": { "fullscreen": false, "cursor": true },
  "debug": { "showDevTools": true, "logLevel": "info" }
}
JSON
```

**Loop (control — never dual):** same file with `"mode": "loop"`.

**No mode (control — never dual):** same file with the `"mode"` line removed entirely.

> Watch out for a **leftover settings file** silently pointing the Player at the wrong server. On boot, confirm the active `serverUrl` in the Player console (`Loading settings from: …/kiosk-settings.json`).

---

## Scenario 1 — Single-display regression (must be unchanged)

The goal here is to prove dual-display is invisible unless explicitly opted in with two displays.

**1a. One display + `mode: "browse"` → same-window content (today's behavior).**

1. Ensure exactly **one** display is attached.
2. Use the **Browse** template above (`"mode": "browse"`).
3. Launch: `pnpm dev` (or the packaged app).
4. **Expected:**
   - Exactly **one** window opens. No second window anywhere.
   - The renderer loads with **no** `?role=` query param (legacy path). In DevTools, `window.location.search` is empty (`""`).
   - Tapping a card opens its content **in the same window** (video / detail / article), exactly as before this feature. Back / Home return to the grid as before.

**1b. Two displays + `mode: "loop"` → single window, NO demonstration window.**

1. Attach **two** displays.
2. Use the **Loop** template (`"mode": "loop"`).
3. Launch.
4. **Expected:**
   - Exactly **one** window. **No** demonstration window on the second display. Loop is untouched by this feature.

**1c. Two displays + NO `mode` field → NO demonstration window.**

1. Keep **two** displays attached.
2. Use the **No-mode** template (the `"mode"` key removed).
3. Launch.
4. **Expected:**
   - Exactly **one** window. **No** demonstration window. Dual is strictly opt-in via an explicit `"mode": "browse"` — a missing mode does not enable it.

> If any of 1a/1b/1c spawns a second window, dual-display is leaking outside its trigger — stop and treat as a regression (`resolveWindowPlan` gate in `electron/displays.ts`).

---

## Scenario 2 — Dual-display Browse (the feature)

**Setup:** two displays attached **before launch**, `kiosk-settings.json` with `"mode": "browse"` (Browse template). Launch the Player.

**2a. Two windows on the right monitors.**

1. **Expected:**
   - A **panel** window on the **PRIMARY OS display** showing the card grid. Its URL carries `?role=panel`.
   - A **demonstration** window on the **OTHER (non-primary)** display showing the **idle placeholder** — derived from the package screensaver, or its first showcase image / first menu-item thumbnail, or the package name as a last resort. Its URL carries `?role=display`.

**2b. CRITICAL — correct-monitor placement (the Electron fullscreen risk).**

This is the headline check from the dual-screen research. Electron cannot natively "fullscreen on display N": passing `fullscreen: true` at construction tends to fullscreen on the **primary** monitor regardless of x/y, landing the window on the **wrong** screen or showing **black**. The code works around this by constructing the secondary **hidden**, positioning it on the target display's bounds, then calling `setFullScreen` on `ready-to-show` (`electron/secondary-window.ts`).

1. **Verify on the real two-monitor rig (or Windows test box — see Scenario 5):**
   - The demonstration window actually **fills the correct (non-primary) monitor** — not the primary, not partially, not offset.
   - It is **not black / not blank** on boot. (No black flash before paint — `show: false` + `ready-to-show`.)
   - The panel grid is on the **primary** monitor.
2. If the demonstration window is black, on the wrong screen, or letterboxed, that is the fullscreen-on-secondary bug resurfacing — capture which monitor is primary, the two resolutions/scale factors, and the GPU/driver, and treat it as a blocker. (Mixed-DPI setups are a known limitation; the #221 rig is 1920×1080 + 1920×1080 at 100%.)

**2c. Select a card → media on the demonstration screen, grid stays on the panel.**

1. On the **panel**, tap a leaf card (video / showcase / article).
2. **Expected:**
   - The card's **media plays on the demonstration display**.
   - The **panel stays on the grid** — it does **not** navigate into the content view — with the selected card **highlighted**.

**2d. Close → demonstration returns to idle, playback stops.**

1. On the panel, tap **«Закрыть»** (or **Home**).
2. **Expected:**
   - The demonstration display **returns to the idle placeholder**.
   - **Playback stops** on the demonstration display (audio + video halt).
   - The panel returns to the top-level grid (Home) or stays on the current grid with no card highlighted (Закрыть).

**2e. Submenu drill-in keeps the demonstration idle until a leaf is chosen.**

1. On the panel, tap a **submenu** (non-leaf) card.
2. **Expected:**
   - The **panel drills into** the submenu (shows the child grid).
   - The **demonstration display stays idle** (placeholder) — it only shows media once an actual **leaf** is selected.
3. Tap a leaf inside the submenu → its media plays on the demonstration display (as in 2c).

---

## Scenario 3 — Display hot-unplug

The main process handles **graceful teardown** of the secondary when a display is removed; re-attaching a second display mid-session is **not** supported (documented limitation — kiosks boot with displays attached).

1. With dual-display running (Scenario 2 setup), **unplug / disconnect the secondary display**.
2. **Expected:**
   - The **demonstration window closes** cleanly (no crash, no orphaned window).
   - The **panel keeps working** — the grid is still interactive on the primary display.
3. **Re-attach** the secondary display.
4. **Expected (documented limitation):** the demonstration window does **not** automatically re-appear. **Relaunch** the Player to restore dual-display. This is intentional — main only handles graceful teardown, not mid-session hot-attach (which would also require reloading the panel with `?role=panel`).

> On Windows 10 the `display-removed` / `display-metrics-changed` events are reliable. (They are historically flaky on Windows 7, which is outside the deployment target.)

---

## Scenario 4 — Dev two-window emulation on Linux (`:1`)

The dev launch is `pnpm dev` (Vite + `vite-plugin-electron` spawns Electron under `DISPLAY=:1`). This lets you smoke-test both windows on the dev box **without** real kiosk hardware — within an honest constraint.

**What dev mode does:**
- In **dev**, both windows are **framed** and **NOT fullscreen** — the code only applies `kiosk`/`fullscreen` in **prod**. So a dev box can show two ordinary framed windows side by side.
- Whether the second window spawns at all still depends on `screen.getAllDisplays()` reporting **≥ 2 displays** (plus `mode: "browse"`). The dev framing does not bypass the display-count trigger.

**The constraint (state it honestly):**
- On a **single-head Linux box**, `screen.getAllDisplays()` reports **one** display, so the **second window will not spawn** — you cannot exercise the dual path there, framed or not.
- To truly exercise dual on dev you need **two displays reported to Electron**, via one of:
  - **(a)** an X server / setup that presents **two virtual heads** (so `getAllDisplays()` returns ≥ 2). This depends on your X configuration and GPU/driver; there is no guaranteed one-liner, so configure it for your machine rather than assuming a fixed `xrandr` recipe works.
  - **(b)** **the Windows test box** (`videocard@192.168.87.25`) or the real #221 dual-monitor rig — the authoritative path (Scenario 5).
- **Important:** even when you *do* get two windows on dev, they are **framed and windowed**, so a dev run **cannot** verify the prod-only behaviors — fullscreen-on-each-head, correct-monitor *fullscreen* placement, no-black-flash, kiosk lockdown. Those are prod-only and must be checked on the rig (Scenario 5). Dev is for verifying the **logic**: that the second window spawns, loads `?role=display`, shows the placeholder, and mirrors panel selections (Scenarios 2c–2e) — *not* the fullscreen/monitor-targeting behavior.

---

## Scenario 5 — Real kiosk verification (the authoritative one)

The full two-monitor kiosk end-to-end — **fullscreen on each head, correct-monitor placement, no black screen, Windows multi-monitor behavior** — is verified **manually** on:

- the **Windows test box** `videocard@192.168.87.25` (passwordless SSH, cmd shell), or
- the real **#221 dual-monitor rig**.

Run through **Scenario 2 (all of 2a–2e)** and **Scenario 3** on that hardware with a **packaged** build (`pnpm build:win`) and `kiosk-settings.json` set to `"mode": "browse"` next to the executable. Pay special attention to **2b** (correct-monitor fullscreen, not black) — this is the one behavior that cannot be reproduced on the Linux dev box.

**No automated two-window e2e is provided** — consistent with Epic C's deferred-staging pattern. The reason: you cannot drive **two real fullscreen `BrowserWindow`s on separate physical monitors headlessly** — fullscreen-on-secondary-monitor placement and the black-screen check are inherently observational and hardware/driver-dependent, so they are signed off by a human on the rig. The pure logic *is* covered by unit tests (`screenRole`, `presentation`, `displays`, `presentation-relay`); only the windowed/fullscreen integration is manual.

---

## Sign-off

Record a dated copy of the results under `prototype/player/docs/verification/` (e.g. `YYYY-MM-DD-browse-dual-display-verification.md`) noting: the rig used, which monitor was primary, both resolutions/scale factors, and a pass/fail per scenario — especially Scenario 2b.

- [ ] Scenario 1a/1b/1c — single-display + Loop + no-mode all single-window (no regression).
- [ ] Scenario 2a — panel on primary, demonstration on secondary, with idle placeholder.
- [ ] Scenario 2b — demonstration fills the **correct** monitor, **not black** (rig/Windows).
- [ ] Scenario 2c/2d/2e — select plays on demo + grid stays / Закрыть stops + returns to idle / submenu stays idle until leaf.
- [ ] Scenario 3 — unplug closes demonstration, panel survives; re-attach needs relaunch.
- [ ] Scenario 4 — dev two-window logic smoke (where two heads are available).
- [ ] Scenario 5 — authoritative pass on Windows test box / #221 rig.
