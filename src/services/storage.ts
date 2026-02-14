/**
 * Storage Service
 * Handles local caching of content for offline operation
 *
 * Uses:
 * - IndexedDB for metadata and content packages
 * - File system (via Electron) for media files
 */

import type { ContentPackage, MediaItem } from '@/types'

const DB_NAME = 'umka-kiosk'
const DB_VERSION = 1
const STORE_PACKAGES = 'content-packages'
const STORE_MEDIA = 'media-metadata'
const STORE_SYNC = 'sync-state'

interface SyncState {
  lastSyncAt: string | null
  packageId: string | null
  packageVersion: string | null
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
   * Open IndexedDB database
   */
  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('[Storage] Failed to open database:', request.error)
        reject(request.error)
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
      // Verify file still exists
      if (this.isElectron) {
        const exists = await window.electronAPI!.fileExists(cached.localPath)
        if (exists) {
          // Check if content changed via checksum
          if (media.checksum && cached.checksum && media.checksum !== cached.checksum) {
            console.log(`[Storage] Media ${media.id} changed (checksum mismatch), re-downloading`)
          } else {
            console.log('[Storage] Media already cached:', media.id)
            return cached.localPath
          }
        }
      } else {
        // In browser, check checksum if available
        if (media.checksum && cached.checksum && media.checksum !== cached.checksum) {
          console.log(`[Storage] Media ${media.id} changed (checksum mismatch), re-downloading`)
        } else {
          return cached.localPath
        }
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

      // Save metadata to IndexedDB
      await this.saveCachedMedia({
        id: media.id,
        originalUrl: media.url,
        localPath,
        mimeType: media.mimeType,
        size: 0, // Will be updated by main process
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
      packageVersion: (pkg as any).version || '1',
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
      loadSettings: () => Promise<any>
      getAppVersion: () => Promise<string>
      getMediaPath: () => Promise<string>
      downloadMedia: (
        url: string,
        id: string,
        mimeType: string,
        onProgress?: (percent: number) => void
      ) => Promise<string>
      fileExists: (path: string) => Promise<boolean>
      clearMediaCache: () => Promise<void>
      // Power controls
      shutdown: () => Promise<void>
      reboot: () => Promise<void>
      quitApp: () => Promise<void>
    }
  }
}
