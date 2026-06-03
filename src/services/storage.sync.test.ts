import { describe, it, expect, vi } from 'vitest'
import { storageService } from '@/services/storage'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn(() => true) } }))

describe('extractMediaFromPackage dedup', () => {
  it('returns each media id only once even if it appears in multiple places', () => {
    const shared = { id: 'shared', url: 'http://x/s.jpg', mimeType: 'image/jpeg' }
    const pkg = {
      id: 'p', name: 'P', mode: 'browse' as const,
      menuItems: [
        { id: 'a', title: 'A', contentType: 'video' as const, thumbnail: shared, video: { id: 'v1', url: 'http://x/v1.mp4', mimeType: 'video/mp4' } },
        { id: 'b', title: 'B', contentType: 'showcase' as const, showcaseItems: [{ id: 's1', title: 'S', image: shared }] },
      ],
    }
    const media = (storageService as any).extractMediaFromPackage(pkg)
    const ids = media.map((m: any) => m.id)
    expect(ids.filter((id: string) => id === 'shared')).toHaveLength(1)
    expect(ids).toContain('v1')
  })
})
