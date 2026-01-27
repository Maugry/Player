/**
 * Kiosk Types
 */

// Kiosk operating modes
export type KioskMode = 'browse' | 'loop' | 'projector' | 'audio' | 'showcase' | 'game'

// Kiosk playback states
export type PlaybackState = 'idle' | 'playing' | 'paused' | 'loading' | 'error'

// App-level states (what screen to show)
export type AppState = 'loading' | 'screensaver' | 'menu' | 'content' | 'error'

// Settings loaded from settings.json
export interface KioskSettings {
  kioskId: string
  kioskSlug: string
  serverUrl: string
  mqttUrl: string
  museumId: string
  mode: KioskMode
  network?: {
    macAddress?: string
  }
  display?: {
    fullscreen?: boolean
    cursor?: boolean
  }
  debug?: {
    showDevTools?: boolean
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
  }
  // Content package ID to load (optional, can come from server)
  contentPackageId?: string
}

// Content types from CMS
export interface MediaItem {
  id: string
  url: string
  title?: string
  mimeType: string
  durationSeconds?: number
  thumbnail?: string
  // Guide-only flag - if true, item should not be shown to visitors
  guideOnly?: boolean
}

export interface Article {
  id: string
  title: string
  content: any // Rich text content
  coverImage?: MediaItem
}

export interface MenuItem {
  id: string
  title: string
  description?: string
  thumbnail?: MediaItem
  contentType: 'video' | 'article' | 'showcase' | 'submenu'
  // Content reference based on type
  video?: MediaItem
  article?: Article
  showcaseItems?: ShowcaseItem[]
  submenuItems?: MenuItem[]
  // Guide-only flag - if true, item should not be shown to visitors
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
  mode: KioskMode
  // For browse mode
  menuItems?: MenuItem[]
  // For loop mode
  playlist?: {
    items: MediaItem[]
    loopPlaylist: boolean
  }
  // For showcase mode
  showcaseItems?: ShowcaseItem[]
  // Guide-only content (Папка экскурсовода)
  // Videos/images only accessible to guides, not visible to visitors
  guideContent?: {
    items: MediaItem[]
  }
  // Screensaver config
  screensaver?: {
    type: 'video' | 'image' | 'animation'
    media?: MediaItem
  }
}

// MQTT command from Guide App or CMS
export interface KioskCommand {
  action:
    | 'play' | 'pause' | 'stop' | 'volume' | 'content'
    | 'mode' | 'next' | 'prev' | 'home' | 'loop'
    | 'power_off' | 'reboot'
    | 'sync' | 'restart' | 'locale'
  value?: any
}

// MQTT status published by kiosk
export interface KioskStatus {
  kioskId: string
  state: PlaybackState
  mode: KioskMode
  currentContent?: {
    type: 'video' | 'article' | 'showcase'
    id: string
    title?: string
    position?: number
    duration?: number
  }
  volume: number
  locale: string
  timestamp: string
}

// MQTT heartbeat published by kiosk
export interface KioskHeartbeat {
  kioskId: string
  timestamp: string
  version: string
  uptime: number
  diskFreeGB?: number
}
