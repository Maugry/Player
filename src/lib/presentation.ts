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
