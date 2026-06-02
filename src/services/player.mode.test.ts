import { describe, it, expect, beforeEach, vi } from 'vitest'
import { playerService } from '@/services/player'
import type { ContentPackage } from '@/types'

vi.mock('@/services/mqtt', () => ({
  mqttService: { publishStatus: vi.fn() },
}))

const loopPkg: ContentPackage = {
  id: 'p', name: 'p', mode: 'loop',
  playlist: { items: [{ id: 'v1', url: 'u', mimeType: 'video/mp4' }], loopPlaylist: true },
}
const browsePkg: ContentPackage = {
  id: 'p', name: 'p', mode: 'browse',
  menuItems: [{ id: 'm1', title: 'A', contentType: 'video', video: { id: 'v1', url: 'u', mimeType: 'video/mp4' } }],
}

describe('mode collapse', () => {
  beforeEach(() => { /* fresh-ish: re-init resets state */ })

  it('loop: starts playing first playlist item', () => {
    playerService.init(loopPkg, 'loop')
    const s = playerService.getState()
    expect(s.mode).toBe('loop')
    expect(s.appState).toBe('content')
    expect(s.playbackState).toBe('playing')
    expect((s.currentContent as any)?.id).toBe('v1')
  })

  it('browse: starts on screensaver', () => {
    playerService.init(browsePkg, 'browse')
    const s = playerService.getState()
    expect(s.mode).toBe('browse')
    expect(s.appState).toBe('screensaver')
  })

  it('custom: minimal state, no crash', () => {
    playerService.init({ id: 'p', name: 'p', mode: 'custom' }, 'custom')
    expect(playerService.getState().mode).toBe('custom')
  })
})
