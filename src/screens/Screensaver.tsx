/**
 * Screensaver Screen (v2.5)
 * Displayed when kiosk is idle, supports media carousel, title/subtitle, configurable start button
 */

import { useEffect, useState, useCallback, useRef } from 'react'

interface ScreensaverProps {
  onWake: () => void
  screensaver?: {
    enabled: boolean
    media?: Array<{ id: string; url: string; mimeType: string }>
    title?: string
    subtitle?: string
    showStartButton?: boolean
    startButtonText?: string
    idleTimeoutSeconds?: number
    showTransitionAnimation?: boolean
  }
  logoUrl?: string
}

const CAROUSEL_INTERVAL_MS = 8000

export function Screensaver({ onWake, screensaver, logoUrl }: ScreensaverProps) {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const [dismissing, setDismissing] = useState(false)
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // If screensaver is explicitly disabled, wake immediately
  useEffect(() => {
    if (screensaver && !screensaver.enabled) {
      onWake()
    }
  }, [screensaver, onWake])

  // Media carousel: cycle through items every 8 seconds
  const mediaItems = screensaver?.media?.filter(m => m.url) ?? []
  useEffect(() => {
    if (mediaItems.length <= 1) return

    const interval = setInterval(() => {
      setCurrentMediaIndex(prev => (prev + 1) % mediaItems.length)
    }, CAROUSEL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [mediaItems.length])

  const mountedRef = useRef(true)

  // Handle dismiss with optional fade-out transition
  const handleWake = useCallback(() => {
    if (dismissing) return

    const shouldAnimate = screensaver?.showTransitionAnimation !== false
    if (shouldAnimate) {
      setDismissing(true)
      dismissTimeoutRef.current = setTimeout(() => {
        onWake()
        // If the wake did not navigate away (e.g. loop/custom mode with no content
        // to show), this component is still mounted — fade back in instead of
        // leaving a blank screen. When the wake does change the view, the unmount
        // makes this a no-op (guarded by mountedRef).
        if (mountedRef.current) setDismissing(false)
      }, 500)
    } else {
      onWake()
    }
  }, [dismissing, screensaver?.showTransitionAnimation, onWake])

  // Track mounted state. Set in the effect body (not just useRef's initial value)
  // so it resets to true on every mount — under React StrictMode the effect is
  // cleaned up and re-run, which would otherwise leave the ref stuck at false.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current)
      }
    }
  }, [])

  // If disabled, render nothing (useEffect above calls onWake)
  if (screensaver && !screensaver.enabled) {
    return null
  }

  const showStartButton = screensaver?.showStartButton !== false
  const startButtonText = screensaver?.startButtonText || 'Нажмите, чтобы начать'
  const currentMedia = mediaItems.length > 0 ? mediaItems[currentMediaIndex] : null

  const isVideo = currentMedia?.mimeType?.startsWith('video/')
  const isImage = currentMedia?.mimeType?.startsWith('image/')

  return (
    <div
      className={`fixed inset-0 bg-black cursor-pointer transition-opacity duration-500 ${
        dismissing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleWake}
      onTouchStart={handleWake}
    >
      {/* Media background */}
      {currentMedia && isVideo && (
        <video
          key={currentMedia.id}
          className="absolute inset-0 w-full h-full object-cover"
          src={currentMedia.url}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
      {currentMedia && isImage && (
        <img
          key={currentMedia.id}
          className="absolute inset-0 w-full h-full object-cover"
          src={currentMedia.url}
          alt=""
        />
      )}

      {/* Content overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
        {/* Logo */}
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Logo"
            className="w-64 h-64 object-contain mb-8"
          />
        )}

        {/* Title and subtitle */}
        {screensaver?.title ? (
          <div className="text-center px-8">
            <h1 className="text-6xl font-bold text-white mb-4">
              {screensaver.title}
            </h1>
            {screensaver.subtitle && (
              <p className="text-2xl text-white/70">
                {screensaver.subtitle}
              </p>
            )}
          </div>
        ) : !logoUrl ? (
          <div className="text-center">
            <h1 className="text-6xl font-bold text-white mb-4 animate-pulse">
              UMKA
            </h1>
            <p className="text-2xl text-white/70">Музейный киоск</p>
          </div>
        ) : null}

        {/* Start button */}
        {showStartButton && (
          <div className="absolute bottom-16 text-white/60 text-lg animate-bounce">
            {startButtonText}
          </div>
        )}
      </div>
    </div>
  )
}
