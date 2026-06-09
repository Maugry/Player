/**
 * Kiosk Types — Umka Kiosk Standard v1.26.5.1
 *
 * Protocol/wire types are sourced from @umka/protocol (the single source of
 * truth that these local types originally seeded). Player-only UI/view types
 * and player-only extensions to protocol shapes are defined locally below.
 */

import type {
  MediaItem as ProtocolMediaItem,
  MenuItem as ProtocolMenuItem,
  ContentPackage as ProtocolContentPackage,
} from '@umka/protocol'

// Protocol types + enums sourced from the package. KioskMode/PlaybackState are
// re-exported as values (zod enums) as well as types.
export {
  KioskMode,
  PlaybackState,
  type KioskStatus,
  type KioskHeartbeat,
} from '@umka/protocol'

import type { KioskMode } from '@umka/protocol'

// Rendering hint only — never published on the wire. Player-only.
export type KioskProfile =
  | 'continuous' | 'interactive' | 'triggered'
  | 'audio' | 'projector' | 'catalog' | 'showcase'

// Player-only app/view state (not protocol).
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
  mqttUsername?: string
  mqttPassword?: string
  museumId: string
  mode: KioskMode
  profile?: KioskProfile
  network?: { macAddress?: string }
  display?: { fullscreen?: boolean; cursor?: boolean }
  debug?: { showDevTools?: boolean; logLevel?: 'debug' | 'info' | 'warn' | 'error' }
  contentPackageId?: string
}

// MediaItem extends the protocol shape with player-only cache fields
// (checksum/size) used by the offline media cache (storage.ts). These are not
// part of the wire protocol — they come from CMS filesize/checksum and never
// travel as protocol payloads.
export type MediaItem = ProtocolMediaItem & {
  checksum?: string
  size?: number  // File size in bytes (CMS filesize); used for cache-skip
}

export interface Article {
  id: string
  title: string
  // Untyped rich-text/CMS wire data; consumers narrow at the use site.
  content: unknown
  coverImage?: MediaItem
}

export type DetailBlock =
  | { blockType: 'image-block'; image?: MediaItem; caption?: string }
  | { blockType: 'text-block'; richText: string }
  | { blockType: 'video-block'; video?: MediaItem; title?: string }

// MenuItem extends the protocol shape with player-only CMS/UI fields
// (article, showcaseVideo, detailBlocks) and re-types media/recursion to the
// player-local MediaItem/MenuItem so cache fields propagate. The protocol
// MenuItem is recursive, so the extension is declared structurally here.
export interface MenuItem extends Omit<ProtocolMenuItem, 'thumbnail' | 'video' | 'showcaseItems' | 'submenuItems'> {
  thumbnail?: MediaItem
  video?: MediaItem
  article?: Article
  showcaseItems?: ShowcaseItem[]
  showcaseVideo?: MediaItem
  detailBlocks?: DetailBlock[]
  submenuItems?: MenuItem[]
}

// ShowcaseItem mirrors the protocol shape but uses the player-local MediaItem
// (with cache fields) and keeps title required, as the player always provides it.
export interface ShowcaseItem {
  id: string
  title: string
  description?: string
  image: MediaItem
}

// ContentPackage extends the protocol shape: mode is required for the player
// (always resolved at load), media/menu re-typed to player-local MediaItem/
// MenuItem, and the screensaver block carries player-only render hints.
export type ContentPackage = Omit<
  ProtocolContentPackage,
  'mode' | 'menuItems' | 'playlist' | 'showcaseItems' | 'guideContent' | 'screensaver'
> & {
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
  // Untyped command payload from the wire; consumers narrow at the use site.
  value?: unknown
  trigger?: TriggerEnvelope
}

// Player-only navigation view state, embedded in the wire KioskStatus payload.
export interface KioskNavigation {
  nodeId: string | null
  path?: string[]
  showcaseOpen?: boolean
}

// KioskStatus and KioskHeartbeat are sourced from @umka/protocol (re-exported above).
