/**
 * Showcase Viewer Screen
 * Displays image gallery with navigation
 */

import { Button } from '@/components/ui/button'
import { ArrowLeft, Home, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ShowcaseItem } from '@/types'

interface ShowcaseViewerProps {
  items: ShowcaseItem[]
  currentIndex: number
  onNext: () => void
  onPrev: () => void
  onBack: () => void
  onHome: () => void
}

export function ShowcaseViewer({
  items,
  currentIndex,
  onNext,
  onPrev,
  onBack,
  onHome,
}: ShowcaseViewerProps) {
  const currentItem = items[currentIndex]

  if (!currentItem) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="lg" className="text-white" onClick={onBack}>
              <ArrowLeft className="w-6 h-6 mr-2" />
              Назад
            </Button>
            <Button variant="ghost" size="lg" className="text-white" onClick={onHome}>
              <Home className="w-6 h-6 mr-2" />
              Главная
            </Button>
          </div>
          <span className="text-white text-lg">
            {currentIndex + 1} / {items.length}
          </span>
        </div>
      </header>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center p-16">
        <img
          src={currentItem.image.url}
          alt={currentItem.title}
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {/* Navigation arrows */}
      {items.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={onPrev}
          >
            <ChevronLeft className="w-10 h-10" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={onNext}
          >
            <ChevronRight className="w-10 h-10" />
          </Button>
        </>
      )}

      {/* Bottom info */}
      <footer className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6">
        <div className="text-center text-white">
          <h2 className="text-2xl font-bold mb-2">{currentItem.title}</h2>
          {currentItem.description && (
            <p className="text-lg text-white/80">{currentItem.description}</p>
          )}
        </div>

        {/* Dots indicator */}
        {items.length > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            {items.map((_, idx) => (
              <div
                key={idx}
                className={`w-3 h-3 rounded-full transition-colors ${
                  idx === currentIndex ? 'bg-white' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        )}
      </footer>
    </div>
  )
}
