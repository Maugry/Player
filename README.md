# Umka Player - Reference Implementation

**Version:** 0.1.0 (Prototype)
**License:** MIT
**Standard:** Umka Kiosk Standard v1.2

## Overview

Umka Player is the **MIT-licensed reference implementation** of the Umka Kiosk Standard - an open protocol for museum kiosk systems.

Built on Electron + React + TypeScript, it provides a universal content playback application supporting multiple operating modes for different hardware setups and use cases.

**Key Points:**
- 📖 **Open Standard** - Umka protocol is freely available; all implementations follow the same spec
- 🔓 **MIT License** - Reference code is open source
- 🎨 **Client Customizations** - Museum-specific features remain proprietary
- 🔌 **Standards Compliance** - Ensures compatibility with Umka CMS, guide tablets, and IoT devices

This prototype implements the core Umka kiosk standard with offline support, MQTT command handling, and content synchronization.

**📋 Documentation:**
- [STANDARD.md](./STANDARD.md) - Complete Umka Kiosk Standard v1.2 protocol specification
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

## Supported Features (Umka Standard v1.2)

### ✅ Core Features

- [x] **Multiple Operating Modes**
  - Loop Mode - Automatic cyclic playback of media playlist (video player)
    - Continuous (no touch), Interactive (touch + screensaver), Triggered (IoT button), Audio-only, Projector (passive)
  - Browse Mode - Interactive menu/catalog for visitor content selection (showcase)
  - Custom Mode - Non-standardized functionality (e.g., interactive game)

- [x] **Content Types**
  - Video playback (MP4, WebM)
  - Article viewing (rich text with images)
  - Image showcases (galleries)
  - Multi-level menu navigation
  - Screensaver (video, image, animation)

- [x] **MQTT Remote Control**
  - Playback control (play, pause, stop, next, prev)
  - Volume adjustment (0-100)
  - Mode switching (loop ↔ browse ↔ custom)
  - Content selection by ID
  - Power management (shutdown, reboot)
  - App lifecycle (restart, sync)
  - IoT trigger events
  - Locale switching (ru, en)
  - Loop toggle

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

## Operating Modes

### Loop Mode
Automatic cyclic playback of a media playlist. Configurable for different hardware setups:

| Configuration | Use Case | Touch | Display |
|--------------|----------|-------|---------|
| Continuous | LED panels, video walls | No | Yes |
| Interactive | Touchscreen kiosks | Yes (screensaver + controls) | Yes |
| Triggered | Exhibits with IoT buttons | No (IoT trigger) | Yes |
| Audio-only | Background music in halls | No | No |
| Projector | Short-throw projectors | No (passive) | Yes |

```
Playlist[0] → Playlist[1] → ... → Playlist[n] → (loop)
```

### Browse Mode
Interactive menu/catalog for visitor content selection:

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

### Custom Mode
Non-standardized functionality (e.g., interactive game). Minimal Umka integration: heartbeat + power management only.

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

See [STANDARD.md](./STANDARD.md) Section 6 for full API specification.

---

## MQTT Protocol (Real-Time Commands)

**Broker URL:** Configured in `settings.json` as `mqttUrl`

### Topic Structure

All topics follow the pattern:
```
umka/kiosks/{kioskSlug}/{category}/{action}
```

Where `{kioskSlug}` is the unique identifier for each kiosk.

---

### Incoming Commands (Server → Kiosk)

#### Power Management
```
Topic: umka/kiosks/{kioskSlug}/commands/power
```

**Payload:**
```json
"off"     // Shutdown OS
"reboot"  // Reboot OS
```

**Actions:**
- Saves application state
- Calls OS shutdown/reboot command
- Publishes offline status before shutdown

---

#### Application Control
```
Topic: umka/kiosks/{kioskSlug}/commands/app
```

**Payload:**
```json
{ "action": "sync" }    // Reload content from CMS
{ "action": "restart" } // Restart application
{ "action": "mode", "value": "loop" } // Change operating mode
```

**Actions:**
- `sync`: Triggers content resync from server
- `restart`: Relaunches application (preserves state)
- `mode`: Switches between loop/browse/custom modes

---

#### Playback Control
```
Topic: umka/kiosks/{kioskSlug}/commands/playback
```

**Payload:**
```json
{ "action": "play", "mediaId": "video-uuid" }   // Play specific media
{ "action": "play", "contentId": "menu-uuid" }  // Play menu item
{ "action": "pause" }                           // Pause current playback
{ "action": "stop" }                            // Stop and return to menu/screensaver
{ "action": "next" }                            // Next in playlist/showcase
{ "action": "prev" }                            // Previous in playlist/showcase
{ "action": "home" }                            // Return to main menu
```

**Media Playback Behavior:**
- `mediaId`: Searches playlist, guide content, then menu items
- `contentId`: Searches menu items by ID
- Auto-navigates to content in browse mode
- In loop mode, jumps to specific playlist index

---

#### Volume Control
```
Topic: umka/kiosks/{kioskSlug}/commands/volume
```

**Payload:**
```json
75  // Volume level 0-100
```

**Actions:**
- Sets system volume
- Persists in player state
- Publishes updated status

---

#### Locale Control
```
Topic: umka/kiosks/{kioskSlug}/commands/locale
```

**Payload:**
```json
"ru"  // Russian
"en"  // English
```

**Actions:**
- Switches UI language
- Triggers content reload if needed
- Persists preference

---

#### Loop Control
```
Topic: umka/kiosks/{kioskSlug}/commands/loop
```

**Payload:**
```json
true   // Enable looping
false  // Disable looping
```

**Actions:**
- Toggles video loop behavior
- Applies to current and future playback

---

### Outgoing Status (Kiosk → Server)

#### Kiosk Status
```
Topic: umka/kiosks/{kioskSlug}/status
QoS: 0 (fire and forget)
Retain: true
```

**Payload:**
```json
{
  "kioskId": "uuid",
  "state": "playing",        // idle | playing | paused | loading | error
  "mode": "browse",          // loop | browse | custom
  "volume": 80,
  "locale": "ru",
  "currentContent": {
    "type": "video",         // video | article | showcase
    "id": "media-uuid",
    "title": "Video Title",
    "position": 45.2,        // seconds (optional)
    "duration": 120.5        // seconds (optional)
  },
  "timestamp": "2026-02-06T10:30:00Z"
}
```

**Published when:**
- Playback state changes
- Content changes
- Volume changes
- Mode changes
- Locale changes

---

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
  "timestamp": "2026-02-06T10:30:00Z",
  "version": "0.1.0",
  "uptime": 3600,           // seconds since app start
  "diskFreeGB": 45.2        // optional
}
```

**Server behavior:**
- No heartbeat for >30s → kiosk marked offline
- No heartbeat for >5min → alert administrator

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

This software is released under the **MIT License** as the reference implementation of the **Umka Kiosk Standard v1.2**.

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
