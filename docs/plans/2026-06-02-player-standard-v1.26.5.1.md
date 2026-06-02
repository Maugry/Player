# Umka Player → Standard v1.26.5.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the MIT reference Player from Standard v1.26.2 into full conformance with v1.26.5.1, and make the all-in-one binary demonstrate the whole standard (incl. two-tier liveness) by emulating the Supervisor.

**Architecture:** Singleton services keep their current observer interfaces. Changes are additive or internal. Wire `mode` collapses to `loop`/`browse`/`custom`; old projector/audio/showcase modes become content-package/profile configuration. A new `supervisor.ts` isolates everything that moves to the real Sentinel in production (system heartbeat, LWT, graceful-offline, power). No Player-side IoT work — the standard assigns IoT entirely to the CMS/Bridge.

**Tech Stack:** Electron 30, React 18, TypeScript 5 (strict), Vite 5, mqtt.js 5, Tailwind 4. Tests: Vitest + jsdom (added in Task 1).

**Design doc:** `docs/specs/2026-06-02-player-standard-v1.26.5.1-design.md`

**Reference:** Canonical standard at `github.com/Maugry/Standard` (v1.26.5.1). Key sections cited inline.

---

## Branch setup (do first)

- [ ] **Create the working branch**

Run:
```bash
cd /home/newub/w/Umka/prototype/player
git checkout -b feat/standard-v1.26.5.1
```
Expected: `Switched to a new branch 'feat/standard-v1.26.5.1'`

---

## Task 1: Test infrastructure (Vitest)

**Files:**
- Modify: `package.json` (add devDeps + `test` script + bump version)
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/smoke.test.ts`

- [ ] **Step 1: Add Vitest deps and scripts**

Edit `package.json`: bump `"version": "0.0.0"` → `"version": "0.2.0"`, add to `scripts`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```
Add to `devDependencies`:
```json
    "vitest": "^2.1.8",
    "jsdom": "^25.0.1"
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: vitest + jsdom resolved, lockfile updated.

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create `src/test/setup.ts`** (stub for global mocks; expanded later)

```typescript
// Global test setup. window.electronAPI is mocked per-test where needed.
import { vi } from 'vitest'

// Default no-op electronAPI so services that probe it don't throw.
;(globalThis as any).window = (globalThis as any).window ?? {}
;(window as any).electronAPI = {
  shutdown: vi.fn(),
  reboot: vi.fn(),
  quitApp: vi.fn(),
  getAppVersion: vi.fn().mockResolvedValue('0.2.0'),
}
```

- [ ] **Step 5: Create `src/test/smoke.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Run tests**

Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/test/
git commit -m "test: add Vitest harness and bump version to 0.2.0"
```

---

## Task 2: Version single-source

**Files:**
- Create: `src/version.ts`
- Test: `src/version.test.ts`

- [ ] **Step 1: Write the failing test**

`src/version.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { APP_VERSION } from '@/version'
import pkg from '../package.json'

describe('APP_VERSION', () => {
  it('is a semver string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
  it('matches package.json', () => {
    expect(APP_VERSION).toBe(pkg.version)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/version.test.ts`
Expected: FAIL — cannot find module `@/version`.

- [ ] **Step 3: Create `src/version.ts`**

```typescript
// Single source of the Player version. Keep in sync with package.json "version".
// Consumed by status, heartbeat, and system/heartbeat payloads.
export const APP_VERSION = '0.2.0'
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/version.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/version.ts src/version.test.ts
git commit -m "feat: add single-source APP_VERSION constant"
```

---

## Task 3: Types — v1.26.5.1 shapes

**Files:**
- Modify: `src/types/index.ts`
- Test: `src/types/types.test.ts` (compile-time assertions via `expectTypeOf`)

- [ ] **Step 1: Write the failing test**

`src/types/types.test.ts`:
```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { KioskMode, KioskStatus, KioskError, KioskCommand, KioskHeartbeat } from '@/types'

describe('v1.26.5.1 types', () => {
  it('KioskMode is exactly the three wire modes', () => {
    expectTypeOf<KioskMode>().toEqualTypeOf<'loop' | 'browse' | 'custom'>()
  })
  it('KioskStatus requires version/uptime/error', () => {
    expectTypeOf<KioskStatus>().toHaveProperty('version').toEqualTypeOf<string>()
    expectTypeOf<KioskStatus>().toHaveProperty('uptime').toEqualTypeOf<number>()
    expectTypeOf<KioskStatus>().toHaveProperty('error').toEqualTypeOf<KioskError | null>()
  })
  it('KioskCommand includes new actions', () => {
    const a: KioskCommand['action'] = 'trigger_play'
    const b: KioskCommand['action'] = 'screensaver'
    const c: KioskCommand['action'] = 'seek'
    const d: KioskCommand['action'] = 'quit'
    expectTypeOf(a).toBeString()
    expectTypeOf(b).toBeString()
    expectTypeOf(c).toBeString()
    expectTypeOf(d).toBeString()
  })
  it('KioskHeartbeat has no diskFreeGB', () => {
    expectTypeOf<KioskHeartbeat>().not.toHaveProperty('diskFreeGB')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/types/types.test.ts`
Expected: FAIL — type errors (KioskMode still has extra members; missing fields).

- [ ] **Step 3: Rewrite `src/types/index.ts`**

Replace the existing type declarations with:
```typescript
/**
 * Kiosk Types — Umka Kiosk Standard v1.26.5.1
 */

// Wire operating modes. Configurations (Continuous/Interactive/Triggered/
// Audio/Projector/Catalog/Showcase) are realised via `profile` + content
// package, NOT as mode values.
export type KioskMode = 'loop' | 'browse' | 'custom'

// Rendering hint only — never published on the wire.
export type KioskProfile =
  | 'continuous' | 'interactive' | 'triggered'
  | 'audio' | 'projector' | 'catalog' | 'showcase'

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'loading' | 'error'
export type AppState = 'loading' | 'screensaver' | 'menu' | 'content' | 'error'

// Reserved error codes (STANDARD §Status topics). The Player currently emits
// only INDEXEDDB_OPEN_FAILED_PERMANENT; the rest are reserved.
export type KioskErrorCode =
  | 'INDEXEDDB_OPEN_FAILED'
  | 'INDEXEDDB_OPEN_FAILED_PERMANENT'
  | 'CONTENT_SYNC_FAILED'
  | 'MEDIA_DOWNLOAD_FAILED'
  | 'SETTINGS_LOAD_FAILED'

export interface KioskError {
  code: KioskErrorCode | string
  message: string
  timestamp: string
}

export interface KioskSettings {
  kioskId: string
  kioskSlug: string
  serverUrl: string
  mqttUrl: string
  museumId: string
  mode: KioskMode
  profile?: KioskProfile
  network?: { macAddress?: string }
  display?: { fullscreen?: boolean; cursor?: boolean }
  debug?: { showDevTools?: boolean; logLevel?: 'debug' | 'info' | 'warn' | 'error' }
  contentPackageId?: string
}

export interface MediaItem {
  id: string
  url: string
  title?: string
  mimeType: string
  durationSeconds?: number
  thumbnail?: string
  guideOnly?: boolean
  checksum?: string
}

export interface Article {
  id: string
  title: string
  content: any
  coverImage?: MediaItem
}

export interface MenuItem {
  id: string
  title: string
  description?: string
  thumbnail?: MediaItem
  contentType: 'video' | 'article' | 'showcase' | 'submenu'
  video?: MediaItem
  article?: Article
  showcaseItems?: ShowcaseItem[]
  submenuItems?: MenuItem[]
  guideOnly?: boolean
}

export interface ShowcaseItem {
  id: string
  title: string
  description?: string
  image: MediaItem
}

export interface ContentPackage {
  id: string
  name: string
  version?: string
  mode: KioskMode
  menuItems?: MenuItem[]
  playlist?: { items: MediaItem[]; loopPlaylist: boolean }
  showcaseItems?: ShowcaseItem[]
  guideContent?: { items: MediaItem[] }
  screensaver?: {
    type?: 'video' | 'image' | 'carousel' | 'animation'
    enabled?: boolean
    media?: MediaItem[]
    title?: string
    subtitle?: string
    showStartButton?: boolean
    startButtonText?: string
    idleTimeoutSeconds?: number
    showTransitionAnimation?: boolean
  }
}

// Trigger envelope carried by the trigger_play command (STANDARD §Trigger pipeline).
export interface TriggerEnvelope {
  mediaId: string
  mediaUrl: string
  mediaMimeType: string
  mediaTitle?: string
}

export interface KioskCommand {
  action:
    | 'play' | 'pause' | 'stop' | 'volume' | 'content'
    | 'mode' | 'next' | 'prev' | 'home' | 'loop'
    | 'power_off' | 'reboot'
    | 'sync' | 'restart' | 'quit' | 'locale'
    | 'screensaver' | 'seek' | 'trigger_play'
  value?: any
  trigger?: TriggerEnvelope
}

export interface KioskNavigation {
  nodeId: string | null
  path?: string[]
  showcaseOpen?: boolean
}

export interface KioskStatus {
  kioskId: string
  state: PlaybackState
  mode: KioskMode
  volume: number
  locale: string
  currentContent?: {
    type: string
    id: string
    title?: string
    position?: number
    duration?: number
  }
  navigation?: KioskNavigation
  screensaverActive?: boolean
  timestamp: string
  version: string
  uptime: number
  error: KioskError | null
  triggerEnded?: boolean
}

export interface KioskHeartbeat {
  kioskId: string
  timestamp: string
  version: string
  uptime: number
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/types/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the whole project (expect known breakages)**

Run: `pnpm exec tsc --noEmit`
Expected: errors in `player.ts`, `mqtt.ts` referencing removed modes / old status shape. These are fixed in Tasks 4–9. Note the list; do not fix yet.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/types/types.test.ts
git commit -m "feat(types): adopt v1.26.5.1 shapes (mode enum, status fields, KioskError, commands)"
```

---

## Task 4: MQTT per-topic payload parsing

**Files:**
- Modify: `src/services/mqtt.ts`
- Test: `src/services/mqtt.parse.test.ts`

The parser must match STANDARD §Command topics: `volume` bare integer, `locale` bare string, `loop` bare boolean, `power` bare string, `playback`/`app` JSON `{action}`. Wrong shapes are logged and ignored. `commands/app` acts only on JSON `{action}` of `sync`/`mode`/`quit`/`restart` (bare strings belong to the Supervisor).

- [ ] **Step 1: Extract a pure parser and write the failing test**

`src/services/mqtt.parse.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { parseCommand } from '@/services/mqtt'

const cmd = (leaf: string, raw: string) => parseCommand(leaf, raw)

describe('parseCommand', () => {
  it('volume: bare integer', () => {
    expect(cmd('volume', '75')).toEqual({ action: 'volume', value: 75 })
  })
  it('volume: non-numeric ignored', () => {
    expect(cmd('volume', 'loud')).toBeNull()
  })
  it('locale: bare JSON string', () => {
    expect(cmd('locale', '"en"')).toEqual({ action: 'locale', value: 'en' })
  })
  it('locale: unquoted string tolerated', () => {
    expect(cmd('locale', 'ru')).toEqual({ action: 'locale', value: 'ru' })
  })
  it('loop: bare boolean', () => {
    expect(cmd('loop', 'true')).toEqual({ action: 'loop', value: true })
    expect(cmd('loop', 'false')).toEqual({ action: 'loop', value: false })
  })
  it('power: bare strings map to actions', () => {
    expect(cmd('power', 'off')).toEqual({ action: 'power_off' })
    expect(cmd('power', 'shutdown')).toEqual({ action: 'power_off' })
    expect(cmd('power', 'reboot')).toEqual({ action: 'reboot' })
    expect(cmd('power', 'nonsense')).toBeNull()
  })
  it('playback: play with mediaId', () => {
    expect(cmd('playback', JSON.stringify({ action: 'play', mediaId: 'm1' })))
      .toEqual({ action: 'play', value: 'm1' })
  })
  it('playback: content with contentId', () => {
    expect(cmd('playback', JSON.stringify({ action: 'content', contentId: 'c1' })))
      .toEqual({ action: 'content', value: 'c1' })
  })
  it('playback: seek carries value', () => {
    expect(cmd('playback', JSON.stringify({ action: 'seek', value: 30 })))
      .toEqual({ action: 'seek', value: 30 })
  })
  it('playback: trigger_play carries envelope', () => {
    const raw = JSON.stringify({
      action: 'trigger_play', mediaId: 'm1', mediaUrl: 'u', mediaMimeType: 'video/mp4', mediaTitle: 't',
    })
    expect(cmd('playback', raw)).toEqual({
      action: 'trigger_play',
      trigger: { mediaId: 'm1', mediaUrl: 'u', mediaMimeType: 'video/mp4', mediaTitle: 't' },
    })
  })
  it('playback: screensaver / bare actions', () => {
    expect(cmd('playback', JSON.stringify({ action: 'screensaver' }))).toEqual({ action: 'screensaver' })
    expect(cmd('playback', JSON.stringify({ action: 'pause' }))).toEqual({ action: 'pause' })
  })
  it('app: JSON actions accepted', () => {
    expect(cmd('app', JSON.stringify({ action: 'sync' }))).toEqual({ action: 'sync' })
    expect(cmd('app', JSON.stringify({ action: 'mode', value: 'loop' }))).toEqual({ action: 'mode', value: 'loop' })
    expect(cmd('app', JSON.stringify({ action: 'quit' }))).toEqual({ action: 'quit' })
    expect(cmd('app', JSON.stringify({ action: 'restart' }))).toEqual({ action: 'restart' })
  })
  it('app: bare-string Supervisor payloads ignored', () => {
    expect(cmd('app', 'start')).toBeNull()
    expect(cmd('app', 'stop')).toBeNull()
    expect(cmd('app', 'restart')).toBeNull()
  })
  it('unknown leaf ignored', () => {
    expect(cmd('bogus', 'x')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/services/mqtt.parse.test.ts`
Expected: FAIL — `parseCommand` not exported.

- [ ] **Step 3: Add the exported pure parser to `src/services/mqtt.ts`**

Add near the top (after imports), exported standalone:
```typescript
import type { KioskCommand } from '@/types'

/**
 * Pure parser: maps a command topic leaf + raw payload to a KioskCommand,
 * or null if the payload does not match the leaf's expected shape (STANDARD
 * §Command topics). Callers MUST ignore null.
 */
export function parseCommand(leaf: string, raw: string): KioskCommand | null {
  switch (leaf) {
    case 'volume': {
      const n = Number(raw.trim())
      if (!Number.isFinite(n)) return null
      return { action: 'volume', value: Math.max(0, Math.min(100, Math.round(n))) }
    }
    case 'locale': {
      let v = raw.trim()
      try { const j = JSON.parse(raw); if (typeof j === 'string') v = j } catch { /* unquoted */ }
      return v ? { action: 'locale', value: v } : null
    }
    case 'loop': {
      const t = raw.trim()
      if (t !== 'true' && t !== 'false') return null
      return { action: 'loop', value: t === 'true' }
    }
    case 'power': {
      const p = raw.trim().replace(/^"|"$/g, '')
      if (p === 'off' || p === 'shutdown') return { action: 'power_off' }
      if (p === 'reboot') return { action: 'reboot' }
      return null
    }
    case 'playback': {
      let d: any
      try { d = JSON.parse(raw) } catch { return null }
      if (!d || typeof d !== 'object') return null
      switch (d.action) {
        case 'play': return { action: 'play', value: d.mediaId }
        case 'content': return { action: 'content', value: d.contentId }
        case 'seek': return { action: 'seek', value: d.value }
        case 'pause': case 'stop': case 'next': case 'prev': case 'home': case 'screensaver':
          return { action: d.action }
        case 'trigger_play':
          if (!d.mediaId || !d.mediaUrl) return null
          return {
            action: 'trigger_play',
            trigger: {
              mediaId: d.mediaId, mediaUrl: d.mediaUrl,
              mediaMimeType: d.mediaMimeType, mediaTitle: d.mediaTitle,
            },
          }
        default: return null
      }
    }
    case 'app': {
      let d: any
      try { d = JSON.parse(raw) } catch { return null } // bare-string => Supervisor's, ignore
      if (!d || typeof d !== 'object' || typeof d.action !== 'string') return null
      switch (d.action) {
        case 'sync': return { action: 'sync' }
        case 'quit': return { action: 'quit' }
        case 'restart': return { action: 'restart' }
        case 'mode': return { action: 'mode', value: d.value }
        default: return null
      }
    }
    default:
      return null
  }
}
```

- [ ] **Step 4: Rewrite `handleMessage` to use the parser**

Replace the body of `handleMessage` (the `switch (commandType)` block) with:
```typescript
  private handleMessage(topic: string, payload: Buffer): void {
    const parts = topic.split('/')
    // umka/kiosks/{slug}/commands/{leaf}
    if (parts.length < 5 || parts[3] !== 'commands') return
    const leaf = parts[4]
    const raw = payload.toString()
    const command = parseCommand(leaf, raw)
    if (!command) {
      console.warn(`[MQTT] Ignored payload on ${leaf}:`, raw)
      return
    }
    this.commandHandlers.forEach(handler => {
      try { handler(command) } catch (err) { console.error('[MQTT] Command handler error:', err) }
    })
  }
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test src/services/mqtt.parse.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/mqtt.ts src/services/mqtt.parse.test.ts
git commit -m "feat(mqtt): per-topic payload parsing with shape discrimination"
```

---

## Task 5: Player — mode collapse

**Files:**
- Modify: `src/services/player.ts`
- Test: `src/services/player.mode.test.ts`

Removed modes: `init`/`next`/`previous`/`getPlaylistItems` must no longer branch on `projector`/`audio`/`showcase`. Loop plays the playlist; a Browse package whose only content is top-level `showcaseItems` opens the showcase grid directly; `custom` is a minimal state.

- [ ] **Step 1: Write the failing test**

`src/services/player.mode.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { playerService } from '@/services/player'
import type { ContentPackage } from '@/types'

vi.mock('@/services/mqtt', () => ({
  mqttService: { publishStatus: vi.fn() },
}))

const loopPkg: ContentPackage = {
  id: 'p', name: 'p', mode: 'loop',
  playlist: { items: [{ id: 'v1', url: 'u', mimeType: 'video/mp4' }], loopPlaylist: true },
}
const browsePkg: ContentPackage = {
  id: 'p', name: 'p', mode: 'browse',
  menuItems: [{ id: 'm1', title: 'A', contentType: 'video', video: { id: 'v1', url: 'u', mimeType: 'video/mp4' } }],
}

describe('mode collapse', () => {
  beforeEach(() => { /* fresh-ish: re-init resets state */ })

  it('loop: starts playing first playlist item', () => {
    playerService.init(loopPkg, 'loop')
    const s = playerService.getState()
    expect(s.mode).toBe('loop')
    expect(s.appState).toBe('content')
    expect(s.playbackState).toBe('playing')
    expect((s.currentContent as any)?.id).toBe('v1')
  })

  it('browse: starts on screensaver', () => {
    playerService.init(browsePkg, 'browse')
    const s = playerService.getState()
    expect(s.mode).toBe('browse')
    expect(s.appState).toBe('screensaver')
  })

  it('custom: minimal state, no crash', () => {
    playerService.init({ id: 'p', name: 'p', mode: 'custom' }, 'custom')
    expect(playerService.getState().mode).toBe('custom')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/services/player.mode.test.ts`
Expected: FAIL — `tsc`/runtime still references removed modes (compile errors in player.ts switch cases).

- [ ] **Step 3: Rewrite the mode-dependent methods in `src/services/player.ts`**

In `init()`, replace the `switch (mode)` block with:
```typescript
    switch (mode) {
      case 'browse': {
        this.state.currentMenu = filterGuideOnlyItems(contentPackage.menuItems || [])
        // Showcase profile: a Browse package whose only content is top-level
        // showcaseItems opens the grid directly instead of a menu.
        const hasMenu = (contentPackage.menuItems || []).length > 0
        const hasShowcase = (contentPackage.showcaseItems || []).length > 0
        if (!hasMenu && hasShowcase) {
          this.state.appState = 'content'
          this.state.showcaseOpen = true
        } else {
          this.state.appState = 'screensaver'
        }
        break
      }
      case 'loop': {
        this.state.appState = 'content'
        this.state.playbackState = 'playing'
        const filtered = filterGuideOnlyMedia(contentPackage.playlist?.items || [])
        if (filtered.length) { this.state.currentContent = filtered[0]; this.state.currentIndex = 0 }
        break
      }
      case 'custom':
      default:
        this.state.appState = 'screensaver'
        break
    }
```

In `next()` and `previous()`, replace the mode check `this.state.mode === 'loop' || ... 'projector' || ... 'audio'` with just `this.state.mode === 'loop'`.

In `getPlaylistItems()`, replace the same compound check with `this.state.mode === 'loop'`.

Add `showcaseOpen: boolean` to `PlayerState` (init `false`) — used by navigation in Task 6.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/services/player.mode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/player.ts src/services/player.mode.test.ts
git commit -m "feat(player): collapse wire modes to loop/browse/custom"
```

---

## Task 6: Player — navigation tracking + screensaverActive

**Files:**
- Modify: `src/services/player.ts`
- Test: `src/services/player.navigation.test.ts`

Track `navigation.nodeId`, `navigation.path` (ancestor id chain), and `showcaseOpen` per STANDARD §Status topics / §Addressable content node. Maintain `sectionPath: string[]` (descended submenu ids) and `currentLeafId: string | null`.

- [ ] **Step 1: Write the failing test**

`src/services/player.navigation.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playerService } from '@/services/player'
import type { ContentPackage } from '@/types'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn() } }))

const pkg: ContentPackage = {
  id: 'p', name: 'p', mode: 'browse',
  menuItems: [
    { id: 'sec1', title: 'Section', contentType: 'submenu', submenuItems: [
      { id: 'obj1', title: 'Object', contentType: 'article', article: { id: 'a', title: 'A', content: {} } },
    ] },
    { id: 'gal', title: 'Gallery', contentType: 'showcase', showcaseItems: [
      { id: 's1', title: 'S', image: { id: 'i', url: 'u', mimeType: 'image/jpg' } },
    ] },
  ],
}

describe('navigation tracking', () => {
  beforeEach(() => { playerService.init(pkg, 'browse'); playerService.wake() })

  it('root has null nodeId and empty path', () => {
    const n = playerService.getState().navigation
    expect(n.nodeId).toBeNull()
    expect(n.path).toEqual([])
  })

  it('entering a submenu pushes its id', () => {
    playerService.selectMenuItem(pkg.menuItems![0])
    const n = playerService.getState().navigation
    expect(n.nodeId).toBe('sec1')
    expect(n.path).toEqual(['sec1'])
  })

  it('selecting a leaf inside a section yields full path', () => {
    playerService.selectMenuItem(pkg.menuItems![0])
    playerService.selectMenuItem(pkg.menuItems![0].submenuItems![0])
    const n = playerService.getState().navigation
    expect(n.nodeId).toBe('obj1')
    expect(n.path).toEqual(['sec1', 'obj1'])
  })

  it('opening a showcase sets showcaseOpen', () => {
    playerService.selectMenuItem(pkg.menuItems![1])
    const n = playerService.getState().navigation
    expect(n.nodeId).toBe('gal')
    expect(n.showcaseOpen).toBe(true)
  })

  it('home resets navigation', () => {
    playerService.selectMenuItem(pkg.menuItems![0])
    playerService.goHome()
    const n = playerService.getState().navigation
    expect(n.nodeId).toBeNull()
    expect(n.path).toEqual([])
    expect(n.showcaseOpen).toBe(false)
  })

  it('screensaverActive reflects screensaver state', () => {
    expect(playerService.getState().screensaverActive).toBe(false) // woke in beforeEach
    playerService.handleCommand({ action: 'screensaver' })
    expect(playerService.getState().screensaverActive).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/services/player.navigation.test.ts`
Expected: FAIL — `navigation`/`screensaverActive` not on state; `screensaver` command not handled.

- [ ] **Step 3: Add navigation state + helpers to `src/services/player.ts`**

Add to `PlayerState`:
```typescript
  navigation: { nodeId: string | null; path: string[]; showcaseOpen: boolean }
  screensaverActive: boolean
  sectionPath: string[]
  currentLeafId: string | null
```
Init them in the default state object:
```typescript
    navigation: { nodeId: null, path: [], showcaseOpen: false },
    screensaverActive: false,
    sectionPath: [],
    currentLeafId: null,
```

Add a private recompute helper and call it wherever navigation changes:
```typescript
  private recomputeNavigation(): void {
    const leaf = this.currentLeafIdPresent()
    const path = leaf ? [...this.state.sectionPath, this.state.currentLeafId!] : [...this.state.sectionPath]
    const nodeId = leaf
      ? this.state.currentLeafId!
      : (this.state.sectionPath.length ? this.state.sectionPath[this.state.sectionPath.length - 1] : null)
    this.state.navigation = { nodeId, path, showcaseOpen: this.state.showcaseOpen }
  }
  private currentLeafIdPresent(): boolean {
    return this.state.currentLeafId !== null
  }
```

Wire it in:
- `selectMenuItem(item)`: for `submenu` → `this.state.sectionPath.push(item.id); this.state.currentLeafId = null; this.state.showcaseOpen = false`. For `video`/`article` → `this.state.currentLeafId = item.id; this.state.showcaseOpen = false`. For `showcase` → `this.state.currentLeafId = item.id; this.state.showcaseOpen = true`. Then call `this.recomputeNavigation()` before `notifyStateChange()`.
- `goBack()`: from content → `this.state.currentLeafId = null; this.state.showcaseOpen = false`. From submenu level → `this.state.sectionPath.pop()`. Then `recomputeNavigation()`.
- `goHome()` and `goToScreensaver()`: `this.state.sectionPath = []; this.state.currentLeafId = null; this.state.showcaseOpen = false; this.recomputeNavigation()`.
- `init()`: reset `sectionPath=[]`, `currentLeafId=null`, `showcaseOpen` as set by mode branch, then `recomputeNavigation()`.

Set `screensaverActive`:
- `goToScreensaver()` and the screensaver entry in `init`/`stop` (browse → screensaver): `this.state.screensaverActive = true`.
- `wake()` and any transition into `menu`/`content`: `this.state.screensaverActive = false`.

Add a `screensaver` case to `handleCommand`:
```typescript
      case 'screensaver':
        this.goToScreensaver()
        break
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/services/player.navigation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/player.ts src/services/player.navigation.test.ts
git commit -m "feat(player): track navigation path, showcaseOpen, screensaverActive"
```

---

## Task 7: Player — full status payload + trigger pipeline

**Files:**
- Modify: `src/services/player.ts`
- Modify: `src/services/mqtt.ts` (publishStatus passthrough of new fields)
- Test: `src/services/player.status.test.ts`

`publishStatus` must emit `version`, `uptime`, `error`, `navigation` (Browse only), `screensaverActive`, and a one-shot `triggerEnded`. Trigger lifecycle: `trigger_play` plays enveloped media; on completion publish `triggerEnded:true` exactly once.

- [ ] **Step 1: Write the failing test**

`src/services/player.status.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playerService } from '@/services/player'
import { mqttService } from '@/services/mqtt'
import type { ContentPackage } from '@/types'

vi.mock('@/services/mqtt', () => ({
  mqttService: { publishStatus: vi.fn() },
}))

const loopPkg: ContentPackage = {
  id: 'p', name: 'p', mode: 'loop',
  playlist: { items: [{ id: 'v1', url: 'u', mimeType: 'video/mp4', title: 'V1' }], loopPlaylist: true },
}

const lastStatus = () => {
  const calls = (mqttService.publishStatus as any).mock.calls
  return calls[calls.length - 1][0]
}

describe('status payload', () => {
  beforeEach(() => { (mqttService.publishStatus as any).mockClear() })

  it('always carries version, uptime, error:null when healthy', () => {
    playerService.init(loopPkg, 'loop')
    const s = lastStatus()
    expect(typeof s.version).toBe('string')
    expect(typeof s.uptime).toBe('number')
    expect(s.error).toBeNull()
  })

  it('omits navigation outside Browse', () => {
    playerService.init(loopPkg, 'loop')
    expect(lastStatus().navigation).toBeUndefined()
  })

  it('emits triggerEnded exactly once after a triggered play completes', () => {
    playerService.init(loopPkg, 'loop')
    playerService.handleCommand({
      action: 'trigger_play',
      trigger: { mediaId: 'tv', mediaUrl: 'u', mediaMimeType: 'video/mp4', mediaTitle: 'T' },
    })
    ;(mqttService.publishStatus as any).mockClear()
    playerService.onMediaEnded()
    expect(lastStatus().triggerEnded).toBe(true)
    // next publish no longer flags it
    ;(mqttService.publishStatus as any).mockClear()
    playerService.setVolume(50)
    expect(lastStatus().triggerEnded).toBeFalsy()
  })

  it('error state surfaces KioskError', () => {
    playerService.setError('INDEXEDDB_OPEN_FAILED_PERMANENT', 'gone')
    const s = lastStatus()
    expect(s.state).toBe('error')
    expect(s.error.code).toBe('INDEXEDDB_OPEN_FAILED_PERMANENT')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/services/player.status.test.ts`
Expected: FAIL — new fields/methods missing.

- [ ] **Step 3: Implement in `src/services/player.ts`**

Add imports + state:
```typescript
import { APP_VERSION } from '@/version'
import type { KioskError, KioskErrorCode } from '@/types'
```
Add to `PlayerState`:
```typescript
  error: KioskError | null   // replaces the old `error: string | null`
  triggeredPlayActive: boolean
  triggerEndedPending: boolean
```
Init: `error: null, triggeredPlayActive: false, triggerEndedPending: false`. (Remove the old `error: string` usages; `setError`/`clearError` rewritten below.)

Add a private start time:
```typescript
  private startTime = Date.now()
```

Rewrite `setError`/`clearError`:
```typescript
  setError(code: KioskErrorCode | string, message: string): void {
    this.state.error = { code, message, timestamp: new Date().toISOString() }
    this.state.appState = 'error'
    this.state.playbackState = 'error'
    this.notifyStateChange()
    this.publishStatus()
  }
  clearError(): void {
    this.state.error = null
    this.state.appState = 'screensaver'
    this.state.screensaverActive = true
    this.notifyStateChange()
    this.publishStatus()
  }
```

Add trigger handling to `handleCommand`:
```typescript
      case 'trigger_play':
        if (command.trigger) this.startTriggeredPlay(command.trigger)
        break
      case 'seek':
        // position is applied by the view layer; status re-publishes on next tick
        this.notifyStateChange()
        break
      case 'quit':
        if (typeof window !== 'undefined') window.electronAPI?.quitApp?.()
        break
```
(Leave existing `restart` case as `window.location.reload()`.)

Add methods:
```typescript
  /** Play media delivered in a trigger envelope (STANDARD §Trigger pipeline). */
  startTriggeredPlay(env: { mediaId: string; mediaUrl: string; mediaMimeType: string; mediaTitle?: string }): void {
    this.state.currentContent = {
      id: env.mediaId, url: env.mediaUrl, mimeType: env.mediaMimeType, title: env.mediaTitle,
    } as MediaItem
    this.state.appState = 'content'
    this.state.playbackState = 'playing'
    this.state.screensaverActive = false
    this.state.triggeredPlayActive = true
    this.notifyStateChange()
    this.publishStatus()
  }

  /** Called by the view layer when the current media element ends. */
  onMediaEnded(): void {
    if (this.state.triggeredPlayActive) {
      this.state.triggeredPlayActive = false
      this.state.triggerEndedPending = true
      this.state.playbackState = 'idle'
      this.state.currentContent = null
      this.state.appState = this.state.mode === 'browse' ? 'menu' : 'screensaver'
      if (this.state.appState === 'screensaver') this.state.screensaverActive = true
      this.notifyStateChange()
      this.publishStatus()
      return
    }
    // Non-triggered: advance loop playlists, else stop.
    if (this.state.mode === 'loop') { this.next(); return }
    this.stop()
  }
```

Rewrite `publishStatus()`:
```typescript
  private publishStatus(): void {
    const content = this.state.currentContent as any
    const triggerEnded = this.state.triggerEndedPending
    this.state.triggerEndedPending = false // one-shot

    mqttService.publishStatus({
      state: this.state.playbackState,
      mode: this.state.mode,
      volume: this.state.volume,
      locale: this.state.locale,
      currentContent: content ? {
        type: content.contentType ?? ('video' in content ? 'video' : (content.mimeType?.startsWith('video') ? 'video' : 'article')),
        id: content.id,
        title: content.title,
      } : undefined,
      navigation: this.state.mode === 'browse' ? this.state.navigation : undefined,
      screensaverActive: this.state.screensaverActive,
      version: APP_VERSION,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      error: this.state.error,
      triggerEnded,
    })
  }
```

- [ ] **Step 4: Update `mqttService.publishStatus` signature in `src/services/mqtt.ts`**

Change the `Omit<...>` type so it passes through the new fields. Replace the method:
```typescript
  publishStatus(status: Omit<KioskStatus, 'kioskId' | 'timestamp'>): void {
    if (!this.client?.connected || !this.settings) return
    const topic = `${this.getBaseTopic()}/status`
    const full: KioskStatus = {
      ...status,
      kioskId: this.settings.kioskId,
      timestamp: new Date().toISOString(),
    }
    this.client.publish(topic, JSON.stringify(full), { qos: 0, retain: true })
  }
```
(The `KioskStatus` import already exists.)

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test src/services/player.status.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire `onMediaEnded` from the video view (no test; manual)**

In `src/screens/VideoPlayer.tsx`, the `<video onEnded>` handler MUST call `playerService.onMediaEnded()` (replacing any direct next/stop call). Confirm by reading the file and editing the handler.

- [ ] **Step 7: Commit**

```bash
git add src/services/player.ts src/services/mqtt.ts src/screens/VideoPlayer.tsx src/services/player.status.test.ts
git commit -m "feat(player): full v1.26.5.1 status payload + trigger pipeline"
```

---

## Task 8: Heartbeat cleanup + version source in MQTT

**Files:**
- Modify: `src/services/mqtt.ts`
- Test: `src/services/mqtt.heartbeat.test.ts`

- [ ] **Step 1: Write the failing test**

`src/services/mqtt.heartbeat.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildHeartbeat } from '@/services/mqtt'

describe('buildHeartbeat', () => {
  it('has no diskFreeGB and carries version/uptime', () => {
    const hb = buildHeartbeat('kiosk-1', 0)
    expect(hb).not.toHaveProperty('diskFreeGB')
    expect(hb.kioskId).toBe('kiosk-1')
    expect(typeof hb.version).toBe('string')
    expect(typeof hb.uptime).toBe('number')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/services/mqtt.heartbeat.test.ts`
Expected: FAIL — `buildHeartbeat` not exported.

- [ ] **Step 3: Add `buildHeartbeat` and use it; remove hardcoded version**

In `src/services/mqtt.ts` add:
```typescript
import { APP_VERSION } from '@/version'
import type { KioskHeartbeat } from '@/types'

export function buildHeartbeat(kioskId: string, startTime: number): KioskHeartbeat {
  return {
    kioskId,
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  }
}
```
Replace `publishHeartbeat()` body to use it:
```typescript
  private publishHeartbeat(): void {
    if (!this.client?.connected || !this.settings) return
    const topic = `${this.getBaseTopic()}/heartbeat`
    this.client.publish(topic, JSON.stringify(buildHeartbeat(this.settings.kioskId, this.startTime)), { qos: 0 })
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/services/mqtt.heartbeat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/mqtt.ts src/services/mqtt.heartbeat.test.ts
git commit -m "feat(mqtt): single-source version in heartbeat, drop diskFreeGB"
```

---

## Task 9: Storage — emit INDEXEDDB_OPEN_FAILED_PERMANENT

**Files:**
- Modify: `src/services/storage.ts`
- Test: `src/services/storage.error.test.ts`

- [ ] **Step 1: Read `src/services/storage.ts`** to find the IndexedDB open + existing retry logic. Identify the point where open permanently fails.

- [ ] **Step 2: Write the failing test**

`src/services/storage.error.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playerService } from '@/services/player'
import { storageService } from '@/services/storage'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn() } }))

describe('storage permanent failure', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('emits INDEXEDDB_OPEN_FAILED_PERMANENT via player.setError', async () => {
    const spy = vi.spyOn(playerService, 'setError')
    // Force indexedDB.open to always error.
    ;(globalThis as any).indexedDB = {
      open: () => {
        const req: any = {}
        setTimeout(() => req.onerror?.(new Event('error')), 0)
        return req
      },
    }
    await storageService.init().catch(() => {})
    expect(spy).toHaveBeenCalledWith('INDEXEDDB_OPEN_FAILED_PERMANENT', expect.any(String))
  })
})
```
> If `storage.init()` has a different name/retry shape, adjust the test to drive the permanent-failure path discovered in Step 1, keeping the assertion on `setError` with the conformant code.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test src/services/storage.error.test.ts`
Expected: FAIL — `setError` not called with that code.

- [ ] **Step 4: Wire the emit in `src/services/storage.ts`**

At the point where IndexedDB open fails after the retry budget is exhausted, add:
```typescript
import { playerService } from '@/services/player'
// ...
playerService.setError('INDEXEDDB_OPEN_FAILED_PERMANENT', `IndexedDB open failed permanently: ${String(err)}`)
```
(Guard against an import cycle: import lazily inside the failure branch if `tsc`/runtime complains — `const { playerService } = await import('@/services/player')`.)

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test src/services/storage.error.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/storage.ts src/services/storage.error.test.ts
git commit -m "feat(storage): emit conformant INDEXEDDB_OPEN_FAILED_PERMANENT error code"
```

---

## Task 10: Supervisor emulation service

**Files:**
- Create: `src/services/supervisor.ts`
- Modify: `src/services/mqtt.ts` (LWT in connect, system-heartbeat + graceful-offline publishers)
- Test: `src/services/supervisor.test.ts`

Emulates the Sentinel so the all-in-one Player demonstrates two-tier liveness (STANDARD §Supervisor topics, §Two-tier liveness). Publishes `system/heartbeat` every 10 s; registers LWT; publishes graceful-offline on quit. Does **not** publish `system/crash` (a process can't report its own crash — that's the real Sentinel's job).

- [ ] **Step 1: Write the failing test**

`src/services/supervisor.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSystemHeartbeat, buildGracefulOffline, buildLwt } from '@/services/supervisor'

describe('supervisor payloads', () => {
  it('system heartbeat running shape', () => {
    const hb = buildSystemHeartbeat('kiosk-1', 0, true)
    expect(hb.kioskId).toBe('kiosk-1')
    expect(hb.player.status).toBe('running')
    expect(hb.system.networkConnected).toBe(true)
    expect(typeof hb.version).toBe('string')
  })
  it('graceful offline carries graceful:true', () => {
    const g = buildGracefulOffline('kiosk-1')
    expect(g).toMatchObject({ kioskId: 'kiosk-1', status: 'offline', graceful: true })
  })
  it('LWT omits graceful flag', () => {
    const w = buildLwt('kiosk-1', '2026-06-02T00:00:00Z')
    expect(w.status).toBe('offline')
    expect(w).not.toHaveProperty('graceful')
    expect(w.connectedAt).toBe('2026-06-02T00:00:00Z')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/services/supervisor.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Create `src/services/supervisor.ts`**

```typescript
/**
 * Supervisor emulation — lets the all-in-one reference Player demonstrate
 * two-tier liveness (STANDARD §Supervisor topics) without a separate Sentinel.
 * In production this file is deleted and a real Sentinel owns these topics.
 */
import { APP_VERSION } from '@/version'
import { mqttService } from './mqtt'
import type { KioskSettings } from '@/types'

export interface SystemHeartbeat {
  kioskId: string
  timestamp: string
  version: string
  uptime: number
  player: {
    status: 'running' | 'stopped' | 'updating' | 'unresponsive' | 'restarting'
    pid: number
    lastHeartbeat: string
    restartCount: number
    lastCrash: string | null
    crashedVersion: string | null
  }
  system: { cpuPercent: number; memoryPercent: number; networkConnected: boolean }
}

export function buildSystemHeartbeat(kioskId: string, startTime: number, networkConnected: boolean): SystemHeartbeat {
  const now = new Date().toISOString()
  return {
    kioskId, timestamp: now, version: APP_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    player: {
      status: 'running',
      pid: typeof process !== 'undefined' ? process.pid : 0,
      lastHeartbeat: now, restartCount: 0, lastCrash: null, crashedVersion: null,
    },
    // Reference build reports 0 for cpu/mem; a real Sentinel measures these.
    system: { cpuPercent: 0, memoryPercent: 0, networkConnected },
  }
}

export function buildGracefulOffline(kioskId: string) {
  return { kioskId, timestamp: new Date().toISOString(), status: 'offline' as const, graceful: true as const }
}

export function buildLwt(kioskId: string, connectedAt: string) {
  return { kioskId, status: 'offline' as const, connectedAt }
}

const HEARTBEAT_MS = 10000

class SupervisorService {
  private settings: KioskSettings | null = null
  private startTime = Date.now()
  private interval: ReturnType<typeof setInterval> | null = null

  start(settings: KioskSettings): void {
    this.settings = settings
    this.publish()
    this.interval = setInterval(() => this.publish(), HEARTBEAT_MS)
  }
  private publish(): void {
    if (!this.settings) return
    mqttService.publishSystemHeartbeat(
      buildSystemHeartbeat(this.settings.kioskId, this.startTime, mqttService.isConnected),
    )
  }
  shutdown(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null }
    if (this.settings) mqttService.publishGracefulOffline(buildGracefulOffline(this.settings.kioskId))
  }
}

export const supervisorService = new SupervisorService()
```

- [ ] **Step 4: Add the publishers + LWT to `src/services/mqtt.ts`**

Add the LWT to the connect options (uses settings available at `connect`):
```typescript
    const options: IClientOptions = {
      clientId: `kiosk-${settings.kioskSlug}-${Date.now()}`,
      reconnectPeriod: 5000,
      connectTimeout: 3000,
      clean: true,
      will: {
        topic: `umka/kiosks/${settings.kioskSlug}/system/heartbeat`,
        payload: JSON.stringify({
          kioskId: settings.kioskId, status: 'offline', connectedAt: new Date().toISOString(),
        }),
        qos: 1, retain: true,
      },
    }
```
Add publisher methods:
```typescript
  publishSystemHeartbeat(payload: object): void {
    if (!this.client?.connected || !this.settings) return
    this.client.publish(`${this.getBaseTopic()}/system/heartbeat`, JSON.stringify(payload), { qos: 0, retain: true })
  }
  publishGracefulOffline(payload: object): void {
    if (!this.client?.connected || !this.settings) return
    this.client.publish(`${this.getBaseTopic()}/system/heartbeat`, JSON.stringify(payload), { qos: 1, retain: true })
  }
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test src/services/supervisor.test.ts`
Expected: PASS.

- [ ] **Step 6: Start/stop the supervisor from `src/App.tsx`**

After MQTT connects during init, call `supervisorService.start(settings)`. On app unload/quit, call `supervisorService.shutdown()` (wire to a `beforeunload` listener and the `quit` IPC path). Read `App.tsx` and add the calls alongside the existing service initialisation.

- [ ] **Step 7: Commit**

```bash
git add src/services/supervisor.ts src/services/mqtt.ts src/App.tsx src/services/supervisor.test.ts
git commit -m "feat: supervisor emulation (system/heartbeat, LWT, graceful-offline) for two-tier liveness"
```

---

## Task 11: Full typecheck + test sweep

**Files:** none (verification)

- [ ] **Step 1: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors. Fix any residual references to removed mode values or the old `error: string` shape (search `projector`, `'audio'`, `'showcase'`, `state.error` in `src/`).

- [ ] **Step 2: Full test run**

Run: `pnpm test`
Expected: all suites pass.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: 0 warnings (fix unused vars from removed branches).

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: vite + electron-builder succeed (or `tsc && vite build` if builder needs signing — at minimum `pnpm exec tsc && pnpm exec vite build` must pass).

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve typecheck/lint fallout from mode collapse"
```

---

## Task 12: Documentation

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Replace: `STANDARD.md` (slim to pointer)

- [ ] **Step 1: Slim `STANDARD.md` to a pointer**

Replace the entire file with:
```markdown
# Umka Kiosk Standard

This Player implements the **Umka Kiosk Standard v1.26.5.1**.

The canonical, versioned specification lives in its own repository:
**https://github.com/Maugry/Standard**

This repo previously bundled a full copy of the spec; it was removed to avoid
drift. Always refer to the canonical repo for the authoritative protocol.
```

- [ ] **Step 2: Update `README.md`**

- Change the header block: `**Standard:** Umka Kiosk Standard v1.26.5.1`; remove the `v1.2` mentions.
- Replace the "Supported Features (Umka Standard v1.2)" heading and the operating-modes table so modes read `loop`/`browse`/`custom`, with Continuous/Interactive/Triggered/Audio/Projector/Catalog/Showcase described as **profiles** (configuration), not modes.
- Replace the MQTT command/status sections to match v1.26.5.1: the `status` payload now includes `version`, `uptime`, `error`, `navigation`, `screensaverActive`, `triggerEnded`; commands include `screensaver`, `seek`, `trigger_play`, `quit`; note that `commands/power` and `system/heartbeat` are Supervisor topics emulated by this all-in-one build.
- Point the spec link to `https://github.com/Maugry/Standard` (remove the inline `STANDARD.md` deep links to numbered sections; refer to named sections).

- [ ] **Step 3: Update `ARCHITECTURE.md`**

- Replace numbered-section citations (`STANDARD.md Section 9` / `Section 6`) with the canonical named sections (`§Supervisor (control plane)`, `§REST API`).
- In the Control Plane Separation section, point to `src/services/supervisor.ts` as the isolated seam: "Production deployments delete `supervisor.ts` and run a real Sentinel; everything that moves is in that one file."
- Update the MQTT topic-subscription list to reflect per-topic parsing and that `commands/power` is Supervisor-emulated.

- [ ] **Step 4: Commit**

```bash
git add README.md ARCHITECTURE.md STANDARD.md
git commit -m "docs: align README/ARCHITECTURE with v1.26.5.1; slim bundled spec to pointer"
```

---

## Task 13: Manual verification guide

**Files:**
- Create: `docs/verification/2026-06-02-v1.26.5.1-manual-verification.md`

- [ ] **Step 1: Write the guide** (per user convention — happy paths, edge cases, round-trips)

Cover, with copy-paste `mosquitto_pub` commands against the configured broker:
- Browse round-trip: wake → enter section → open object → back → home; assert `navigation.nodeId`/`path`/`showcaseOpen` on the retained `status` after each.
- Loop playback: playlist advance on media end; `triggerEnded` absent.
- Trigger pipeline: publish `trigger_play` → media plays → assert one `triggerEnded:true` on `status`.
- Commands: `volume` (bare `75`), `locale` (`"en"`), `loop` (`true`), `screensaver`, `seek`, `mode`, `sync`, `restart` (JSON → renderer reload), `quit`.
- Power (Supervisor-emulated): `off`/`reboot` on `commands/power`.
- Two-tier liveness: observe `system/heartbeat` every 10 s; kill the app → broker fires LWT (no `graceful`); `quit` → graceful-offline (`graceful:true`).
- Error: simulate storage failure → `status.error.code === INDEXEDDB_OPEN_FAILED_PERMANENT`.

- [ ] **Step 2: Commit**

```bash
git add docs/verification/2026-06-02-v1.26.5.1-manual-verification.md
git commit -m "docs: manual verification guide for v1.26.5.1 conformance"
```

---

## Task 14: Standard repo — fill reference-impl link (separate repo)

**Files:**
- Modify: `/home/newub/w/Umka/temp/umka-kiosk-standard/README.md`

- [ ] **Step 1: Replace the placeholder link**

In that repo's `README.md`, change `[Umka Player](https://github.com/TODO)` → `[Umka Player](https://github.com/Maugry/Player)`.

- [ ] **Step 2: Commit (in the standard repo)**

```bash
cd /home/newub/w/Umka/temp/umka-kiosk-standard
git checkout -b docs/reference-impl-link
git add README.md
git commit -m "docs: point reference implementation at github.com/Maugry/Player"
```

---

## Done criteria

- `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` all pass.
- The Player emits a v1.26.5.1-conformant `status` (full field set), correct `mode` vocabulary, and per-topic-parsed commands.
- `system/heartbeat` + LWT + graceful-offline observable on the bus (two-tier liveness solo).
- Docs cite the canonical standard; bundled `STANDARD.md` is a pointer; package version is `0.2.0`.
- Standard repo's reference-impl link resolves to the published Player repo.
- Branches `feat/standard-v1.26.5.1` (player) and `docs/reference-impl-link` (standard) ready to push/PR on request.
