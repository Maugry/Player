import { useEffect, useState } from 'react'
import { storageService } from '@/services/storage'
import type { MediaItem } from '@/types'

/**
 * Resolve a MediaItem to its cached `media-cache://` URL when available,
 * falling back to the original CMS URL. Returns null until resolved and for
 * missing media. Each detail-block component calls this independently.
 */
export function useCachedMediaUrl(media?: MediaItem | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!media?.url) {
      setUrl(null)
      return
    }
    storageService
      .getMediaUrl(media)
      .then(resolved => { if (!cancelled) setUrl(resolved) })
      .catch(() => { if (!cancelled) setUrl(media.url) })
    return () => { cancelled = true }
  }, [media?.id, media?.url])

  return url
}
