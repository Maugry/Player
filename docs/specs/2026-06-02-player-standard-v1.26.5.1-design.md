---
title: Umka Player — update to Standard v1.26.5.1
date: 2026-06-02
status: design
supersedes_standard_pin: v1.26.2
target_standard: v1.26.5.1
---

# Umka Player — update to Standard v1.26.5.1

## Purpose

The reference Player implements **Umka Kiosk Standard v1.26.2** (bundled copy) and its
README still says "v1.2". The canonical standard is now **v1.26.5.1**
(`github.com/Maugry/Standard`). This design brings the MIT reference Player into
conformance with v1.26.5.1 and re-establishes it as the published reference
implementation linked from the standard.

Success criteria:

- A v1.26.5.1 consumer (CMS, guide app) sees conformant wire traffic from the Player:
  correct `mode` vocabulary, a complete `status` payload, correct command parsing.
- The all-in-one reference can demonstrate the **full** standard surface solo —
  including two-tier liveness — without a separate Supervisor process running.
- Docs (README, ARCHITECTURE, bundled spec pointer) match the shipped behaviour and
  cite the canonical standard by name, not a stale version.
- Pure logic is covered by automated tests (the repo currently has none).

## Context: what the Player owns vs. what it does not

The standard assigns wire responsibilities explicitly. Mapping them to the Player:

| Concern | Standard owner | Player's role |
|---|---|---|
| `commands/playback`, `volume`, `locale`, `loop` | Player | Subscribe + act |
| `commands/app` (JSON `{action}`: `sync`/`mode`/`quit`/`restart`) | Player | Subscribe + act (`restart` = renderer reload, dev path) |
| `commands/app` (bare string `start`/`stop`/`restart`) | Supervisor | Ignore (wrong shape) |
| `commands/power` (bare string) | Supervisor | **Emulated** by all-in-one reference |
| `status`, `heartbeat` | Player | Publish |
| `system/heartbeat`, LWT, `system/crash` | Supervisor | **Emulated** (heartbeat + LWT only) |
| `wol` | WoL relay | None (kiosk is off) |
| `museum/.../iot/...` (status + command) | CMS + Bridge | **None** — see below |
| Event→action bindings | CMS | Player only emits the *state* bindings key on |

**There is no Player-side IoT wire work.** The standard's *reads direct, writes through
CMS* architecture puts all IoT command publishing in the CMS and all polling in the
Bridge. The Player participates in event→action bindings purely by emitting accurate
`navigation.path`, `screensaverActive`, and `triggerEnded` on its `status` — which the
CMS keys on. Adding IoT topic handling to the Player would invent behaviour the standard
does not define. So "Everything" for the Player means *full conformance + Supervisor
emulation*, not IoT.

## Approaches considered

**A — All-in-one reference (chosen).** Collapse wire `mode` to `loop`/`browse`/`custom`;
realise the old projector/audio/showcase modes as content-package configuration; and have
the Player also publish the Supervisor's `system/heartbeat` (with LWT + graceful-offline)
and keep its power handlers, so the single binary demonstrates the whole standard incl.
two-tier liveness. A documented seam marks what moves to the Sentinel in production. This
matches the existing ARCHITECTURE.md framing ("includes power and app lifecycle commands
within the player itself") and the user's "Everything" scope choice.

**B — Strict content-plane only.** Same mode/status conformance but drop power and publish
no `system/heartbeat`. Cleanest separation, smallest diff — but the Player alone can no
longer demonstrate two-tier liveness; a Sentinel must run alongside. Rejected: contradicts
the "Everything" scope and weakens the reference as a self-contained demo.

**C — Dual build targets (`--all-in-one` / `--content-only`).** Maximum flexibility via a
runtime flag. Rejected as YAGNI for a prototype reference; doubles the test matrix for a
seam that is currently only conceptual.

## Design

The work splits into five focused units plus docs. Services stay singletons and keep their
current public observer interfaces; changes are additive or internal where possible.

### 1. Types (`src/types/index.ts`)

- **`KioskMode`** → `'loop' | 'browse' | 'custom'`. Remove `projector | audio | showcase`.
  Accept a free specialisation string on the *consumer* side is not the Player's concern;
  the Player only ever *emits* one of the three (it may emit `custom` where it previously
  emitted a removed value).
- **`KioskStatus`** gains: `version: string`, `uptime: number`, `error: KioskError | null`
  (all always present); optional `navigation?: { nodeId: string | null; path?: string[];
  showcaseOpen?: boolean }`, `screensaverActive?: boolean`, `triggerEnded?: boolean`.
  `currentContent.position?` / `duration?` documented and emitted when known.
- New **`KioskError`** = `{ code: string; message: string; timestamp: string }`, and a
  `KioskErrorCode` union seeded with `'INDEXEDDB_OPEN_FAILED_PERMANENT'` (the only code the
  Player emits) plus the reserved codes as documented-but-unused string literals.
- **`KioskHeartbeat`**: drop `diskFreeGB`.
- **`KioskCommand.action`** gains `'screensaver' | 'seek' | 'trigger_play' | 'quit'`.
  `trigger_play` carries the full media envelope (`mediaId`, `mediaUrl`, `mediaMimeType`,
  `mediaTitle`); model as optional fields on the command or a typed sub-shape.
- **Settings**: optional `profile?: 'continuous' | 'interactive' | 'triggered' |
  'audio' | 'projector' | 'catalog' | 'showcase'` — a *rendering hint only*, never on the
  wire. Drives whether controls/screensaver/video element show. Loop and Browse behaviour
  is otherwise identical regardless of profile.

### 2. MQTT service (`src/services/mqtt.ts`)

- **Per-topic payload parsing.** Replace the blanket `JSON.parse` with a parser keyed on
  the topic leaf: `volume` → bare integer, `locale` → bare string (JSON string), `loop` →
  bare boolean, `power` → bare string, `playback`/`app` → JSON `{action,...}`. A payload
  that does not match its topic's expected shape is logged and ignored (MUST per spec).
- **`commands/app` shape discrimination.** Only act on JSON `{action}` of `sync`/`mode`/
  `quit`/`restart`; explicitly ignore bare-string payloads (those are the Supervisor's
  `start`/`stop`/`restart`).
- **Status publish** carries the full v1.26.5.1 payload (delegated from player.ts which
  owns the state; mqtt.ts just stamps `kioskId`/`timestamp` and serialises).
- **LWT registration.** On `connect`, register a Will on the **Supervisor** topic
  `system/heartbeat` with `{kioskId, status:"offline", connectedAt}`, retained, QoS 1
  (see unit 4). The Player's own `status` retains last-known content state; no Will needed
  there per spec.
- **Version source.** Read app version once from a single module (see unit 6) instead of
  the hard-coded `'0.1.0'`.

### 3. Player service (`src/services/player.ts`)

- **Mode collapse.** `init()` handles only `loop`/`browse`/`custom`. The
  projector/audio/showcase `case`s fold into: Loop plays the playlist (profile decides
  chrome); a Browse package whose only content is top-level `showcaseItems` opens the
  showcase grid directly (Showcase-as-Browse-profile); `custom` is a minimal heartbeat-only
  state. Remove `projector`/`audio`/`showcase` branches from `init`, `next`, `previous`,
  `getPlaylistItems`.
- **Navigation tracking.** Maintain `navigation.nodeId` and an ancestor `path: string[]`
  of node `id`s as the visitor moves (`selectMenuItem`, `goBack`, `goHome`, submenu push/
  pop, showcase open/close → `showcaseOpen`). `menuStack` already mirrors the tree; extend
  it to carry ids so `path` is derivable without re-walking.
- **`screensaverActive`** tracks the screensaver state distinctly from `state:"idle"`.
- **Trigger pipeline (Player side).** `trigger_play` → play the enveloped media to
  completion; on completion publish `status` once with `triggerEnded: true`, then reset the
  flag on the next publish. A triggered-playback flag on `PlayerState` gates the one-shot.
- **New playback commands.** `screensaver` (force idle/screensaver), `seek` (set position
  on the media element via a callback to the view layer).
- **`quit`** → graceful application quit through Electron IPC (and graceful-offline publish
  via unit 4 before exit).
- **`restart`** stays a renderer reload (`window.location.reload()`) — the documented dev
  path; do not rewire to a process restart.
- **`error` emission.** `setError(code, message)` populates the `KioskError` and the status
  `error` field; `clearError()` resets to `null`. Healthy status always carries `error: null`.
- **`uptime`/`version`** included on every status publish.

### 4. Supervisor emulation (`src/services/supervisor.ts`, new)

A small singleton that lets the all-in-one Player satisfy two-tier liveness without a
separate Sentinel. Scoped deliberately tight:

- Publishes `system/heartbeat` every 10 s, retained, with `player.status:"running"`,
  `pid` (Electron `process.pid`), `restartCount: 0`, `lastCrash: null`, and a `system`
  block. `cpuPercent`/`memoryPercent` MAY be `0`/omitted in the reference (documented);
  `networkConnected` reflects MQTT connectivity.
- Registers the **LWT** (unit 2) so an unexpected drop publishes `status:"offline"` without
  `graceful`.
- On `quit`/clean shutdown, publishes the **graceful-offline** payload
  (`{status:"offline", graceful:true}`, retained, QoS 1) before disconnecting.
- Does **not** publish `system/crash` — a process cannot reliably report its own crash;
  that is inherently the real Sentinel's job and is documented as the seam.

This isolates everything that "moves to the Sentinel in production" into one file, making
the production split a matter of deleting one import.

### 5. Storage service (`src/services/storage.ts`)

- On permanent IndexedDB open failure (after the existing retry budget is exhausted), call
  `playerService.setError('INDEXEDDB_OPEN_FAILED_PERMANENT', …)` so the conformant error
  code reaches the bus. No other behavioural change.

### 6. Version + docs

- **Single version source.** Add `src/version.ts` exporting the version (sourced from
  `package.json` via Vite `define` or a generated constant) consumed by status, heartbeat,
  and system/heartbeat. Bump `package.json` `version` from `0.0.0` to `0.2.0`.
- **README.md**: rewrite to v1.26.5.1 — mode vocabulary (`loop`/`browse`/`custom` +
  profiles), full command/status tables, drop the "v1.2"/numbered-section references, and
  point the spec link at `github.com/Maugry/Standard`.
- **ARCHITECTURE.md**: replace numbered-section citations with the canonical named
  sections; update the control-plane section to reference the new `supervisor.ts` seam.
- **STANDARD.md (bundled)**: replace the full stale copy with a short pointer stub —
  "This Player implements Umka Kiosk Standard v1.26.5.1" + link to the canonical repo.
- **Standard repo follow-up (separate commit, `Maugry/Standard`)**: fill the reference-impl
  link `github.com/TODO` → `github.com/Maugry/Player`. Tracked here, executed in that repo.

## Data flow (unchanged shape, enriched payloads)

Init → load settings → services init (API, storage, MQTT connect + LWT, supervisor start)
→ load content (CMS or cache) → player.init(mode) → render. Commands flow
broker → mqtt.handleMessage (per-topic parse) → player.handleCommand → state change →
notify React + publishStatus (full payload). Heartbeats (player 10 s, system 10 s) run on
independent timers. Graceful quit publishes graceful-offline before exit.

## Error handling

- Unparseable / wrong-shape MQTT payloads: logged, ignored (no throw, no handler dispatch).
- Storage permanent failure: surfaced as `INDEXEDDB_OPEN_FAILED_PERMANENT` on `status.error`
  and `state:"error"`.
- MQTT disconnect: existing 5 s auto-reconnect; LWT covers unexpected drop; reconnect
  resubscribes and resumes both heartbeats.
- Reserved error codes are typed but not emitted; consumers treat unknown codes as opaque.

## Testing

The repo has no test runner. Add **Vitest** (jsdom env) and cover the pure logic; mock
`mqttService` to assert published payloads.

- **mqtt parsing**: each topic leaf parses its expected shape; wrong shapes are ignored;
  `commands/app` JSON vs bare-string discrimination.
- **player mode mapping**: only `loop`/`browse`/`custom` reachable; removed modes no longer
  produce branches; showcase-as-Browse opens the grid.
- **navigation**: `nodeId`/`path`/`showcaseOpen` correct across select/back/home/submenu.
- **status payload**: always carries `version`/`uptime`/`error`; `navigation` omitted
  outside Browse; `screensaverActive` toggles correctly.
- **trigger pipeline**: `trigger_play` → completion → exactly one `triggerEnded:true`.
- **error**: storage permanent failure emits the conformant code; healthy status is
  `error:null`.
- **supervisor emulation**: `system/heartbeat` shape; graceful-offline on quit; LWT
  registered with correct payload.

Manual verification guide (per user convention) to be written into `docs/` after
implementation: round-trip each command from a mock CMS, confirm payloads on the bus, and
exercise the two-tier-liveness states.

## Out of scope

- IoT topic handling in the Player (CMS/Bridge own it).
- WoL emission and `system/crash` self-reporting (impossible / inherently Sentinel's).
- Event→action *binding engine* (CMS-side); Player only emits the keys.
- Visual redesign, transitions, kiosk-mode/OS integration (tracked separately).
- Changes to other reference repos beyond the one-line Standard link fix.
