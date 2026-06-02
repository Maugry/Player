# Umka Player - Architecture

This document describes the internal architecture of the Umka Player reference implementation.

> **Note:** This is the **all-in-one MIT reference build**. It emulates the Supervisor
> (Sentinel) control plane within the player itself — power commands and two-tier liveness
> are demonstrated solo. Everything that moves to a separate Sentinel in production is
> isolated in `src/services/supervisor.ts`. See [Control Plane Separation](#control-plane-separation)
> and the *Supervisor (control plane)* section of the [canonical standard](https://github.com/Maugry/Standard).

---

## Directory Structure

```
src/
├── screens/              # UI components for each app state
│   ├── Screensaver.tsx   # Idle state display
│   ├── BrowseMenu.tsx    # Interactive menu (browse mode)
│   ├── VideoPlayer.tsx   # Video playback UI
│   ├── ArticleViewer.tsx # Article display
│   ├── ShowcaseViewer.tsx # Image gallery
│   ├── LoadingScreen.tsx # App initialization
│   └── ErrorScreen.tsx   # Error state
│
├── services/             # Core business logic (singleton services)
│   ├── player.ts         # State machine, playback control
│   ├── mqtt.ts           # MQTT client, command handling
│   ├── api.ts            # REST API client
│   ├── storage.ts        # Offline caching (IndexedDB + files)
│   └── config.ts         # Settings loader
│
├── types/
│   └── index.ts          # TypeScript interfaces for Umka standard
│
├── App.tsx               # Root component, service initialization
└── main.tsx              # React app entry point

public/
└── settings.json         # Kiosk configuration (dev mode)

electron/                 # Electron main process (if using desktop mode)
└── main.js               # Window creation, IPC, file system access
```

---

## Service Architecture

### Singleton Pattern

All services are singletons to ensure consistent state across the application:

```typescript
// Export singleton instance
export const playerService = new PlayerService()
export const mqttService = new MqttService()
export const apiService = new ApiService()
export const storageService = new StorageService()
```

**Why singletons?**
- Shared state across all components
- No prop drilling
- Consistent service initialization
- Easy to mock for testing

---

## State Management

### Player Service - State Machine

The `PlayerService` is the central state machine managing the entire application:

```
┌─────────────────────────────────────────────┐
│          PlayerService (State Machine)       │
├─────────────────────────────────────────────┤
│  AppState: loading | screensaver | menu | content | error
│  Mode: loop | browse | custom
│  PlaybackState: idle | playing | paused | loading | error
│  CurrentContent: MenuItem | MediaItem | null
│  Volume: 0-100
│  Locale: "ru" | "en"
└─────────────────────────────────────────────┘
```

**State Transitions:**

```
Browse Mode:
  screensaver --wake--> menu --select--> content --back--> menu
                         ↑                                  ↓
                         └──────────── idle timeout ────────┘

Loop Mode:
  content[0] --next--> content[1] --next--> ... --loop--> content[0]

Triggered (loop profile / trigger pipeline):
  screensaver --trigger_play--> content --end--> screensaver (triggerEnded: true once)
```

### React State Updates

Services notify React components via observer pattern:

```typescript
// Component subscribes to state changes
useEffect(() => {
  const unsubscribe = playerService.onStateChange((newState) => {
    setPlayerState(newState)
  })
  return unsubscribe
}, [])
```

**Benefits:**
- React remains "dumb" - just renders current state
- Business logic in services, not components
- Easy to add new observers (e.g., analytics)

---

## Data Flow

### 1. Initialization Flow

```
User starts app
    │
    ├─> Load settings.json
    │
    ├─> Initialize services
    │   ├─> API Service (set base URL)
    │   ├─> Storage Service (open IndexedDB)
    │   └─> MQTT Service (connect to broker)
    │
    ├─> Try load from CMS
    │   ├─ Success → Cache content → Init player
    │   └─ Failure → Load from cache → Init player
    │
    └─> Render UI (subscribe to player state)
```

### 2. Command Flow (MQTT)

```
Guide Tablet                MQTT Broker           Kiosk
    │                            │                  │
    │  Publish command           │                  │
    ├───────────────────────────>│                  │
    │                            │  Forward         │
    │                            ├─────────────────>│
    │                            │                  │
    │                            │         Handle command
    │                            │         Update state
    │                            │         Notify React
    │                            │         Render change
    │                            │                  │
    │                            │  Publish status  │
    │                            │<─────────────────┤
    │  Receive status            │                  │
    │<───────────────────────────┤                  │
```

### 3. Content Sync Flow

```
CMS triggers sync command via MQTT
    │
    ├─> playerService.onSyncRequest()
    │
    ├─> apiService.getKioskConfig()
    │   └─> Get assigned content package ID
    │
    ├─> apiService.getContentPackage(id)
    │   └─> Fetch complete package with media refs
    │
    ├─> storageService.cacheContentPackage()
    │   ├─> Extract all MediaItems
    │   ├─> Download missing files
    │   ├─> Store in IndexedDB + filesystem
    │   └─> Save manifest
    │
    └─> playerService.reinit(newContent)
        └─> Restart with fresh content
```

---

## Service Details

### Player Service (`src/services/player.ts`)

**Responsibilities:**
- Manage app state machine
- Handle MQTT commands
- Control playback (play, pause, next, prev)
- Menu navigation
- Publish status to MQTT
- Idle timeout management

**Key Methods:**
```typescript
init(content, mode)           // Initialize with content package
handleCommand(cmd)            // Process MQTT command
selectMenuItem(item)          // Navigate to content
play() / pause() / stop()     // Playback control
next() / previous()           // Playlist navigation
publishStatus()               // Send status to MQTT
```

**Filters:**
- Automatically filters `guideOnly` content from visitor displays
- Applies to menu items, playlist items, showcase items

---

### MQTT Service (`src/services/mqtt.ts`)

**Responsibilities:**
- Connect to MQTT broker
- Subscribe to command topics
- Parse and route commands (per-topic payload parsing)
- Publish status and heartbeat
- Handle reconnection

**Topic Subscriptions:**
```typescript
umka/kiosks/{slug}/commands/power      // Supervisor-emulated — owned by the Sentinel in production
umka/kiosks/{slug}/commands/app
umka/kiosks/{slug}/commands/playback
umka/kiosks/{slug}/commands/volume
umka/kiosks/{slug}/commands/locale
umka/kiosks/{slug}/commands/loop
```

**Per-topic payload parsing:** `parseCommand(leaf, raw)` keys on the topic leaf rather than
blindly `JSON.parse`-ing every payload: `volume` → bare integer, `locale` → bare/JSON string,
`loop` → bare boolean, `power` → bare string, `playback`/`app` → JSON `{ action, ... }`.
A payload that does not match its topic's expected shape is logged and ignored (MUST per
standard). For `commands/app`, only JSON `{ action }` is acted on; bare strings (the
Supervisor's `start`/`stop`/`restart`) are ignored.

**Publications:**
```typescript
umka/kiosks/{slug}/status             // On state change (QoS 0, retain)
umka/kiosks/{slug}/heartbeat          // Every 10s (QoS 0)
umka/kiosks/{slug}/system/heartbeat   // Supervisor emulation (see supervisor.ts)
```

**Reconnection:**
- Auto-reconnect every 5 seconds on connection loss
- Resubscribe to all topics on reconnect
- Resume heartbeat immediately

---

### Supervisor Service (`src/services/supervisor.ts`)

**The isolated control-plane seam.** This single file holds everything that "moves to the
Sentinel in production". The all-in-one reference build runs it so it can demonstrate
two-tier liveness without a separate process; a production deployment **deletes this file**
and runs a real Sentinel.

**Responsibilities (emulated):**
- Publish `system/heartbeat` every 10s, retained, with `player` and `system` blocks
  (`cpuPercent`/`memoryPercent` are reported as `0`; a real Sentinel measures them)
- Register the MQTT Last Will (LWT) on `system/heartbeat` (set up in `mqtt.ts` `connect`) —
  on ungraceful disconnect the broker publishes `status:"offline"` with **no** `graceful` flag
- Publish graceful-offline (`{ status:"offline", graceful:true }`, retained) on clean shutdown

**Deliberately NOT done** (inherently the real Sentinel's job): `system/crash` self-reporting
and Wake-on-LAN emission. A running process cannot reliably report its own crash or power
itself on. `commands/power` handling is also Supervisor-emulated.

---

### API Service (`src/services/api.ts`)

**Responsibilities:**
- Fetch content from CMS via REST API
- Transform CMS responses to app types
- Construct media URLs

**Endpoints:**
```typescript
/api/kiosks?where[slug][equals]={slug}  // Get kiosk config
/api/content-packages/{id}              // Get content package
/api/articles/{id}                      // Get article
```

**Type Transformations:**
- CMS response → ContentPackage
- CMS media → MediaItem
- Handles nested relations (depth=3)

---

### Storage Service (`src/services/storage.ts`)

**Responsibilities:**
- Cache content packages (IndexedDB)
- Download and cache media files
- Serve cached media (Electron: custom protocol, Browser: blob URLs)
- Track sync state

**IndexedDB Stores:**
```typescript
content-packages   // Content metadata
media-metadata     // Media file cache info
sync-state         // Last sync timestamp
```

**Electron File Storage:**
```
{userData}/umka-player/media-cache/
  ├─ {mediaId}.mp4
  ├─ {mediaId}.jpg
  └─ ...
```

**Custom Protocol (Electron):**
```typescript
media-cache://local/{filename}
```

Registered in Electron main process for secure local file access.

---

## Control Plane Separation

### Reference Build (This Repo)

This all-in-one MIT reference build **emulates** the Supervisor (Sentinel) control plane
within the single Electron application, so it can demonstrate the full standard — including
two-tier liveness — solo:
- Power commands (`off`/`shutdown`/`reboot`) are Supervisor-emulated and dispatched via Electron IPC
- App `restart` uses `window.location.reload()` (renderer reload — the documented dev path)
- `system/heartbeat`, LWT, and graceful-offline are emulated in `src/services/supervisor.ts`

This is acceptable for development, testing, and demos.

### Ownership: Player vs. Supervisor vs. CMS/Bridge

The standard assigns wire responsibilities explicitly. The design doc
(`docs/specs/2026-06-02-player-standard-v1.26.5.1-design.md`) carries the full ownership
table; the essentials:

| Concern | Owner | Player's role |
|---------|-------|---------------|
| `commands/playback`, `volume`, `locale`, `loop` | Player | Subscribe + act |
| `commands/app` JSON `{action}` (`sync`/`mode`/`quit`/`restart`) | Player | Subscribe + act (`restart` = renderer reload) |
| `commands/app` bare string (`start`/`stop`/`restart`) | Supervisor | Ignore (wrong shape) |
| `commands/power` (bare string) | Supervisor | **Emulated** in this build |
| `status`, `heartbeat` | Player | Publish |
| `system/heartbeat`, LWT, graceful-offline | Supervisor | **Emulated** in this build |
| `system/crash`, Wake-on-LAN | Supervisor / WoL relay | None (impossible for a running process) |
| `museum/.../iot/...` (status + command) | CMS + Bridge | **None** |

**There is no Player-side IoT wire work.** The standard's *reads direct, writes through CMS*
architecture puts all IoT command publishing in the CMS and all polling in the Bridge. The
Player participates only by emitting accurate `navigation.path`, `screensaverActive`, and
`triggerEnded` on its `status`, which the CMS keys on for event→action bindings.

### Production Architecture

Production deployments separate the **control plane** (Sentinel) from the **content plane** (Player):

```
┌─────────────────────────────────────────────────┐
│                    MQTT Broker                    │
│                                                  │
│  system/* + commands/power ← Sentinel             │
│  commands/* (content)      ← Player               │
└──────────┬───────────────────┬───────────────────┘
           │                   │
     ┌─────▼──────┐     ┌─────▼──────┐
     │  Sentinel   │     │   Player   │
     │  (control)  │     │ (Electron) │
     └─────────────┘     └────────────┘
```

**Why separate?** If the player hangs or crashes, the kiosk remains remotely manageable. The
Sentinel can reboot the PC, kill and restart the player, and report system health — all independently.

**What changes in the player for production:** delete `src/services/supervisor.ts` and remove
its single import. Everything that moves to the Sentinel — `system/heartbeat`, LWT,
graceful-offline, and `commands/power` emulation — lives behind that one seam. Power IPC
handlers in the Electron main process are likewise dropped.

**What stays the same:**
- All playback, navigation, content, volume, locale commands
- Player heartbeat and `status` publishing
- Content sync
- electron-builder auto-update flow

See the *Supervisor (control plane)* section of the [canonical standard](https://github.com/Maugry/Standard)
for the full control plane specification.

---

## Customization Points

### 1. Adding New Screen Types

To add a new content type (e.g., 3D model viewer):

1. **Define type in `src/types/index.ts`:**
```typescript
export interface MenuItem {
  contentType: 'video' | 'article' | 'showcase' | 'model3d'
  model3d?: Model3DData
}
```

2. **Create screen component in `src/screens/`:**
```typescript
export function Model3DViewer({ item, onBack, onHome }) {
  // Render 3D model
}
```

3. **Add to `App.tsx` rendering logic:**
```typescript
if (content.contentType === 'model3d') {
  return <Model3DViewer item={content} onBack={handleBack} />
}
```

4. **Update CMS schema** to support new content type

---

### 2. Custom MQTT Commands

To add custom museum-specific commands:

1. **Extend command type:**
```typescript
export interface KioskCommand {
  action: 'play' | 'pause' | 'custom_action'
  value?: any
}
```

2. **Add handler in `PlayerService.handleCommand()`:**
```typescript
case 'custom_action':
  // Your logic here
  break
```

3. **Subscribe to topic in `MqttService.subscribeToCommands()`:**
```typescript
`${baseTopic}/commands/custom`
```

4. **Document in the [canonical standard](https://github.com/Maugry/Standard)** if it should be part of the standard

---

### 3. Custom Screensaver

Replace `src/screens/Screensaver.tsx`:

```typescript
export function Screensaver({ onWake }: ScreensaverProps) {
  return (
    <div onClick={onWake}>
      {/* Your custom screensaver */}
      <YourAnimation />
    </div>
  )
}
```

Load from content package:
```typescript
contentPackage.screensaver = {
  type: 'custom',
  data: { ... }
}
```

---

### 4. Styling and Theming

**CSS Modules or Tailwind:**
Current implementation uses Tailwind CSS.

**Customization:**
```typescript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#your-museum-color',
      }
    }
  }
}
```

**Per-kiosk themes:**
Load theme from content package:
```typescript
contentPackage.theme = {
  primaryColor: '#...',
  fontFamily: '...',
}
```

Apply dynamically:
```typescript
document.documentElement.style.setProperty('--primary-color', theme.primaryColor)
```

---

### 5. Analytics Integration

Add observer to player state:

```typescript
// src/services/analytics.ts
class AnalyticsService {
  init() {
    playerService.onStateChange((state) => {
      if (state.appState === 'content') {
        this.trackContentView(state.currentContent)
      }
    })
  }

  trackContentView(content) {
    // Send to analytics backend
  }
}
```

---

## Testing Strategy

### Unit Tests
- Services: Mock MQTT/API responses
- Pure functions: Type transformations, filters

### Integration Tests
- Player state machine transitions
- Command → State → UI flow
- Offline/online switching

### E2E Tests
- Full user journeys in each mode
- MQTT command sequences
- Content sync process

**Mock CMS:**
Create test content packages in `public/mock-data/` for development.

---

## Performance Considerations

### Video Playback
- Use HTML5 video with hardware acceleration
- Preload next video in playlist (future optimization)
- Use poster images during loading

### Large Menus
- Virtualize long lists (react-window)
- Lazy load thumbnails
- Paginate if >100 items

### Offline Caching
- Cache only referenced media (don't pre-download everything)
- Implement cache size limits
- Prune old content packages

### State Updates
- Batch state changes (don't spam MQTT)
- Debounce status publications (max 1/second)
- Use React.memo for expensive components

---

## Browser vs Electron Differences

| Feature | Browser | Electron (Reference) | Electron + Sentinel (Production) |
|---------|---------|----------|----------|
| Media caching | Blob URLs (temp) | File system (persistent) | File system (persistent) |
| Power control | Not available | Supervisor-emulated (IPC) | Handled by Sentinel |
| App lifecycle | Not available | Renderer reload / self-quit | Managed by Sentinel |
| Watchdog | Not available | Not available | Sentinel monitors player |
| System health | Not available | Emulated (cpu/mem = 0) | Sentinel reports CPU/RAM/disk |
| Kiosk mode | Fullscreen API | OS-level kiosk mode | OS-level kiosk mode |
| Auto-start | Not available | Startup configuration | Sentinel starts player |
| File access | Limited | Full filesystem | Full filesystem |

**Development:**
Use browser for rapid UI development, Electron for integration testing.

---

## Deployment

### Browser Mode (Limited)
```bash
npm run build
# Deploy dist/ to web server
```

**Limitations:** No offline caching, no power control, no kiosk mode

### Electron (Recommended)
```bash
npm run electron:build
# Generates installers for Windows/Linux
```

**Distribute:**
- Windows: `.exe` installer
- Linux: `.AppImage` or `.deb`

**Configuration:**
Include `settings.json` in installer or configure via setup wizard.

---

## Security Notes

### Content Security Policy
Enable CSP in production to prevent XSS:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; media-src 'self' blob: data:">
```

### MQTT Authentication
Use TLS + client certificates in production:
```typescript
mqtt.connect('mqtts://broker:8883', {
  cert: fs.readFileSync('client-cert.pem'),
  key: fs.readFileSync('client-key.pem'),
  ca: fs.readFileSync('ca-cert.pem')
})
```

### API Authentication
Add API keys to requests:
```typescript
fetch(url, {
  headers: {
    'Authorization': `Bearer ${apiKey}`
  }
})
```

---

## Contributing

When adding features:
1. Check if it should be in the **standard** (affects all clients)
2. If yes: Update the [canonical standard](https://github.com/Maugry/Standard) and reference implementation
3. If no: Keep as museum-specific customization
4. Document in this file if it changes architecture

**Standard compliance:**
Run the compliance checklist in the [canonical standard](https://github.com/Maugry/Standard) before release.
