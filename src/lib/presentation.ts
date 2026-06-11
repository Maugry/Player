import type { ContentPackage, MediaItem, MenuItem } from '@/types'

export interface PlaceholderInfo {
  packageName: string
  media?: MediaItem
  title?: string
  subtitle?: string
}

export type PresentationState =
  | { kind: 'idle'; placeholder: PlaceholderInfo }
  | {
      kind: 'media'
      content: MenuItem | MediaItem
      playback: 'playing' | 'paused'
      volume: number
      loop: boolean
    }

/**
 * Derive the idle (no-selection) placeholder for the demonstration screen
 * entirely from EXISTING package data — screensaver block first, then the
 * first showcase image, then the first menu-item thumbnail, else title-only.
 * No new CMS field.
 */
export function derivePlaceholder(pkg: ContentPackage | null): PlaceholderInfo {
  if (!pkg) return { packageName: '' }

  const ss = pkg.screensaver
  const ssMedia = ss?.media?.[0]
  if (ssMedia) {
    return { packageName: pkg.name, media: ssMedia, title: ss?.title ?? pkg.name, subtitle: ss?.subtitle }
  }

  const showcaseImage = pkg.showcaseItems?.[0]?.image
  if (showcaseImage) {
    return { packageName: pkg.name, media: showcaseImage, title: pkg.name }
  }

  const firstThumb = pkg.menuItems?.find((m: MenuItem) => m.thumbnail)?.thumbnail
  if (firstThumb) {
    return { packageName: pkg.name, media: firstThumb, title: pkg.name }
  }

  return { packageName: pkg.name, title: pkg.name }
}

import type { PlayerState } from '@/services/player'

/**
 * Map the player's current state onto what the demonstration screen shows.
 * A selected leaf (appState 'content' + currentContent) becomes `media`;
 * everything else is `idle` with a derived placeholder. Pure — same input,
 * same output; no IPC or side effects here.
 */
export function derivePresentation(state: PlayerState, pkg: ContentPackage | null): PresentationState {
  if (state.appState !== 'content' || state.currentContent == null) {
    return { kind: 'idle', placeholder: derivePlaceholder(pkg) }
  }
  return {
    kind: 'media',
    content: state.currentContent,
    playback: state.playbackState === 'playing' ? 'playing' : 'paused',
    volume: state.volume,
    loop: state.looping,
  }
}

const IDLE_FALLBACK: PresentationState = { kind: 'idle', placeholder: { packageName: '' } }

/**
 * Validate an IPC payload into a PresentationState. The demonstration screen
 * is public-facing, so any malformed/unknown payload fails safe to idle —
 * never a blank or error screen.
 */
export function applyPresentation(payload: unknown): PresentationState {
  if (!payload || typeof payload !== 'object') return IDLE_FALLBACK
  const p = payload as Record<string, unknown>
  if (p.kind === 'media' && p.content && typeof p.content === 'object') {
    return {
      kind: 'media',
      content: p.content as import('@/types').MenuItem | import('@/types').MediaItem,
      playback: p.playback === 'playing' ? 'playing' : 'paused',
      volume: typeof p.volume === 'number' ? p.volume : 80,
      loop: !!p.loop,
    }
  }
  if (p.kind === 'idle' && p.placeholder && typeof p.placeholder === 'object') {
    const ph = p.placeholder as Record<string, unknown>
    return {
      kind: 'idle',
      placeholder: {
        packageName: typeof ph.packageName === 'string' ? ph.packageName : '',
        media: ph.media as PlaceholderInfo['media'],
        title: typeof ph.title === 'string' ? ph.title : undefined,
        subtitle: typeof ph.subtitle === 'string' ? ph.subtitle : undefined,
      },
    }
  }
  return IDLE_FALLBACK
}
