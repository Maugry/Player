/**
 * Player Service
 * Manages kiosk playback state and content navigation
 */

import type {
  KioskMode,
  PlaybackState,
  AppState,
  ContentPackage,
  MenuItem,
  MediaItem,
  KioskCommand,
  KioskError,
  KioskErrorCode,
} from '@/types'
import { mqttService } from './mqtt'
import { APP_VERSION } from '@/version'

type StateChangeHandler = (state: PlayerState) => void
type SyncRequestHandler = () => void
type ModeChangeHandler = (newMode: KioskMode) => void
type LocaleChangeHandler = (newLocale: string) => void

export interface PlayerState {
  appState: AppState
  mode: KioskMode
  playbackState: PlaybackState
  volume: number
  locale: string
  looping: boolean // Whether current video should loop
  // Current content being displayed
  currentContent: MenuItem | MediaItem | null
  currentIndex: number // For playlist/showcase
  // Menu navigation
  menuStack: MenuItem[][] // Stack of menu levels for back navigation
  currentMenu: MenuItem[] | null
  // Whether the showcase grid is open (used by navigation in browse mode)
  showcaseOpen: boolean
  // Navigation tracking (mirrors standard status payload navigation object)
  navigation: { nodeId: string | null; path: string[]; showcaseOpen: boolean }
  screensaverActive: boolean
  sectionPath: string[]
  currentLeafId: string | null
  // Error info
  error: KioskError | null
  // Trigger pipeline (STANDARD §Trigger pipeline)
  triggeredPlayActive: boolean
  triggerEndedPending: boolean
}

const IDLE_TIMEOUT = 120000 // 2 minutes of inactivity

/**
 * Filter out guide-only items from menu (visitors shouldn't see them)
 */
function filterGuideOnlyItems(items: MenuItem[]): MenuItem[] {
  return items
    .filter(item => !item.guideOnly)
    .map(item => {
      // Also filter submenu items recursively
      if (item.submenuItems) {
        return { ...item, submenuItems: filterGuideOnlyItems(item.submenuItems) }
      }
      return item
    })
}

/**
 * Filter out guide-only items from media list (for playlist in loop mode)
 */
function filterGuideOnlyMedia(items: MediaItem[]): MediaItem[] {
  return items.filter(item => !item.guideOnly)
}

class PlayerService {
  private state: PlayerState = {
    appState: 'loading',
    mode: 'browse',
    playbackState: 'idle',
    volume: 80,
    locale: 'ru',
    looping: true,
    currentContent: null,
    currentIndex: 0,
    menuStack: [],
    currentMenu: null,
    showcaseOpen: false,
    navigation: { nodeId: null, path: [], showcaseOpen: false },
    screensaverActive: false,
    sectionPath: [],
    currentLeafId: null,
    error: null,
    triggeredPlayActive: false,
    triggerEndedPending: false,
  }

  private startTime = Date.now()
  private contentPackage: ContentPackage | null = null
  private stateHandlers: Set<StateChangeHandler> = new Set()
  private syncRequestHandlers: Set<SyncRequestHandler> = new Set()
  private modeChangeHandlers: Set<ModeChangeHandler> = new Set()
  private localeChangeHandlers: Set<LocaleChangeHandler> = new Set()
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Initialize player with content package
   */
  init(contentPackage: ContentPackage, mode: KioskMode): void {
    this.contentPackage = contentPackage
    this.state.mode = mode
    this.state.menuStack = []
    this.state.currentContent = null
    this.state.currentIndex = 0
    this.state.showcaseOpen = false
    this.state.sectionPath = []
    this.state.currentLeafId = null

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
        if (filtered.length) {
          this.state.currentContent = filtered[0]
          this.state.currentIndex = 0
        }
        break
      }

      case 'custom':
      default:
        this.state.appState = 'screensaver'
        break
    }

    this.state.screensaverActive = this.state.appState === 'screensaver'
    this.recomputeNavigation()
    this.notifyStateChange()
    this.publishStatus()
  }

  /**
   * Reinitialize player with new content (called after sync)
   */
  reinit(contentPackage: ContentPackage, mode?: KioskMode): void {
    console.log('[Player] Reinitializing with new content:', contentPackage.name)
    this.init(contentPackage, mode ?? this.state.mode)
  }

  /**
   * Change mode and reinitialize
   */
  setMode(newMode: KioskMode): void {
    if (newMode === this.state.mode) return
    console.log('[Player] Changing mode from', this.state.mode, 'to', newMode)
    if (this.contentPackage) {
      this.init(this.contentPackage, newMode)
    }
  }

  /**
   * Handle incoming MQTT command
   */
  handleCommand(command: KioskCommand): void {
    console.log('[Player] Handling command:', command.action)

    switch (command.action) {
      case 'play':
        if (command.value) {
          // Play specific content by ID
          this.playContentById(command.value)
        } else {
          // Just resume playback
          this.play()
        }
        break

      case 'pause':
        this.pause()
        break

      case 'stop':
        this.stop()
        break

      case 'volume':
        if (typeof command.value === 'number') {
          this.setVolume(command.value)
        }
        break

      case 'next':
        this.next()
        break

      case 'prev':
        this.previous()
        break

      case 'home':
        this.goHome()
        break

      case 'screensaver':
        this.goToScreensaver()
        break

      case 'content':
        if (command.value) {
          this.playContent(command.value)
        }
        break

      case 'mode':
        if (command.value) {
          console.log('[Player] Mode change requested:', command.value)
          this.modeChangeHandlers.forEach(handler => handler(command.value))
        }
        break

      case 'sync':
        console.log('[Player] Sync requested')
        this.syncRequestHandlers.forEach(handler => handler())
        break

      case 'restart':
        console.log('[Player] Restart requested')
        // Reload the application
        if (typeof window !== 'undefined') {
          window.location.reload()
        }
        break

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

      case 'locale':
        if (command.value) {
          console.log('[Player] Locale change requested:', command.value)
          this.state.locale = command.value
          this.notifyStateChange()
          this.publishStatus()
          this.localeChangeHandlers.forEach(handler => handler(command.value))
        }
        break

      case 'power_off':
        console.log('[Player] Shutdown requested')
        if (window.electronAPI?.shutdown) {
          window.electronAPI.shutdown()
        }
        break

      case 'reboot':
        console.log('[Player] Reboot requested')
        if (window.electronAPI?.reboot) {
          window.electronAPI.reboot()
        }
        break

      case 'loop':
        // Toggle or set looping
        if (typeof command.value === 'boolean') {
          this.state.looping = command.value
        } else {
          this.state.looping = !this.state.looping
        }
        console.log('[Player] Looping:', this.state.looping)
        this.notifyStateChange()
        this.publishStatus()
        break
    }
  }

  /**
   * User touched the screen - wake from screensaver
   */
  wake(): void {
    if (this.state.appState === 'screensaver' && this.state.mode === 'browse') {
      this.state.appState = 'menu'
      this.state.screensaverActive = false
      this.resetIdleTimer()
      this.notifyStateChange()
      this.publishStatus()
    }
  }

  /**
   * Play current content or resume
   */
  play(): void {
    if (this.state.playbackState === 'paused') {
      this.state.playbackState = 'playing'
    } else if (this.state.appState === 'screensaver') {
      this.wake()
    }
    this.notifyStateChange()
    this.publishStatus()
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.state.playbackState === 'playing') {
      this.state.playbackState = 'paused'
      this.notifyStateChange()
      this.publishStatus()
    }
  }

  /**
   * Stop and return to menu/screensaver
   */
  stop(): void {
    this.state.playbackState = 'idle'
    this.state.currentContent = null

    this.state.currentLeafId = null
    this.state.showcaseOpen = false

    if (this.state.mode === 'browse') {
      this.state.appState = 'menu'
      this.state.screensaverActive = false
      this.resetIdleTimer()
    } else {
      this.state.appState = 'screensaver'
      this.state.screensaverActive = true
      this.state.sectionPath = []
    }

    this.recomputeNavigation()
    this.notifyStateChange()
    this.publishStatus()
  }

  /**
   * Go to home/main menu
   */
  goHome(): void {
    this.state.menuStack = []
    this.state.currentMenu = filterGuideOnlyItems(this.contentPackage?.menuItems || [])
    this.state.currentContent = null
    this.state.playbackState = 'idle'
    this.state.appState = this.state.mode === 'browse' ? 'menu' : 'screensaver'
    this.state.sectionPath = []
    this.state.currentLeafId = null
    this.state.showcaseOpen = false
    this.state.screensaverActive = this.state.appState === 'screensaver'
    this.recomputeNavigation()
    this.resetIdleTimer()
    this.notifyStateChange()
    this.publishStatus()
  }

  /**
   * Select a menu item
   */
  selectMenuItem(item: MenuItem): void {
    this.resetIdleTimer()
    this.state.screensaverActive = false

    switch (item.contentType) {
      case 'video':
        if (item.video) {
          this.state.currentContent = item
          this.state.appState = 'content'
          this.state.playbackState = 'playing'
        }
        this.state.currentLeafId = item.id
        this.state.showcaseOpen = false
        break

      case 'article':
        this.state.currentContent = item
        this.state.appState = 'content'
        this.state.playbackState = 'idle'
        this.state.currentLeafId = item.id
        this.state.showcaseOpen = false
        break

      case 'showcase':
        this.state.currentContent = item
        this.state.currentIndex = 0
        this.state.appState = 'content'
        this.state.currentLeafId = item.id
        this.state.showcaseOpen = true
        break

      case 'submenu':
        if (item.submenuItems) {
          this.state.menuStack.push(this.state.currentMenu || [])
          this.state.currentMenu = filterGuideOnlyItems(item.submenuItems)
          this.state.sectionPath.push(item.id)
          this.state.currentLeafId = null
          this.state.showcaseOpen = false
        }
        break
    }

    this.recomputeNavigation()
    this.notifyStateChange()
    this.publishStatus()
  }

  /**
   * Go back in menu navigation
   */
  goBack(): void {
    this.resetIdleTimer()

    if (this.state.appState === 'content') {
      // Return to menu from content
      this.state.currentContent = null
      this.state.playbackState = 'idle'
      this.state.appState = 'menu'
      this.state.currentLeafId = null
      this.state.showcaseOpen = false
    } else if (this.state.menuStack.length > 0) {
      // Go up one menu level
      this.state.currentMenu = this.state.menuStack.pop() || []
      this.state.sectionPath.pop()
    }

    this.recomputeNavigation()
    this.notifyStateChange()
    this.publishStatus()
  }

  /**
   * Next item in playlist/showcase
   */
  next(): void {
    const items = this.getPlaylistItems()
    if (!items || items.length === 0) return

    this.state.currentIndex = (this.state.currentIndex + 1) % items.length

    // For loop mode, update currentContent to the playlist item.
    // For showcase, keep currentContent (the parent MenuItem) and only change index.
    if (this.state.mode === 'loop') {
      this.state.currentContent = items[this.state.currentIndex] as any
    }

    this.resetIdleTimer()
    this.notifyStateChange()
    this.publishStatus()
  }

  /**
   * Previous item in playlist/showcase
   */
  previous(): void {
    const items = this.getPlaylistItems()
    if (!items || items.length === 0) return

    this.state.currentIndex = this.state.currentIndex > 0
      ? this.state.currentIndex - 1
      : items.length - 1

    // For loop mode, update currentContent to the playlist item.
    // For showcase, keep currentContent (the parent MenuItem) and only change index.
    if (this.state.mode === 'loop') {
      this.state.currentContent = items[this.state.currentIndex] as any
    }
    this.resetIdleTimer()
    this.notifyStateChange()
    this.publishStatus()
  }

  /**
   * Play specific content by ID (from 'content' command)
   */
  playContent(contentId: string): void {
    // Find content in menu items
    const item = this.findMenuItemById(contentId, this.contentPackage?.menuItems || [])
    if (item) {
      this.selectMenuItem(item)
    }
  }

  /**
   * Play specific content by media ID (from 'play' command with mediaId)
   * Searches playlist, guide content, and menu items
   */
  playContentById(mediaId: string): void {
    // Check playlist items first (for loop mode)
    const playlistItems = this.contentPackage?.playlist?.items || []
    const playlistIndex = playlistItems.findIndex(item => item.id === mediaId)
    if (playlistIndex >= 0) {
      console.log('[Player] Playing playlist item at index:', playlistIndex)
      this.state.currentIndex = playlistIndex
      this.state.currentContent = playlistItems[playlistIndex]
      this.state.appState = 'content'
      this.state.playbackState = 'playing'
      this.notifyStateChange()
      this.publishStatus()
      return
    }

    // Check guide content
    const guideItems = this.contentPackage?.guideContent?.items || []
    const guideItem = guideItems.find(item => item.id === mediaId)
    if (guideItem) {
      console.log('[Player] Playing guide content:', guideItem.title || mediaId)
      this.state.currentContent = guideItem
      this.state.appState = 'content'
      this.state.playbackState = 'playing'
      this.notifyStateChange()
      this.publishStatus()
      return
    }

    // Check menu items (find by video ID)
    const menuItem = this.findMenuItemByMediaId(mediaId, this.contentPackage?.menuItems || [])
    if (menuItem) {
      console.log('[Player] Playing menu item:', menuItem.title)
      this.selectMenuItem(menuItem)
      return
    }

    console.warn('[Player] Content not found for ID:', mediaId)
  }

  /**
   * Find menu item by its media/video ID
   */
  private findMenuItemByMediaId(mediaId: string, items: MenuItem[]): MenuItem | null {
    for (const item of items) {
      if (item.video?.id === mediaId) return item
      if (item.submenuItems) {
        const found = this.findMenuItemByMediaId(mediaId, item.submenuItems)
        if (found) return found
      }
    }
    return null
  }

  /**
   * Set volume
   */
  setVolume(volume: number): void {
    this.state.volume = Math.max(0, Math.min(100, volume))
    this.notifyStateChange()
    this.publishStatus()
  }

  /**
   * Get current playlist/showcase items (filtered for visitors)
   */
  private getPlaylistItems(): any[] | null {
    if (this.state.mode === 'loop') {
      // Filter out guide-only items from playlist
      return filterGuideOnlyMedia(this.contentPackage?.playlist?.items || [])
    }
    // For showcase content
    const content = this.state.currentContent as MenuItem | null
    if (content && content.contentType === 'showcase' && content.showcaseItems) {
      return content.showcaseItems
    }
    return null
  }

  /**
   * Find menu item by ID recursively
   */
  private findMenuItemById(id: string, items: MenuItem[]): MenuItem | null {
    for (const item of items) {
      if (item.id === id) return item
      if (item.submenuItems) {
        const found = this.findMenuItemById(id, item.submenuItems)
        if (found) return found
      }
    }
    return null
  }

  /**
   * Reset idle timer
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }

    if (this.state.mode === 'browse') {
      this.idleTimer = setTimeout(() => {
        this.goToScreensaver()
      }, IDLE_TIMEOUT)
    }
  }

  /**
   * Go to screensaver after idle timeout
   */
  private goToScreensaver(): void {
    this.state.appState = 'screensaver'
    this.state.currentContent = null
    this.state.playbackState = 'idle'
    this.state.menuStack = []
    this.state.currentMenu = filterGuideOnlyItems(this.contentPackage?.menuItems || [])
    this.state.sectionPath = []
    this.state.currentLeafId = null
    this.state.showcaseOpen = false
    this.state.screensaverActive = true
    this.recomputeNavigation()
    this.notifyStateChange()
    this.publishStatus()
  }

  /**
   * Set error state
   */
  setError(code: KioskErrorCode | string, message: string): void {
    this.state.error = { code, message, timestamp: new Date().toISOString() }
    this.state.appState = 'error'
    this.state.playbackState = 'error'
    this.notifyStateChange()
    this.publishStatus()
  }

  /**
   * Clear error
   */
  clearError(): void {
    this.state.error = null
    this.state.appState = 'screensaver'
    this.state.screensaverActive = true
    this.notifyStateChange()
    this.publishStatus()
  }

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

  /**
   * Recompute the navigation object from sectionPath + currentLeafId + showcaseOpen.
   * Mirrors the standard status payload navigation shape.
   */
  private recomputeNavigation(): void {
    const leaf = this.currentLeafIdPresent()
    const path = leaf
      ? [...this.state.sectionPath, this.state.currentLeafId!]
      : [...this.state.sectionPath]
    const nodeId = leaf
      ? this.state.currentLeafId!
      : (this.state.sectionPath.length ? this.state.sectionPath[this.state.sectionPath.length - 1] : null)
    this.state.navigation = { nodeId, path, showcaseOpen: this.state.showcaseOpen }
  }

  private currentLeafIdPresent(): boolean {
    return this.state.currentLeafId !== null
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(handler: StateChangeHandler): () => void {
    this.stateHandlers.add(handler)
    // Immediately call with current state
    handler(this.state)
    return () => this.stateHandlers.delete(handler)
  }

  /**
   * Subscribe to sync requests (triggered by CMS content changes)
   */
  onSyncRequest(handler: SyncRequestHandler): () => void {
    this.syncRequestHandlers.add(handler)
    return () => this.syncRequestHandlers.delete(handler)
  }

  /**
   * Subscribe to mode changes
   */
  onModeChange(handler: ModeChangeHandler): () => void {
    this.modeChangeHandlers.add(handler)
    return () => this.modeChangeHandlers.delete(handler)
  }

  /**
   * Subscribe to locale changes
   */
  onLocaleChange(handler: LocaleChangeHandler): () => void {
    this.localeChangeHandlers.add(handler)
    return () => this.localeChangeHandlers.delete(handler)
  }

  /**
   * Get current state
   */
  getState(): PlayerState {
    return { ...this.state }
  }

  /**
   * Notify all state handlers
   */
  private notifyStateChange(): void {
    const stateCopy = { ...this.state }
    this.stateHandlers.forEach(handler => handler(stateCopy))
  }

  /**
   * Publish status to MQTT
   */
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
}

// Singleton instance
export const playerService = new PlayerService()
