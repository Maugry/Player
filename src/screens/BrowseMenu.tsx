/**
 * Browse Menu Screen
 * Displays menu items in a grid for interactive browsing
 */

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Home, Play, FileText, Image, FolderOpen } from 'lucide-react'
import type { MenuItem } from '@/types'

interface BrowseMenuProps {
  items: MenuItem[]
  canGoBack: boolean
  onSelect: (item: MenuItem) => void
  onBack: () => void
  onHome: () => void
}

const iconMap = {
  video: Play,
  article: FileText,
  showcase: Image,
  submenu: FolderOpen,
}

export function BrowseMenu({ items, canGoBack, onSelect, onBack, onHome }: BrowseMenuProps) {
  return (
    <div className="min-h-screen bg-background p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          {canGoBack && (
            <Button variant="outline" size="lg" onClick={onBack}>
              <ChevronLeft className="w-6 h-6 mr-2" />
              Назад
            </Button>
          )}
          <Button variant="outline" size="lg" onClick={onHome}>
            <Home className="w-6 h-6 mr-2" />
            Главная
          </Button>
        </div>
        <h1 className="text-3xl font-bold">Выберите раздел</h1>
        <div className="w-32" /> {/* Spacer for centering */}
      </header>

      {/* Menu Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {items.map((item) => {
          const Icon = iconMap[item.contentType] || FileText

          return (
            <Card
              key={item.id}
              className="cursor-pointer transition-all hover:scale-105 hover:shadow-lg active:scale-95"
              onClick={() => onSelect(item)}
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-muted relative overflow-hidden rounded-t-lg">
                {item.thumbnail?.url ? (
                  <img
                    src={item.thumbnail.url}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon className="w-16 h-16 text-muted-foreground" />
                  </div>
                )}

                {/* Content type badge */}
                <div className="absolute top-2 right-2 bg-black/60 text-white px-2 py-1 rounded text-sm">
                  {item.contentType === 'video' && 'Видео'}
                  {item.contentType === 'article' && 'Статья'}
                  {item.contentType === 'showcase' && 'Галерея'}
                  {item.contentType === 'submenu' && 'Раздел'}
                </div>
              </div>

              <CardContent className="p-4">
                <h2 className="text-xl font-semibold mb-2 line-clamp-2">{item.title}</h2>
                {item.description && (
                  <p className="text-muted-foreground line-clamp-2">{item.description}</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center text-muted-foreground py-16">
          <p className="text-xl">Нет доступного контента</p>
        </div>
      )}
    </div>
  )
}
