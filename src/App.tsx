/**
 * Umka Kiosk Player
 * Main application component
 */

import { useEffect, useState, useCallback } from 'react'
import {
  Screensaver,
  BrowseMenu,
  VideoPlayer,
  ArticleViewer,
  DetailPage,
  ErrorScreen,
  LoadingScreen,
} from '@/screens'
import { loadSettings } from '@/services/config'
import { mqttService } from '@/services/mqtt'
import { supervisorService } from '@/services/supervisor'
import { apiService } from '@/services/api'
import { playerService, type PlayerState } from '@/services/player'
import { storageService } from '@/services/storage'
import type { KioskSettings, ContentPackage, MenuItem, MediaItem, KioskCommand, KioskMode } from '@/types'

// Fallback content for when CMS is completely unavailable
// This should only be used during local development without CMS
const FALLBACK_CONTENT: ContentPackage = {
  id: 'fallback',
  name: 'Fallback Content (No CMS)',
  mode: 'browse',
  menuItems: [
    {
      id: '1',
      title: 'CMS Недоступен',
      description: 'Подключитесь к CMS для загрузки контента',
      contentType: 'article',
      article: {
        id: 'no-cms',
        title: 'CMS Недоступен',
        content: {
          root: {
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', text: 'Не удалось загрузить контент из CMS. Убедитесь, что сервер Payload CMS запущен и доступен.' }],
              },
            ],
          },
        },
      },
    },
  ],
  screensaver: {
    enabled: true,
  },
}

function App() {
  const [settings, setSettings] = useState<KioskSettings | null>(null)
  const [playerState, setPlayerState] = useState<PlayerState | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [contentPackage, setContentPackage] = useState<ContentPackage | null>(null)

  /**
   * Load content and mode from CMS
   */
  const loadContentFromCMS = useCallback(async (): Promise<{ content: ContentPackage; mode: KioskMode } | null> => {
    try {
      const kioskConfig = await apiService.getKioskConfig()
      console.log('[App] Kiosk config:', kioskConfig)
      if (kioskConfig.contentPackage) {
        const pkgId = typeof kioskConfig.contentPackage === 'string'
          ? kioskConfig.contentPackage
          : kioskConfig.contentPackage.id
        const content = await apiService.getContentPackage(pkgId)
        const mode = kioskConfig.mode as KioskMode
        console.log('[App] Content loaded from CMS:', content.name, 'mode:', mode)
        return { content, mode }
      }
    } catch (err) {
      console.warn('[App] Failed to load from CMS:', err)
    }
    return null
  }, [])

  /**
   * Handle sync request - reload content from CMS
   */
  const handleSyncRequest = useCallback(async () => {
    if (isSyncing || !settings) return

    console.log('[App] Sync request received, reloading content...')
    setIsSyncing(true)

    try {
      const result = await loadContentFromCMS()
      if (result) {
        const { content, mode } = result
        // Cache the new content
        console.log('[App] Caching synced content...')
        storageService.cacheContentPackage(content, (current, total, mediaId) => {
          console.log(`[App] Caching media ${current}/${total}: ${mediaId}`)
        }).catch(err => {
          console.warn('[App] Failed to cache content:', err)
        })

        // Reinitialize player with new content and mode from CMS
        playerService.reinit(content, mode)
        setContentPackage(content)
        console.log('[App] Content synced successfully')
      } else {
        console.warn('[App] Sync failed - no content received')
      }
    } catch (err) {
      console.error('[App] Sync error:', err)
    } finally {
      setIsSyncing(false)
    }
  }, [settings, isSyncing, loadContentFromCMS])

  /**
   * Handle mode change from CMS
   */
  const handleModeChange = useCallback((newMode: KioskMode) => {
    console.log('[App] Mode change received:', newMode)
    playerService.setMode(newMode)
  }, [])

  // Initialize app
  useEffect(() => {
    async function init() {
      try {
        console.log('[App] Initializing...')

        // Load settings
        const loadedSettings = await loadSettings()
        setSettings(loadedSettings)
        console.log('[App] Settings loaded:', loadedSettings)

        // Initialize services
        apiService.init(loadedSettings)
        await storageService.init()
        console.log('[App] Storage service initialized')

        // Check for cached content first (for offline support)
        const hasCached = await storageService.hasCachedContent()
        console.log('[App] Has cached content:', hasCached)

        // Run MQTT and CMS loading in parallel for faster startup
        let content: ContentPackage = FALLBACK_CONTENT

        const [mqttResult, cmsResult] = await Promise.allSettled([
          // MQTT connection (non-blocking)
          mqttService.connect(loadedSettings),
          // CMS content loading
          loadContentFromCMS(),
        ])

        if (mqttResult.status === 'fulfilled') {
          console.log('[App] MQTT connected')
        } else {
          console.warn('[App] MQTT connection failed, continuing without:', mqttResult.reason)
        }

        // Supervisor emulation: owns system/heartbeat + graceful-offline (and
        // the LWT set in mqtt connect options). In production a separate
        // Sentinel owns these; this all-in-one Player emulates it.
        supervisorService.start(loadedSettings)

        // Mode from CMS takes priority, fallback to local settings
        let mode: KioskMode = loadedSettings.mode

        if (cmsResult.status === 'fulfilled' && cmsResult.value) {
          content = cmsResult.value.content
          mode = cmsResult.value.mode

          // Cache the content package and media for offline use
          console.log('[App] Caching content for offline use...')
          storageService.cacheContentPackage(content, (current, total, mediaId) => {
            console.log(`[App] Caching media ${current}/${total}: ${mediaId}`)
          }).then(() => {
            console.log('[App] Content caching complete')
          }).catch((err) => {
            console.warn('[App] Content caching failed:', err)
          })
        } else {
          console.warn('[App] Failed to load from CMS')

          // Try to load from local cache
          if (hasCached) {
            const cachedContent = await storageService.getActiveContentPackage()
            if (cachedContent) {
              content = cachedContent
              console.log('[App] Using cached content:', content.name)
            } else {
              console.warn('[App] Cached content not found, using fallback content')
            }
          } else {
            console.warn('[App] No cached content available, using fallback content')
          }
        }

        // Initialize player with content and mode from CMS
        playerService.init(content, mode)
        setContentPackage(content)

        // Subscribe to MQTT commands
        mqttService.onCommand((cmd: KioskCommand) => {
          playerService.handleCommand(cmd)
        })

        setIsInitializing(false)

      } catch (err) {
        console.error('[App] Initialization error:', err)
        setInitError(err instanceof Error ? err.message : 'Unknown error')
        setIsInitializing(false)
      }
    }

    init()

    // Publish graceful-offline on tab/window teardown (browser path).
    const handleBeforeUnload = () => supervisorService.shutdown()
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      supervisorService.shutdown()
      mqttService.disconnect()
    }
  }, [loadContentFromCMS])

  // Subscribe to player sync/mode events (separate effect to avoid stale closures)
  useEffect(() => {
    const unsubSync = playerService.onSyncRequest(handleSyncRequest)
    const unsubMode = playerService.onModeChange(handleModeChange)

    return () => {
      unsubSync()
      unsubMode()
    }
  }, [handleSyncRequest, handleModeChange])

  // Subscribe to player state changes
  useEffect(() => {
    const unsubscribe = playerService.onStateChange(setPlayerState)
    return unsubscribe
  }, [])

  // Resolve media URLs for current content (use cached if available)
  useEffect(() => {
    async function resolveMediaUrl() {
      if (!playerState?.currentContent) {
        setResolvedVideoUrl(null)
        return
      }

      // Raw MediaItem content: loop-mode playlist items, or triggered playback
      // (trigger_play sets a bare MediaItem with no contentType, in any mode).
      const rawMedia = playerState.currentContent as MediaItem & { contentType?: unknown }
      const isRawMediaItem =
        playerState.mode === 'loop' ||
        playerState.triggeredPlayActive ||
        (rawMedia.contentType === undefined && typeof rawMedia.url === 'string' && !!rawMedia.mimeType)
      if (isRawMediaItem) {
        const media = rawMedia
        if (media.mimeType?.startsWith('video/') || media.mimeType?.startsWith('audio/')) {
          try {
            const url = await storageService.getMediaUrl(media)
            setResolvedVideoUrl(url)
          } catch (err) {
            console.warn('[App] Failed to resolve media URL, using original:', err)
            setResolvedVideoUrl(media.url)
          }
          return
        }
      }

      // Browse mode: currentContent is a MenuItem
      const content = playerState.currentContent as MenuItem
      if (content.contentType === 'video' && content.video) {
        try {
          const url = await storageService.getMediaUrl(content.video)
          setResolvedVideoUrl(url)
        } catch (err) {
          console.warn('[App] Failed to resolve media URL, using original:', err)
          setResolvedVideoUrl(content.video.url)
        }
      } else {
        setResolvedVideoUrl(null)
      }
    }

    resolveMediaUrl()
  }, [playerState?.currentContent, playerState?.mode, playerState?.triggeredPlayActive])

  // Handlers
  const handleWake = useCallback(() => {
    playerService.wake()
  }, [])

  const handleSelectMenuItem = useCallback((item: MenuItem) => {
    playerService.selectMenuItem(item)
  }, [])

  const handleBack = useCallback(() => {
    playerService.goBack()
  }, [])

  const handleHome = useCallback(() => {
    playerService.goHome()
  }, [])

  const handlePlay = useCallback(() => {
    playerService.play()
  }, [])

  const handlePause = useCallback(() => {
    playerService.pause()
  }, [])

  const handleVideoEnded = useCallback(() => {
    // Route advance/stop (and trigger-ended) decision through the player service.
    playerService.onMediaEnded()
  }, [])

  const handleVolumeChange = useCallback((volume: number) => {
    playerService.setVolume(volume)
  }, [])

  const handleRetry = useCallback(() => {
    window.location.reload()
  }, [])

  // Screensaver config: `enabled` is optional on the package type but the
  // Screensaver component expects a concrete boolean. Treat undefined as false.
  const screensaverConfig = contentPackage?.screensaver
    ? { ...contentPackage.screensaver, enabled: !!contentPackage.screensaver.enabled }
    : undefined

  // Loading state
  if (isInitializing) {
    return <LoadingScreen message="Инициализация киоска..." />
  }

  // Error state
  if (initError) {
    return <ErrorScreen error={initError} onRetry={handleRetry} />
  }

  // No player state yet
  if (!playerState) {
    return <LoadingScreen message="Загрузка контента..." />
  }

  // Player error
  if (playerState.appState === 'error' && playerState.error) {
    return <ErrorScreen error={playerState.error.message} onRetry={handleRetry} />
  }

  // Screensaver
  if (playerState.appState === 'screensaver') {
    return <Screensaver onWake={handleWake} screensaver={screensaverConfig} />
  }

  // Menu (browse mode)
  if (playerState.appState === 'menu' && playerState.currentMenu) {
    return (
      <BrowseMenu
        items={playerState.currentMenu}
        canGoBack={playerState.menuStack.length > 0}
        onSelect={handleSelectMenuItem}
        onBack={handleBack}
        onHome={handleHome}
      />
    )
  }

  // Content display
  if (playerState.appState === 'content' && playerState.currentContent) {
    // Raw MediaItem content renders the same media player regardless of mode:
    //  - Loop mode (incl. former projector/audio profiles): playlist items.
    //  - Triggered playback (trigger_play): a bare MediaItem with no
    //    contentType, set in browse/custom/loop alike. Without this branch a
    //    trigger would fall through to the MenuItem switch below (which keys
    //    off contentType) and render nothing.
    {
      const rawMedia = playerState.currentContent as MediaItem & { contentType?: unknown }
      const isTriggered = playerState.triggeredPlayActive
      const isRawMediaItem =
        playerState.mode === 'loop' ||
        isTriggered ||
        (rawMedia.contentType === undefined && typeof rawMedia.url === 'string' && !!rawMedia.mimeType)

      if (isRawMediaItem) {
        const isVideo = rawMedia.mimeType?.startsWith('video/')
        const isAudio = rawMedia.mimeType?.startsWith('audio/')

        if (isVideo || isAudio) {
          return (
            <VideoPlayer
              media={rawMedia}
              resolvedUrl={resolvedVideoUrl || undefined}
              autoPlay
              // A trigger is a one-shot; only loop playlists repeat.
              loop={isTriggered ? false : playerState.looping}
              volume={playerState.volume}
              isPlaying={playerState.playbackState === 'playing'}
              onPlay={handlePlay}
              onPause={handlePause}
              onEnded={() => playerService.onMediaEnded()}
              onBack={handleBack}
              onVolumeChange={handleVolumeChange}
              showBackButton={false}
              showNextPrev={!isTriggered}
              onNext={() => playerService.next()}
              onPrev={() => playerService.previous()}
            />
          )
        }
      }
    }

    const content = playerState.currentContent as MenuItem

    // New CMS model: showcase items and any item carrying detailBlocks render a
    // detail page. A plain video item (no detailBlocks) still plays directly.
    if (content.contentType === 'showcase' || content.detailBlocks?.length) {
      return (
        <DetailPage
          item={content}
          onBack={handleBack}
          onHome={handleHome}
        />
      )
    }

    // Video content (browse mode)
    if (content.contentType === 'video' && content.video) {
      return (
        <VideoPlayer
          media={content.video}
          resolvedUrl={resolvedVideoUrl || undefined}
          autoPlay
          loop={playerState.looping}
          volume={playerState.volume}
          isPlaying={playerState.playbackState === 'playing'}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleVideoEnded}
          onBack={handleBack}
          onVolumeChange={handleVolumeChange}
          showBackButton={true}
          showNextPrev={false}
          onNext={() => playerService.next()}
          onPrev={() => playerService.previous()}
        />
      )
    }

    // Article content
    if (content.contentType === 'article') {
      return (
        <ArticleViewer
          item={content}
          onBack={handleBack}
          onHome={handleHome}
        />
      )
    }

    // Showcase items (contentType === 'showcase') and any item with
    // detailBlocks are handled by the DetailPage branch above; its legacy
    // showcaseItems fallback supersedes the old ShowcaseViewer.
  }

  // Fallback to screensaver
  return <Screensaver onWake={handleWake} screensaver={screensaverConfig} />
}

export default App
