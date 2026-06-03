import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playerService } from '@/services/player'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn(() => true) } }))

const browsePkg = {
  id: 'p', name: 'P', mode: 'browse' as const,
  menuItems: [{ id: 'a', title: 'A', contentType: 'video' as const, video: { id: 'v1', url: 'http://x/v.mp4', mimeType: 'video/mp4' } }],
}

describe('idle timer suppression during playback', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('does NOT go to screensaver while a video is actively playing', () => {
    playerService.init(browsePkg, 'browse')
    playerService.selectMenuItem(browsePkg.menuItems[0]) // -> content + playing
    vi.advanceTimersByTime(130000) // past the 2-min idle timeout
    expect(playerService.getState().appState).toBe('content')
  })

  it('DOES go to screensaver after returning to the menu and going idle', () => {
    playerService.init(browsePkg, 'browse')
    playerService.selectMenuItem(browsePkg.menuItems[0])
    playerService.onMediaEnded() // video ends -> back to menu, idle timer re-arms
    vi.advanceTimersByTime(130000)
    expect(playerService.getState().appState).toBe('screensaver')
  })
})
