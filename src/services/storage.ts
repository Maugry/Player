/**
 * Storage Service
 * Handles local caching of content for offline operation
 *
 * Uses:
 * - IndexedDB for metadata and content packages
 * - File system (via Electron) for media files
 */

import type { ContentPackage, MediaItem, KioskSettings } from '@/types'

const DB_NAME = 'umka-kiosk'
const DB_VERSION = 1
const STORE_PACKAGES = 'content-packages'
const STORE_MEDIA = 'media-metadata'
const STORE_SYNC = 'sync-state'

// Maximum number of IndexedDB open() attempts before the failure is declared
// permanent. Each attempt after the first is preceded by a recovery wipe of
// the corrupted database. Per the Standard's recovery-from-cache-corruption
// flow, the reference implementation uses 2.
const MAX_OPEN_ATTEMPTS = 2

interface SyncState {
  lastSyncAt: string | null
  packageId: string | null
  packageVersion: string | null
}

/**
 * Decide whether a locally cached copy is stale relative to the CMS's media
 * record and must be re-downloaded. Prefers the CMS content checksum when both
 * sides expose one (authoritative); otherwise falls back to the Standard's
 * size-match rule ("size differs → download"). When neither a checksum pair
 * nor a usable size comparison is available, an existing file is treated as
 * fresh (existence is the only available signal).
 */
export function isCachedCopyStale(
  media: Pick<MediaItem, 'checksum' | 'size'>,
  local: { size: number | null; checksum?: string }
): boolean {
  if (media.checksum && local.checksum) {
    return media.checksum !== local.checksum
  }
  if (typeof media.size === 'number' && media.size > 0 && local.size !== null) {
    return local.size !== media.size
  }
  return false
}

interface CachedMedia {
  id: string
  originalUrl: string
  localPath: string
  mimeType: string
  size: number
  downloadedAt: string
  checksum?: string  // SHA-256 from CMS
}

class StorageService {
  private db: IDBDatabase | null = null
  private mediaBasePath: string = ''
  private isElectron: boolean = false

  /**
   * Initialize storage service
   */
  async init(): Promise<void> {
    // Check if running in Electron
    this.isElectron = !!(window.electronAPI?.getMediaPath)

    if (this.isElectron) {
      this.mediaBasePath = await window.electronAPI!.getMediaPath()
      console.log('[Storage] Media path:', this.mediaBasePath)
    }

    // Open IndexedDB
    await this.openDatabase()
    console.log('[Storage] Initialized')
  }

  /**
   * Open IndexedDB database, recovering from a wedged/corrupted database by
   * wiping it and retrying up to MAX_OPEN_ATTEMPTS times. Only the final,
   * permanent failure is published (the transient INDEXEDDB_OPEN_FAILED code
   * is reserved and not emitted by the reference Player).
   */
  private openDatabase(): Promise<void> {
    return this.openDatabaseAttempt(1)
  }

  private openDatabaseAttempt(attempt: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        const err = request.error
        console.error(
          `[Storage] Failed to open database (attempt ${attempt}/${MAX_OPEN_ATTEMPTS}):`,
          err
        )

        if (attempt < MAX_OPEN_ATTEMPTS) {
          // Recovery: wipe the corrupted database, then re-open. Per the
          // Standard the renderer asks the main process to wipe the storage
          // directory; deleteDatabase covers the renderer side.
          this.wipeDatabase()
            .then(() => this.openDatabaseAttempt(attempt + 1))
            .then(resolve, reject)
          return
        }

        // Attempts exhausted -> permanent failure. Surface the conformant
        // error code via the player service. Lazy dynamic import avoids any
        // module-level dependency on player.ts.
        void import('@/services/player').then(({ playerService }) => {
          playerService.setError(
            'INDEXEDDB_OPEN_FAILED_PERMANENT',
            `IndexedDB open failed permanently after ${attempt} attempts: ${String(err)}`
          )
        })
        reject(err)
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Content packages store
        if (!db.objectStoreNames.contains(STORE_PACKAGES)) {
          db.createObjectStore(STORE_PACKAGES, { keyPath: 'id' })
        }

        // Media metadata store
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' })
          mediaStore.createIndex('originalUrl', 'originalUrl', { unique: false })
        }

        // Sync state store
        if (!db.objectStoreNames.contains(STORE_SYNC)) {
          db.createObjectStore(STORE_SYNC, { keyPath: 'id' })
        }
      }
    })
  }

  /**
   * Wipe the corrupted local database before a re-open attempt. Asks the
   * Electron main process to delete the on-disk storage directory (handles a
   * wedged IndexedDB that won't respond to deleteDatabase), then deletes the
   * IndexedDB instance from the renderer. Best-effort: never rejects.
   */
  private async wipeDatabase(): Promise<void> {
    if (this.isElectron && window.electronAPI?.wipeDatabase) {
      try {
        await window.electronAPI.wipeDatabase()
      } catch (e) {
        console.error('[Storage] main-process database wipe failed:', e)
      }
    }
    await new Promise<void>((resolve) => {
      try {
        const del = indexedDB.deleteDatabase(DB_NAME)
        del.onsuccess = () => resolve()
        del.onerror = () => resolve()
        del.onblocked = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  /**
   * Save content package to local storage
   */
  async saveContentPackage(pkg: ContentPackage): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PACKAGES], 'readwrite')
      const store = transaction.objectStore(STORE_PACKAGES)
      const request = store.put(pkg)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get content package from local storage
   */
  async getContentPackage(id: string): Promise<ContentPackage | null> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PACKAGES], 'readonly')
      const store = transaction.objectStore(STORE_PACKAGES)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get the active content package (most recently synced)
   */
  async getActiveContentPackage(): Promise<ContentPackage | null> {
    const syncState = await this.getSyncState()
    if (!syncState?.packageId) return null
    return this.getContentPackage(syncState.packageId)
  }

  /**
   * Download and cache a media file
   */
  async cacheMedia(media: MediaItem, onProgress?: (percent: number) => void): Promise<string> {
    // Check if already cached
    const cached = await this.getCachedMedia(media.id)
    if (cached) {
      // In Electron, confirm the file still exists on disk; in the browser the
      // blob URL is assumed live for the session.
      const exists = this.isElectron
        ? await window.electronAPI!.fileExists(cached.localPath)
        : true
      if (exists) {
        const localSize = await this.localFileSize(cached)
        if (!isCachedCopyStale(media, { size: localSize, checksum: cached.checksum })) {
          console.log('[Storage] Media already cached:', media.id)
          return cached.localPath
        }
        console.log(`[Storage] Media ${media.id} changed (content differs), re-downloading`)
      }
    }

    console.log('[Storage] Downloading media:', media.url)

    if (this.isElectron) {
      // Download via Electron main process
      const localPath = await window.electronAPI!.downloadMedia(
        media.url,
        media.id,
        media.mimeType,
        onProgress
      )

      // Record the actual on-disk size so future syncs can apply the
      // Standard's size-match skip rule.
      const size = (await this.localFileSize({ localPath, size: 0 })) ?? 0

      // Save metadata to IndexedDB
      await this.saveCachedMedia({
        id: media.id,
        originalUrl: media.url,
        localPath,
        mimeType: media.mimeType,
        size,
        downloadedAt: new Date().toISOString(),
        checksum: media.checksum,
      })

      return localPath
    } else {
      // In browser, use blob URL (temporary)
      const response = await fetch(media.url)
      const blob = await response.blob()
      const localUrl = URL.createObjectURL(blob)

      await this.saveCachedMedia({
        id: media.id,
        originalUrl: media.url,
        localPath: localUrl,
        mimeType: media.mimeType,
        size: blob.size,
        downloadedAt: new Date().toISOString(),
        checksum: media.checksum,
      })

      return localUrl
    }
  }

  /**
   * Resolve the actual size in bytes of a cached file. In Electron this is the
   * authoritative on-disk size (the previously-stored value was never updated,
   * so we query the filesystem); in the browser it falls back to the size
   * recorded at download time. Returns null when no size can be determined.
   */
  private async localFileSize(cached: Pick<CachedMedia, 'localPath' | 'size'>): Promise<number | null> {
    if (this.isElectron && window.electronAPI?.getFileSize) {
      try {
        const size = await window.electronAPI.getFileSize(cached.localPath)
        return typeof size === 'number' && size >= 0 ? size : null
      } catch (e) {
        console.error('[Storage] getFileSize failed:', e)
        return null
      }
    }
    return cached.size > 0 ? cached.size : null
  }

  /**
   * Get cached media metadata
   */
  private async getCachedMedia(id: string): Promise<CachedMedia | null> {
    if (!this.db) return null

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_MEDIA], 'readonly')
      const store = transaction.objectStore(STORE_MEDIA)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Save cached media metadata
   */
  private async saveCachedMedia(media: CachedMedia): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_MEDIA], 'readwrite')
      const store = transaction.objectStore(STORE_MEDIA)
      const request = store.put(media)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get local URL for a media item (cached or original)
   */
  async getMediaUrl(media: MediaItem): Promise<string> {
    if (this.isElectron) {
      const cached = await this.getCachedMedia(media.id)
      if (cached) {
        // Use custom media-cache:// protocol (registered in Electron main process)
        // URL format: media-cache://local/filename.mp4
        // Split by both / and \ to handle Windows and Unix paths
        const fileName = cached.localPath.split(/[/\\]/).pop()
        return `media-cache://local/${fileName}`
      }
    }
    // In browser mode, always use the original HTTP URL
    // (blob URLs don't persist and file paths don't work in browsers)
    return media.url
  }

  /**
   * Cache all media in a content package
   */
  async cacheContentPackage(
    pkg: ContentPackage,
    onProgress?: (current: number, total: number, mediaId: string) => void
  ): Promise<void> {
    const mediaItems = this.extractMediaFromPackage(pkg)
    const total = mediaItems.length

    console.log(`[Storage] Caching ${total} media items...`)

    for (let i = 0; i < mediaItems.length; i++) {
      const media = mediaItems[i]
      if (onProgress) {
        onProgress(i + 1, total, media.id)
      }

      try {
        await this.cacheMedia(media)
      } catch (err) {
        console.error(`[Storage] Failed to cache media ${media.id}:`, err)
        // Continue with other files
      }
    }

    // Save the package metadata
    await this.saveContentPackage(pkg)

    // Update sync state
    await this.saveSyncState({
      lastSyncAt: new Date().toISOString(),
      packageId: pkg.id,
      packageVersion: pkg.version || '1',
    })

    console.log('[Storage] Content package cached successfully')
  }

  /**
   * Extract all media items from a content package
   */
  private extractMediaFromPackage(pkg: ContentPackage): MediaItem[] {
    const media: MediaItem[] = []

    // Playlist items
    if (pkg.playlist?.items) {
      media.push(...pkg.playlist.items.filter(m => m.url))
    }

    // Menu items
    if (pkg.menuItems) {
      for (const item of pkg.menuItems) {
        if (item.thumbnail?.url) media.push(item.thumbnail)
        if (item.video?.url) media.push(item.video)
        if (item.showcaseItems) {
          for (const si of item.showcaseItems) {
            if (si.image?.url) media.push(si.image)
          }
        }
        // Recursively handle submenus
        if (item.submenuItems) {
          const subPkg: ContentPackage = {
            id: 'sub',
            name: 'sub',
            mode: 'browse',
            menuItems: item.submenuItems
          }
          media.push(...this.extractMediaFromPackage(subPkg))
        }
      }
    }

    // Screensaver (v2.5 - media is an array)
    if (pkg.screensaver?.media) {
      media.push(...pkg.screensaver.media.filter(m => m.url))
    }

    // Showcase items
    if (pkg.showcaseItems) {
      for (const si of pkg.showcaseItems) {
        if (si.image?.url) media.push(si.image)
      }
    }

    // Guide content (Папка экскурсовода) - also needs to be cached for playback
    if (pkg.guideContent?.items) {
      media.push(...pkg.guideContent.items.filter(m => m.url))
    }

    return media
  }

  /**
   * Get sync state
   */
  async getSyncState(): Promise<SyncState | null> {
    if (!this.db) return null

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SYNC], 'readonly')
      const store = transaction.objectStore(STORE_SYNC)
      const request = store.get('current')

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Save sync state
   */
  private async saveSyncState(state: SyncState): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SYNC], 'readwrite')
      const store = transaction.objectStore(STORE_SYNC)
      const request = store.put({ id: 'current', ...state })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Check if we have cached content
   */
  async hasCachedContent(): Promise<boolean> {
    const syncState = await this.getSyncState()
    return !!syncState?.packageId
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    if (!this.db) return

    const transaction = this.db.transaction(
      [STORE_PACKAGES, STORE_MEDIA, STORE_SYNC],
      'readwrite'
    )

    transaction.objectStore(STORE_PACKAGES).clear()
    transaction.objectStore(STORE_MEDIA).clear()
    transaction.objectStore(STORE_SYNC).clear()

    // Clear files if in Electron
    if (this.isElectron) {
      await window.electronAPI!.clearMediaCache()
    }

    console.log('[Storage] Cache cleared')
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{ mediaCount: number; packageCount: number }> {
    if (!this.db) return { mediaCount: 0, packageCount: 0 }

    const mediaCount = await new Promise<number>((resolve) => {
      const transaction = this.db!.transaction([STORE_MEDIA], 'readonly')
      const request = transaction.objectStore(STORE_MEDIA).count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(0)
    })

    const packageCount = await new Promise<number>((resolve) => {
      const transaction = this.db!.transaction([STORE_PACKAGES], 'readonly')
      const request = transaction.objectStore(STORE_PACKAGES).count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(0)
    })

    return { mediaCount, packageCount }
  }
}

// Singleton instance
export const storageService = new StorageService()

// Extend window.electronAPI type
declare global {
  interface Window {
    electronAPI?: {
      loadSettings: () => Promise<Partial<KioskSettings> | null>
      getAppVersion: () => Promise<string>
      getMediaPath: () => Promise<string>
      downloadMedia: (
        url: string,
        id: string,
        mimeType: string,
        onProgress?: (percent: number) => void
      ) => Promise<string>
      fileExists: (path: string) => Promise<boolean>
      // Size in bytes of a cached file on disk (-1 if missing)
      getFileSize: (path: string) => Promise<number>
      clearMediaCache: () => Promise<void>
      // Wipe the on-disk IndexedDB storage directory (cache-corruption recovery)
      wipeDatabase: () => Promise<void>
      // Power controls
      shutdown: () => Promise<void>
      reboot: () => Promise<void>
      quitApp: () => Promise<void>
    }
  }
}
