/**
 * Detail Page Screen
 * Renders a catalog item's detail content from the new CMS model: an optional
 * hero (showcaseVideo or thumbnail), the title + subtitle, then detailBlocks in
 * document order (image / text / video). Falls back to legacy showcaseItems,
 * and to a title-only "no content" state when an item is empty.
 */

import { Button } from '@/components/ui/button'
import { ArrowLeft, Home } from 'lucide-react'
import { useCachedMediaUrl } from '@/hooks/useCachedMediaUrl'
import { splitParagraphs } from '@/lib/text'
import type { MenuItem, MediaItem, DetailBlock } from '@/types'

interface DetailPageProps {
  item: MenuItem
  onBack: () => void
  onHome: () => void
}

function CachedImage({ media, alt, className }: { media?: MediaItem; alt?: string; className?: string }) {
  const url = useCachedMediaUrl(media)
  if (!url) return null
  return <img src={url} alt={alt ?? ''} className={className} />
}

function CachedVideo({ media, className, controls = true }: { media?: MediaItem; className?: string; controls?: boolean }) {
  const url = useCachedMediaUrl(media)
  if (!url) return null
  return (
    <video
      src={url}
      className={className}
      controls={controls}
      muted={!controls}
      autoPlay={!controls}
      loop={!controls}
      playsInline
    />
  )
}

function DetailBlockView({ block }: { block: DetailBlock }) {
  if (block.blockType === 'image-block') {
    return (
      <figure className="my-6">
        <CachedImage media={block.image} className="w-full rounded-lg object-contain" />
        {block.caption && (
          <figcaption className="mt-2 text-center text-muted-foreground">{block.caption}</figcaption>
        )}
      </figure>
    )
  }
  if (block.blockType === 'text-block') {
    return (
      <div className="my-6">
        {splitParagraphs(block.richText).map((p, i) => (
          <p key={i} className="mb-4 text-lg leading-relaxed whitespace-pre-line">{p}</p>
        ))}
      </div>
    )
  }
  // video-block
  return (
    <div className="my-6">
      <CachedVideo media={block.video} className="w-full rounded-lg" />
    </div>
  )
}

export function DetailPage({ item, onBack, onHome }: DetailPageProps) {
  const blocks = item.detailBlocks ?? []
  const hasHeroVideo = !!item.showcaseVideo
  const hasHeroImage = !hasHeroVideo && !!item.thumbnail
  const legacyShowcase = blocks.length === 0 ? (item.showcaseItems ?? []) : []
  const isEmpty = !hasHeroVideo && !hasHeroImage && blocks.length === 0 && legacyShowcase.length === 0

  return (
    <div className="min-h-screen overflow-y-auto bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-4 bg-background/90 p-4 backdrop-blur">
        <Button variant="outline" size="lg" onClick={onBack}>
          <ArrowLeft className="mr-2 h-6 w-6" />
          Назад
        </Button>
        <Button variant="outline" size="lg" onClick={onHome}>
          <Home className="mr-2 h-6 w-6" />
          Главная
        </Button>
      </header>

      <div className="mx-auto max-w-4xl px-8 pb-16">
        {/* Hero */}
        {hasHeroVideo && (
          <CachedVideo media={item.showcaseVideo} controls={false} className="mb-6 max-h-[60vh] w-full rounded-lg object-cover" />
        )}
        {hasHeroImage && (
          <CachedImage media={item.thumbnail} className="mb-6 max-h-[60vh] w-full rounded-lg object-cover" />
        )}

        {/* Title + subtitle */}
        {item.title && <h1 className="mb-2 text-4xl font-bold">{item.title}</h1>}
        {item.subtitle && <p className="mb-6 text-xl text-muted-foreground">{item.subtitle}</p>}

        {/* Detail blocks in order */}
        {blocks.map((block, i) => (
          <DetailBlockView key={i} block={block} />
        ))}

        {/* Legacy showcaseItems fallback */}
        {legacyShowcase.map(si => (
          <figure key={si.id} className="my-6">
            <CachedImage media={si.image} className="w-full rounded-lg object-contain" />
            {si.title && <figcaption className="mt-2 text-center text-lg font-semibold">{si.title}</figcaption>}
            {si.description && <p className="text-center text-muted-foreground">{si.description}</p>}
          </figure>
        ))}

        {/* Empty state */}
        {isEmpty && (
          <p className="py-16 text-center text-muted-foreground">Нет дополнительного контента</p>
        )}
      </div>
    </div>
  )
}
