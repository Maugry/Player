/**
 * Video Player Screen
 * Full-screen video playback with controls
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  ArrowLeft,
  SkipForward,
  SkipBack,
  Maximize,
  Minimize,
} from 'lucide-react'
import type { MediaItem } from '@/types'

interface VideoPlayerProps {
  media: MediaItem
  resolvedUrl?: string // Resolved URL (cached local path or original)
  autoPlay?: boolean
  loop?: boolean
  volume: number
  isPlaying: boolean
  onPlay: () => void
  onPause: () => void
  onEnded: () => void
  onBack: () => void
  onVolumeChange: (volume: number) => void
  showBackButton?: boolean
  showNextPrev?: boolean
  onNext?: () => void
  onPrev?: () => void
}

export function VideoPlayer({
  media,
  resolvedUrl,
  autoPlay = true,
  loop = false,
  volume,
  isPlaying,
  onPlay,
  onPause,
  onEnded,
  onBack,
  onVolumeChange,
  showBackButton = true,
  showNextPrev = false,
  onNext,
  onPrev,
}: VideoPlayerProps) {
  // Use resolved URL if available, otherwise fall back to original
  const videoUrl = resolvedUrl || media.url
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showControls, setShowControls] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout>>()

  // Sync volume with video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume / 100
    }
  }, [volume])

  // Sync play state
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(console.error)
      } else {
        videoRef.current.pause()
      }
    }
  }, [isPlaying])

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current)
    }
    hideControlsTimer.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false)
      }
    }, 3000)
  }, [isPlaying])

  useEffect(() => {
    resetHideTimer()
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current)
      }
    }
  }, [resetHideTimer])

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }

  const handleSeek = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0]
      setCurrentTime(value[0])
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const toggleFullscreen = async () => {
    if (!containerRef.current) return

    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handlePlayPause = () => {
    if (isPlaying) {
      onPause()
    } else {
      onPlay()
    }
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black"
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {/* Video - click to toggle play/pause */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain cursor-pointer"
        src={videoUrl}
        autoPlay={autoPlay}
        loop={loop}
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={onEnded}
        onClick={handlePlayPause}
      />

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar - z-20 to be above center play button */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4 z-20">
          <div className="flex items-center justify-between">
            {showBackButton && (
              <Button variant="ghost" size="lg" className="text-white hover:bg-white/20" onClick={onBack}>
                <ArrowLeft className="w-6 h-6 mr-2" />
                Назад
              </Button>
            )}
            <h2 className="text-white text-xl font-semibold truncate max-w-md">
              {media.title}
            </h2>
            <Button variant="ghost" size="icon" className="text-white" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
            </Button>
          </div>
        </div>

        {/* Center play button (large) - z-10 below top/bottom bars */}
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Button
            variant="ghost"
            size="icon"
            className="w-24 h-24 rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={handlePlayPause}
          >
            {isPlaying ? (
              <Pause className="w-12 h-12" />
            ) : (
              <Play className="w-12 h-12 ml-2" />
            )}
          </Button>
        </div>

        {/* Bottom controls - z-20 to be above center play button */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 z-20">
          {/* Progress bar */}
          <div className="flex items-center gap-4 mb-4">
            <span className="text-white text-sm w-12">{formatTime(currentTime)}</span>
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1}
              onValueChange={handleSeek}
              className="flex-1"
            />
            <span className="text-white text-sm w-12">{formatTime(duration)}</span>
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {showNextPrev && onPrev && (
                <Button variant="ghost" size="icon" className="text-white" onClick={onPrev}>
                  <SkipBack className="w-6 h-6" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="text-white"
                onClick={handlePlayPause}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              </Button>

              {showNextPrev && onNext && (
                <Button variant="ghost" size="icon" className="text-white" onClick={onNext}>
                  <SkipForward className="w-6 h-6" />
                </Button>
              )}
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2 w-48">
              <Button variant="ghost" size="icon" className="text-white" onClick={toggleMute}>
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-6 h-6" />
                ) : (
                  <Volume2 className="w-6 h-6" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={100}
                step={1}
                onValueChange={(v) => onVolumeChange(v[0])}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
