# Umka Player - Architecture

This document describes the internal architecture of the Umka Player reference implementation.

> **Note:** This is the simplified MIT reference implementation. It includes power and app lifecycle commands within the player itself. Production deployments should use a separate Sentinel service for control plane operations. See the [Control Plane](#control-plane-separation) section and `STANDARD.md` Section 9 for details.

---

## Table of Contents

1. [Directory Structure](#directory-structure)
2. [Service Architecture](#service-architecture)
3. [State Management](#state-management)
4. [Data Flow](#data-flow)
5. [Control Plane Separation](#control-plane-separation)
6. [Customization Points](#customization-points)

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
│  AppState: screensaver | menu | content | error
│  Mode: browse | loop | projector | audio
│  PlaybackState: idle | playing | paused
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

Projector Mode:
  screensaver --trigger--> content --end--> screensaver
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
- Parse and route commands
- Publish status and heartbeat
- Handle reconnection

**Topic Subscriptions:**
```typescript
umka/kiosks/{slug}/commands/power      // Reference impl only — moves to Sentinel in production
umka/kiosks/{slug}/commands/app
umka/kiosks/{slug}/commands/playback
umka/kiosks/{slug}/commands/volume
umka/kiosks/{slug}/commands/locale
umka/kiosks/{slug}/commands/loop
```

**Publications:**
```typescript
umka/kiosks/{slug}/status      // On state change (QoS 0, retain)
umka/kiosks/{slug}/heartbeat   // Every 10s (QoS 0)
```

**Reconnection:**
- Auto-reconnect every 5 seconds on connection loss
- Resubscribe to all topics on reconnect
- Resume heartbeat immediately

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

### Reference Implementation (This Repo)

This simplified MIT reference implementation handles everything in one Electron application:
- Power commands (`shutdown`, `reboot`) are handled via Electron IPC in the main process
- App restart uses `window.location.reload()`
- No external watchdog or system health reporting

This is acceptable for development, testing, and small deployments.

### Production Architecture

Production deployments separate the **control plane** (Sentinel) from the **content plane** (Player):

```
┌─────────────────────────────────────────────────┐
│                    MQTT Broker                    │
│                                                  │
│  system/*       ← Sentinel (power, lifecycle)    │
│  commands/*     ← Player (playback, content)     │
└──────────┬───────────────────┬───────────────────┘
           │                   │
     ┌─────▼──────┐     ┌─────▼──────┐
     │  Sentinel   │     │   Player   │
     │  (Service)  │     │ (Electron) │
     └─────────────┘     └────────────┘
```

**Why separate?** If the player hangs or crashes, the kiosk remains remotely manageable. Sentinel can reboot the PC, kill and restart the player, and report system health — all independently.

**What changes in the player for production:**
- Remove power command handlers (`system-shutdown`, `system-reboot` IPC handlers)
- Remove `restart` command handler from player service
- Remove `commands/power` MQTT subscription
- Add `updating.lock` file write before auto-updates (so Sentinel pauses its watchdog)

**What stays the same:**
- All playback, navigation, content, volume, locale commands
- Player heartbeat and status publishing
- Content sync
- electron-builder auto-update flow

See `STANDARD.md` Section 9 for the full control plane specification.

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

4. **Document in `STANDARD.md`** if it should be part of the standard

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
| Power control | Not available | OS commands via IPC | Handled by Sentinel |
| App lifecycle | Not available | Self-restart | Managed by Sentinel |
| Watchdog | Not available | Not available | Sentinel monitors player |
| System health | Not available | Not available | Sentinel reports CPU/RAM/disk |
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
2. If yes: Update `STANDARD.md` and reference implementation
3. If no: Keep as museum-specific customization
4. Document in this file if it changes architecture

**Standard compliance:**
Run compliance checklist in `STANDARD.md` before release.
