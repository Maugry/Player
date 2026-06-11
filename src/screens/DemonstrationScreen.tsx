// src/screens/DemonstrationScreen.tsx
import { useCachedMediaUrl } from '@/hooks/useCachedMediaUrl'
import { VideoPlayer } from './VideoPlayer'
import { DetailPage } from './DetailPage'
import { ArticleViewer } from './ArticleViewer'
import { Placeholder } from './Placeholder'
import type { PresentationState } from '@/lib/presentation'
import type { MediaItem, MenuItem } from '@/types'

const noop = () => {}

/**
 * The public demonstration display. Renders the selected item's media by
 * reusing the existing content screens, or the idle placeholder. Non-
 * interactive: navigation lives on the panel, so all callbacks are no-ops.
 */
export function DemonstrationScreen({ state }: { state: PresentationState }) {
  if (state.kind === 'idle') {
    return <Placeholder info={state.placeholder} />
  }

  const content = state.content

  // Raw MediaItem (loop playlist item / triggered play): play directly.
  const raw = content as MediaItem & { contentType?: unknown }
  if (raw.contentType === undefined && typeof raw.url === 'string' && raw.mimeType) {
    return <DemoVideo media={raw} playback={state.playback} volume={state.volume} loop={state.loop} />
  }

  const item = content as MenuItem
  if (item.contentType === 'showcase' || item.detailBlocks?.length) {
    return <DetailPage item={item} onBack={noop} onHome={noop} />
  }
  if (item.contentType === 'video' && item.video) {
    return <DemoVideo media={item.video} playback={state.playback} volume={state.volume} loop={state.loop} />
  }
  if (item.contentType === 'article') {
    return <ArticleViewer item={item} onBack={noop} onHome={noop} />
  }
  // Unknown contentType with no renderable media: fail safe to a blank package screen.
  return <Placeholder info={{ packageName: item.title ?? '', title: item.title }} />
}

function DemoVideo({ media, playback, volume, loop }:
  { media: MediaItem; playback: 'playing' | 'paused'; volume: number; loop: boolean }) {
  const resolved = useCachedMediaUrl(media)
  return (
    <VideoPlayer
      media={media}
      resolvedUrl={resolved || undefined}
      autoPlay
      loop={loop}
      volume={volume}
      isPlaying={playback === 'playing'}
      onPlay={noop}
      onPause={noop}
      onEnded={noop}
      onBack={noop}
      onVolumeChange={noop}
      showBackButton={false}
      showNextPrev={false}
    />
  )
}
