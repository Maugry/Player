# Umka Player - Reference Implementation

**Version:** 0.2.0 (Prototype)
**License:** MIT
**Standard:** Umka Kiosk Standard v1.26.5.1

## Overview

Umka Player is the **MIT-licensed reference implementation** of the Umka Kiosk Standard - an open protocol for museum kiosk systems.

Built on Electron + React + TypeScript, it provides a universal content playback application supporting multiple operating modes for different hardware setups and use cases.

**Key Points:**
- 📖 **Open Standard** - Umka protocol is freely available; all implementations follow the same spec
- 🔓 **MIT License** - Reference code is open source
- 🎨 **Client Customizations** - Museum-specific features remain proprietary
- 🔌 **Standards Compliance** - Ensures compatibility with Umka CMS, guide tablets, and IoT devices

This is an **all-in-one reference build**: it demonstrates the full standard surface
solo — including two-tier liveness — by emulating the Supervisor (Sentinel) control
plane within the single application (see *Two-Tier Liveness* below and `src/services/supervisor.ts`).

The canonical, versioned specification lives in its own repository:
**https://github.com/Maugry/Standard**

**📋 Documentation:**
- [STANDARD.md](./STANDARD.md) - Pointer to the canonical Umka Kiosk Standard repository
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Internal architecture and customization guide

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Electron | Cross-platform desktop application |
| Frontend | React + TypeScript | UI components and state management |
| Video Playback | HTML5 Video | Native browser video support |
| Communication | MQTT.js | Real-time command protocol |
| API Client | Fetch API | Content synchronization via REST |
| Storage | IndexedDB + File System | Offline content caching |

---

## Supported Features (Umka Standard v1.26.5.1)

### ✅ Core Features

- [x] **Operating Modes & Profiles**
  - Wire modes: `loop`, `browse`, `custom`
  - Profiles (content-package configuration, not modes): Continuous, Interactive, Triggered, Audio, Projector, Catalog, Showcase
  - See *Operating Modes vs. Profiles* below

- [x] **Content Types**
  - Video playback (MP4, WebM)
  - Article viewing (rich text with images)
  - Image showcases (galleries)
  - Multi-level menu navigation
  - Screensaver (video, image, animation)

- [x] **MQTT Remote Control**
  - Playback control (play, pause, stop, next, prev, home, screensaver, seek)
  - Trigger pipeline (`trigger_play` with media envelope → one-shot `triggerEnded`)
  - Volume adjustment (0-100)
  - Mode switching (loop ↔ browse ↔ custom)
  - Content selection by ID
  - Power management (off, reboot) — Supervisor-emulated
  - App lifecycle (sync, restart, quit)
  - Locale switching (ru, en)
  - Loop toggle

- [x] **Two-Tier Liveness** (Supervisor-emulated)
  - `system/heartbeat` every 10s (retained)
  - MQTT Last Will (LWT) on ungraceful disconnect
  - Graceful-offline publish on clean shutdown

- [x] **Status Reporting**
  - Real-time playback status via MQTT
  - Heartbeat every 10 seconds
  - Current content information
  - Online/offline detection

- [x] **Local-First Architecture**
  - Content always played from local storage, not streamed from server
  - Background sync when server available
  - Server connectivity loss has no immediate effect on playback
  - Automatic reconnection on network restore

- [x] **Content Synchronization**
  - CMS-agnostic REST API integration
  - Automatic content package loading
  - Background media caching
  - Incremental sync support

- [x] **Guide-Only Content** (Папка экскурсовода)
  - Hidden content folders for museum guides
  - Filtered from visitor-facing displays
  - Playable via guide tablet control

- [x] **Multi-Language Support**
  - Dynamic locale switching
  - Localized content delivery
  - Persistent locale preference

### 🚧 Partially Implemented

- [ ] **Electron Kiosk Mode** - Browser fullscreen only (no OS-level kiosk mode yet)
- [ ] **Keystone Correction** - Not implemented (projector mode hardware feature)
- [ ] **Video Transitions** - Basic state machine, no smooth transitions
- [ ] **Persistent Background** - Reloads between content switches

### 📋 Planned Features (Not in Prototype)

- [ ] Auto-update system
- [ ] Remote diagnostics
- [ ] Advanced error recovery
- [ ] Multi-monitor support
- [ ] Hardware sensor integration
- [ ] Advanced analytics

---

## Operating Modes vs. Profiles

The Player distinguishes **modes** (the wire-level operating mode, published on `status.mode`)
from **profiles** (a rendering hint that configures a content package for a particular
hardware setup). This is the key change from earlier standard versions, where the old
Projector/Audio/Showcase behaviours were modes.

### Modes (wire vocabulary)

The `mode` field on the wire is exactly one of:

| Mode | Description |
|------|-------------|
| `loop` | Automatic cyclic playback of a media playlist |
| `browse` | Interactive menu/catalog for visitor self-service content selection |
| `custom` | Non-standardized functionality (e.g., interactive game); minimal integration (heartbeat + status) |

`game` is a specialisation of `custom`, **not** a separate mode.

### Profiles (content-package configuration, NOT modes)

A profile is a rendering hint only — it is **never published on the wire**. It decides
whether controls, screensaver, or a video element are shown, but Loop and Browse behaviour
are otherwise identical regardless of profile. The Player accepts the following profiles
(`KioskProfile` in `src/types/index.ts`):

| Profile | Underlying mode | Use case | Touch | Display |
|---------|-----------------|----------|-------|---------|
| `continuous` | loop | LED panels, video walls | No | Yes |
| `interactive` | loop | Touchscreen kiosks (screensaver + controls) | Yes | Yes |
| `triggered` | loop | Exhibits with IoT buttons (`trigger_play`) | No | Yes |
| `audio` | loop | Background music in halls | No | No |
| `projector` | loop | Short-throw projectors (passive) | No | Yes |
| `catalog` | browse | Standard catalog / menu navigation | Yes | Yes |
| `showcase` | browse | Single showcase grid opened directly | Yes | Yes |

### Loop mode

```
Playlist[0] → Playlist[1] → ... → Playlist[n] → (loop)
```

### Browse mode

```
Screensaver → (touch) → Catalog → (select) → Object Detail
                          ↑            ↓
                          └── (back/idle timeout)
```

- Grid of cards with images and titles
- Detailed object view with media gallery (carousel)
- Video, article, and image gallery content types
- Hierarchical navigation (submenus)
- Configurable screensaver with title, subtitle, and optional "Start" button
- A Browse package whose only content is top-level `showcaseItems` opens the showcase grid directly (Showcase profile)

### Custom mode

Non-standardized functionality (e.g., interactive game). Minimal Umka integration:
heartbeat + status reporting. Power and lifecycle are handled by the Supervisor.

---

## REST API (Content Synchronization)

**Base URL:** Configured in `settings.json` as `serverUrl`

The standard defines the API contract. Server-side CMS implementation is not prescribed (reference implementation uses Payload CMS).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kiosks/{kioskSlug}` | GET | Get kiosk configuration |
| `/api/content-packages/{id}` | GET | Get content package |
| `/api/media/{id}/file` | GET | Download media file |
| `/api/kiosks/{kioskSlug}/sync-complete` | POST | Confirm sync |

See the *REST API* section of the [canonical standard](https://github.com/Maugry/Standard) for the full API specification.

---

## MQTT Protocol (Real-Time Commands)

**Broker URL:** Configured in `settings.json` as `mqttUrl`

### Topic Structure

All topics use the base topic:
```
umka/kiosks/{kioskSlug}/...
```

Where `{kioskSlug}` is the unique identifier for each kiosk. Commands are subscribed
at `.../commands/{leaf}`, status is published retained at `.../status`, and the Player
heartbeat at `.../heartbeat`.

### Per-Topic Payload Parsing

Unlike a blanket `JSON.parse`, each command topic has its own expected payload shape
(see `parseCommand` in `src/services/mqtt.ts`). A payload that does not match its topic's
expected shape is logged and ignored.

| Topic (`.../commands/...`) | Payload shape | Example |
|----------------------------|---------------|---------|
| `volume` | bare integer 0–100 | `75` |
| `locale` | bare or JSON string | `"en"` |
| `loop` | bare boolean | `true` |
| `power` | bare string (Supervisor-emulated) | `off` / `shutdown` / `reboot` |
| `playback` | JSON `{ "action", ... }` | see below |
| `app` | JSON `{ "action", ... }` | see below |

### Playback Commands (`.../commands/playback`)

```json
{ "action": "play", "mediaId": "media-uuid" }    // Play specific media by ID
{ "action": "content", "contentId": "menu-uuid" } // Play a specific menu item by ID
{ "action": "pause" }                             // Pause current playback
{ "action": "stop" }                              // Stop and return to menu/screensaver
{ "action": "next" }                              // Next in playlist/showcase
{ "action": "prev" }                              // Previous in playlist/showcase
{ "action": "home" }                              // Return to main menu (Browse)
{ "action": "screensaver" }                       // Force screensaver/idle
{ "action": "seek", "value": 30 }                 // Seek current media to position (seconds)
{ "action": "trigger_play",                       // Trigger pipeline (see below)
  "mediaId": "media-uuid",
  "mediaUrl": "media-cache://local/...",
  "mediaMimeType": "video/mp4",
  "mediaTitle": "Optional title" }
```

**Trigger pipeline:** `trigger_play` carries a full media envelope
(`mediaId`, `mediaUrl`, `mediaMimeType`, `mediaTitle`). The Player plays the enveloped media
to completion and emits `triggerEnded: true` on `status` **exactly once** when it finishes.

### App Commands (`.../commands/app`)

Only JSON `{ "action" }` payloads are acted upon. **Bare-string payloads are ignored** —
those (`start` / `stop` / `restart`) belong to the Supervisor, not the Player.

```json
{ "action": "sync" }     // Trigger content resync from CMS
{ "action": "mode", "value": "loop" } // Change operating mode (loop | browse | custom)
{ "action": "restart" }  // Renderer reload (window.location.reload — dev path)
{ "action": "quit" }     // Graceful application quit (Electron IPC)
```

### Outgoing Status (Kiosk → Server)

#### Kiosk Status
```
Topic: umka/kiosks/{kioskSlug}/status
QoS: 0
Retain: true
```

**Payload** (always-present fields plus optional ones):
```json
{
  "kioskId": "uuid",
  "state": "playing",        // idle | playing | paused | loading | error
  "mode": "browse",          // loop | browse | custom
  "volume": 80,
  "locale": "ru",
  "timestamp": "2026-06-02T10:30:00Z",
  "version": "0.2.0",
  "uptime": 3600,            // seconds since app start
  "error": null,             // KioskError | null

  "currentContent": {        // optional
    "type": "video",         // video | article | showcase
    "id": "media-uuid",
    "title": "Video Title",
    "position": 45.2,        // seconds (optional)
    "duration": 120.5        // seconds (optional)
  },
  "navigation": {            // optional — Browse mode only
    "nodeId": "section-uuid",
    "path": ["root-uuid", "section-uuid"],
    "showcaseOpen": false
  },
  "screensaverActive": false, // optional
  "triggerEnded": true        // optional — one-shot true after a triggered play ends
}
```

| Field | Presence | Description |
|-------|----------|-------------|
| `kioskId`, `state`, `mode`, `volume`, `locale`, `timestamp`, `version`, `uptime`, `error` | always | `error` is `KioskError` or `null` |
| `currentContent` | optional | Present when there is active/selected content |
| `navigation` | optional | Browse mode only: `{ nodeId, path[], showcaseOpen }` |
| `screensaverActive` | optional | Whether the screensaver is currently showing |
| `triggerEnded` | optional | `true` exactly once after a triggered play completes |

**Published when:** playback state, content, volume, mode, locale, navigation, screensaver,
or error changes.

#### Heartbeat
```
Topic: umka/kiosks/{kioskSlug}/heartbeat
QoS: 0
Interval: Every 10 seconds
```

**Payload:**
```json
{
  "kioskId": "uuid",
  "timestamp": "2026-06-02T10:30:00Z",
  "version": "0.2.0",
  "uptime": 3600
}
```

### Supervisor Topics (emulated by this all-in-one build)

`commands/power`, `system/heartbeat`, the MQTT Last Will (LWT), and graceful-offline are
**Supervisor (Sentinel) topics**. In production a separate Sentinel process owns them; this
all-in-one reference build emulates them in `src/services/supervisor.ts` so it can
demonstrate the full standard solo.

- `commands/power` (bare `off` / `shutdown` / `reboot`) — Supervisor-emulated
- `system/heartbeat` — published every 10s, retained, with `player`/`system` blocks
- **LWT** — registered on `system/heartbeat`; on ungraceful disconnect the broker publishes `status:"offline"` with **no** `graceful` flag
- **Graceful-offline** — on clean shutdown the Player publishes `{ status:"offline", graceful:true }` (retained)

The reference build does **not** publish `system/crash` and does **not** emit Wake-on-LAN —
a running process cannot report its own crash or power itself on; those remain the real
Sentinel's job in production.

---

## Configuration

### settings.json

Located at: `public/settings.json` (development) or Electron user data directory (production)

```json
{
  "kioskId": "uuid-of-kiosk",
  "kioskSlug": "kiosk-main-hall",
  "serverUrl": "http://localhost:3000",
  "mqttUrl": "mqtt://localhost:1883",
  "museumId": "museum-uuid",
  "mode": "browse",
  "network": {
    "macAddress": "00:11:22:33:44:55"
  },
  "display": {
    "fullscreen": true,
    "cursor": false
  },
  "debug": {
    "showDevTools": false,
    "logLevel": "info"
  }
}
```

---

## Local Storage Structure

### IndexedDB (`umka-kiosk`)

**Object Stores:**
- `content-packages` - Cached content metadata
- `media-metadata` - Media file cache metadata
- `sync-state` - Last sync timestamp and package version

### File System (Electron only)

```
{userData}/umka-player/
├── media-cache/
│   ├── {mediaId}.mp4
│   ├── {mediaId}.jpg
│   └── ...
└── settings.json
```

**Protocol:** `media-cache://local/{filename}`

Custom protocol registered in Electron main process for secure local media access.

---

## Development

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm

### Install Dependencies
```bash
pnpm install
```

### Run Development Server (Browser Mode)
```bash
pnpm dev
```

Opens at `http://localhost:5173`

**Note:** Browser mode has limited functionality:
- No Electron APIs (power control, file system)
- Media cached as blob URLs (temporary)
- Suitable for UI/UX development

### Run in Electron (Full Features)
```bash
pnpm electron:dev
```

### Build for Production
```bash
pnpm build
```

### Type Check
```bash
pnpm type-check
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      UMKA PLAYER                         │
├─────────────────────────────────────────────────────────┤
│  UI Layer                                                │
│  ┌──────────────┐ ┌──────────┐ ┌──────────────────┐     │
│  │ Screensaver  │ │  Menu    │ │ Content Viewers  │     │
│  │              │ │ (Browse) │ │ Video/Article/   │     │
│  │              │ │          │ │ Showcase         │     │
│  └──────────────┘ └──────────┘ └──────────────────┘     │
├─────────────────────────────────────────────────────────┤
│  Service Layer                                           │
│  ┌────────────┐ ┌───────────┐ ┌──────────────────┐      │
│  │ Player     │ │ MQTT      │ │ API Service      │      │
│  │ Service    │ │ Service   │ │ (REST)           │      │
│  └────────────┘ └───────────┘ └──────────────────┘      │
│  ┌────────────┐ ┌───────────┐                           │
│  │ Storage    │ │ Config    │                           │
│  │ Service    │ │ Loader    │                           │
│  └────────────┘ └───────────┘                           │
└─────────────────────────────────────────────────────────┘
```

### Key Services

**Player Service** (`src/services/player.ts`)
- State machine for app states (screensaver, menu, content, error)
- Mode management (loop, browse, custom)
- Playlist/showcase navigation
- Command handling from MQTT
- Status publishing

**MQTT Service** (`src/services/mqtt.ts`)
- Connection management with auto-reconnect
- Command topic subscriptions
- Status and heartbeat publishing
- Message parsing and routing

**API Service** (`src/services/api.ts`)
- REST client for CMS content API
- Content package fetching
- Type transformation (CMS → App types)

**Storage Service** (`src/services/storage.ts`)
- IndexedDB for metadata
- File system caching (Electron)
- Offline content access
- Cache management

---

## Local-First Architecture

The kiosk always plays content from local storage, regardless of server connectivity. Server connection is used for synchronization and remote control, not for primary operation.

**Normal operation:**
```
Local Storage → Playback Engine
     ↑
Background Sync ← Server (when available)
```

**When server connection is lost:**
1. **Playback unaffected** — content is always local
2. **Heartbeat stops** — server marks kiosk as offline
3. **Remote control unavailable** — guide commands and IoT triggers require connectivity
4. **Auto-reconnect** — attempts every 5 seconds in background
5. **On reconnection** — resume heartbeat, check for content updates

---

## Known Limitations (Prototype)

1. **No Electron kiosk mode** - Uses browser fullscreen only
2. **No transitions** - Instant content switching (redesign planned)
3. **No persistent background** - Reloads on mode change
4. **No update system** - Manual deployment required
5. **Basic error handling** - No advanced recovery strategies
6. **Browser mode limitations** - Full features require Electron

---

## Deployment Guides

### Electron Kiosk Mode (Windows)
For production deployment, configure Windows kiosk mode:
- Windows 10/11 IoT Enterprise LTSC recommended
- Use Assigned Access for true kiosk mode
- Configure auto-login
- Add Umka Player to startup
- Disable Windows Update

### Hardware Requirements
**Minimum specs:**
- CPU: Intel i3 / AMD Ryzen 3
- RAM: 4 GB (8 GB recommended)
- Storage: 64 GB SSD (256 GB recommended)
- Network: 100 Mbps Ethernet (1 Gbps recommended)
- Display: 1920x1080 (4K supported with dedicated GPU)

**For 4K video:**
- Hardware H.265/HEVC decode required
- Dedicated GPU recommended

**Network requirements:**
- MQTT: TCP port 1883 (or 8883 for TLS)
- REST API: TCP port 443 (HTTPS)
- Wake-on-LAN: UDP port 9 (broadcast)
- Latency: < 100ms to server

---

## License and Standards Compliance

### MIT Licensed Reference Implementation

This software is released under the **MIT License** as the reference implementation of the **Umka Kiosk Standard v1.26.5.1** (canonical spec: https://github.com/Maugry/Standard).

**Why MIT License?**

1. **Open Standard** - The Umka protocol, API, and MQTT message formats are open standards that any museum kiosk system should be able to implement
2. **Client Transparency** - All client implementations are based on this public reference implementation
3. **No Code Reuse Confusion** - Similar code across client projects is intentional - they all implement the same Umka standard
4. **Customization Freedom** - Each client receives a fork that can be customized while maintaining standard compliance

### What This Means for Clients

When you receive an Umka Player implementation:

✅ **You are getting:** A customized implementation of the open Umka Kiosk Standard
✅ **Based on:** This MIT-licensed reference implementation
✅ **Standards compliance:** Your player follows the same MQTT protocol, REST API, and operating modes as all Umka systems
✅ **Your customizations:** Any museum-specific features, branding, and content are proprietary to your project

### Standards Maintained

All client implementations MUST maintain compatibility with:
- Umka MQTT Protocol (topic structure, message formats)
- Umka REST API (endpoints, data structures)
- Umka Operating Modes (Loop, Browse, Custom)
- Umka Content Package Format
- Local-first content architecture

This ensures:
- Guide tablets work with any Umka kiosk
- Content packages are portable
- System administration is consistent
- Future updates maintain compatibility

See [LICENSE](./LICENSE) for full MIT license text.

---

**Copyright © 2026 Umka Museum System**
**Reference Implementation: MIT License**
**Client Customizations: Proprietary to respective clients**
