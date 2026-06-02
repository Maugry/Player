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
