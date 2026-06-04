import { describe, it, expect, vi } from 'vitest'
import { storageService } from '@/services/storage'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn(() => true) } }))

describe('extractMediaFromPackage includes detail-page media', () => {
  it('collects showcaseVideo and the image/video media inside detailBlocks', () => {
    const pkg = {
      id: 'p', name: 'P', mode: 'browse' as const,
      menuItems: [{
        id: 'm1', title: 'X', contentType: 'showcase' as const,
        showcaseVideo: { id: 'sv', url: 'http://x/sv.mp4', mimeType: 'video/mp4' },
        detailBlocks: [
          { blockType: 'image-block' as const, image: { id: 'img1', url: 'http://x/a.jpg', mimeType: 'image/jpeg' } },
          { blockType: 'text-block' as const, richText: 'no media here' },
          { blockType: 'video-block' as const, video: { id: 'vid1', url: 'http://x/b.mp4', mimeType: 'video/mp4' } },
        ],
      }],
    }

    const media = (storageService as any).extractMediaFromPackage(pkg)
    const ids = media.map((m: any) => m.id)
    expect(ids).toEqual(expect.arrayContaining(['sv', 'img1', 'vid1']))
  })

  it('skips a detail block whose media is missing', () => {
    const pkg = {
      id: 'p', name: 'P', mode: 'browse' as const,
      menuItems: [{
        id: 'm1', title: 'X', contentType: 'showcase' as const,
        detailBlocks: [
          { blockType: 'image-block' as const },
          { blockType: 'video-block' as const },
        ],
      }],
    }
    const media = (storageService as any).extractMediaFromPackage(pkg)
    expect(media).toEqual([])
  })
})
