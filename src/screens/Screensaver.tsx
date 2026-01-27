/**
 * Screensaver Screen
 * Displayed when kiosk is idle, touch anywhere to wake
 */

import { useEffect, useState } from 'react'

interface ScreensaverProps {
  onWake: () => void
  videoUrl?: string
  logoUrl?: string
}

export function Screensaver({ onWake, videoUrl, logoUrl }: ScreensaverProps) {
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    // Show touch hint after 3 seconds
    const timer = setTimeout(() => setShowHint(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black cursor-pointer"
      onClick={onWake}
      onTouchStart={onWake}
    >
      {/* Video background if provided */}
      {videoUrl && (
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
        />
      )}

      {/* Logo overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Logo"
            className="w-64 h-64 object-contain animate-pulse"
          />
        ) : (
          <div className="text-center">
            <h1 className="text-6xl font-bold text-white mb-4 animate-pulse">
              UMKA
            </h1>
            <p className="text-2xl text-white/70">Музейный киоск</p>
          </div>
        )}

        {/* Touch hint */}
        {showHint && (
          <div className="absolute bottom-16 text-white/60 text-lg animate-bounce">
            Коснитесь экрана для начала
          </div>
        )}
      </div>
    </div>
  )
}
