import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playerService } from '@/services/player'
import { mqttService } from '@/services/mqtt'
import type { ContentPackage } from '@/types'

vi.mock('@/services/mqtt', () => ({
  mqttService: { publishStatus: vi.fn() },
}))

const loopPkg: ContentPackage = {
  id: 'p', name: 'p', mode: 'loop',
  playlist: { items: [{ id: 'v1', url: 'u', mimeType: 'video/mp4', title: 'V1' }], loopPlaylist: true },
}

const lastStatus = () => {
  const calls = (mqttService.publishStatus as any).mock.calls
  return calls[calls.length - 1][0]
}

describe('status payload', () => {
  beforeEach(() => { (mqttService.publishStatus as any).mockClear() })

  it('always carries version, uptime, error:null when healthy', () => {
    playerService.init(loopPkg, 'loop')
    const s = lastStatus()
    expect(typeof s.version).toBe('string')
    expect(typeof s.uptime).toBe('number')
    expect(s.error).toBeNull()
  })

  it('omits navigation outside Browse', () => {
    playerService.init(loopPkg, 'loop')
    expect(lastStatus().navigation).toBeUndefined()
  })

  it('includes navigation in Browse after entering a submenu', () => {
    const browsePkg: ContentPackage = {
      id: 'b', name: 'b', mode: 'browse',
      menuItems: [
        { id: 'sec1', title: 'Section', contentType: 'submenu', submenuItems: [
          { id: 'obj1', title: 'Object', contentType: 'article', article: { id: 'a', title: 'A', content: {} } },
        ] },
      ],
    }
    playerService.init(browsePkg, 'browse')
    playerService.wake()
    playerService.selectMenuItem(browsePkg.menuItems![0])
    const nav = lastStatus().navigation
    expect(nav).toBeDefined()
    expect(nav.nodeId).toBe('sec1')
    expect(nav.path).toEqual(['sec1'])
  })

  it('emits triggerEnded exactly once after a triggered play completes', () => {
    playerService.init(loopPkg, 'loop')
    playerService.handleCommand({
      action: 'trigger_play',
      trigger: { mediaId: 'tv', mediaUrl: 'u', mediaMimeType: 'video/mp4', mediaTitle: 'T' },
    })
    ;(mqttService.publishStatus as any).mockClear()
    playerService.onMediaEnded()
    expect(lastStatus().triggerEnded).toBe(true)
    // next publish no longer flags it
    ;(mqttService.publishStatus as any).mockClear()
    playerService.setVolume(50)
    expect(lastStatus().triggerEnded).toBeFalsy()
  })

  it('error state surfaces KioskError', () => {
    playerService.setError('INDEXEDDB_OPEN_FAILED_PERMANENT', 'gone')
    const s = lastStatus()
    expect(s.state).toBe('error')
    expect(s.error.code).toBe('INDEXEDDB_OPEN_FAILED_PERMANENT')
  })
})
