import { describe, it, expect, beforeEach, vi } from 'vitest'
import { playerService } from '@/services/player'
import type { ContentPackage } from '@/types'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn() } }))

const pkg: ContentPackage = {
  id: 'p', name: 'p', mode: 'browse',
  menuItems: [
    { id: 'showcase-empty', title: 'Showcase', contentType: 'showcase', showcaseItems: [] },
    { id: 'video-with-blocks', title: 'V+B', contentType: 'video',
      video: { id: 'v', url: 'u', mimeType: 'video/mp4' },
      detailBlocks: [{ blockType: 'text-block', richText: 'hi' }] },
    { id: 'video-plain', title: 'V', contentType: 'video',
      video: { id: 'v2', url: 'u2', mimeType: 'video/mp4' } },
  ],
}

describe('detail-page routing in selectMenuItem', () => {
  beforeEach(() => { playerService.init(pkg, 'browse'); playerService.wake() })

  it('a showcase item opens content (detail page), even when empty', () => {
    playerService.selectMenuItem(pkg.menuItems![0])
    const s = playerService.getState()
    expect(s.appState).toBe('content')
    expect(s.currentContent).toBe(pkg.menuItems![0])
  })

  it('a video item WITH detailBlocks opens content but does not auto-play', () => {
    playerService.selectMenuItem(pkg.menuItems![1])
    const s = playerService.getState()
    expect(s.appState).toBe('content')
    expect(s.playbackState).not.toBe('playing')
  })

  it('a plain video item (no detailBlocks) still auto-plays (regression)', () => {
    playerService.selectMenuItem(pkg.menuItems![2])
    const s = playerService.getState()
    expect(s.appState).toBe('content')
    expect(s.playbackState).toBe('playing')
  })
})
