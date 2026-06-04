import { describe, it, expect, beforeEach, vi } from 'vitest'
import { playerService } from '@/services/player'
import type { ContentPackage } from '@/types'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn() } }))

// A browse package whose article item carries no renderable payload: an
// article with no article body. (Showcase routing now opens a detail page
// unconditionally — see player.detail.test.ts — so only the article guard and
// the video regression remain here.)
const pkg: ContentPackage = {
  id: 'p', name: 'p', mode: 'browse',
  menuItems: [
    { id: 'empty-showcase', title: 'Empty Showcase', contentType: 'showcase', showcaseItems: [] },
    { id: 'empty-article', title: 'Empty Article', contentType: 'article' },
    { id: 'ok-video', title: 'Video', contentType: 'video', video: { id: 'v', url: 'u', mimeType: 'video/mp4' } },
  ],
}

describe('selecting items with no renderable content does not strand the UI', () => {
  beforeEach(() => { playerService.init(pkg, 'browse'); playerService.wake() })

  it('an article with no article body keeps the menu visible (no content state)', () => {
    playerService.selectMenuItem(pkg.menuItems![1])
    const s = playerService.getState()
    expect(s.appState).toBe('menu')
    expect(s.currentContent).toBeNull()
  })

  it('a video item with a real media still enters content state (regression guard)', () => {
    playerService.selectMenuItem(pkg.menuItems![2])
    const s = playerService.getState()
    expect(s.appState).toBe('content')
    expect(s.playbackState).toBe('playing')
  })
})
