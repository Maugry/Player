import { describe, it, expect, afterEach, vi } from 'vitest'
import { apiService } from '@/services/api'

const settings = {
  kioskId: 'k1', kioskSlug: 'kiosk-1', serverUrl: 'http://cms.local',
  mqttUrl: 'ws://localhost:9001', museumId: 'm1', mode: 'browse' as const,
}

// Stub fetch so getContentPackage('p') returns this raw CMS package object.
function stubPackage(raw: Record<string, unknown>) {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(raw) } as Response))
}

afterEach(() => { vi.restoreAllMocks() })

describe('detailBlocks / showcaseVideo / subtitle transform', () => {
  it('transforms the three block types in order and drops unknown blocks', async () => {
    apiService.init(settings)
    stubPackage({
      id: 'p', name: 'P', mode: 'browse',
      menuItems: [{
        id: 'm1', itemId: 'm1', contentType: 'showcase',
        title: { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hero' }] }] } },
        subtitle: { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Sub' }] }] } },
        showcaseVideo: { id: 'sv', url: '/api/media/file/hero.mp4', mimeType: 'video/mp4' },
        detailBlocks: [
          { blockType: 'image-block', image: { id: 'i1', url: '/api/media/file/a.jpg', mimeType: 'image/jpeg' }, caption: 'cap' },
          { blockType: 'text-block', richText: 'para one\n\npara two' },
          { blockType: 'video-block', video: { id: 'v1', url: '/api/media/file/b.mp4', mimeType: 'video/mp4' }, title: 't' },
          { blockType: 'future-block', whatever: true },
        ],
      }],
    })

    const pkg = await apiService.getContentPackage('p')
    const item = pkg.menuItems![0]
    expect(item.title).toBe('Hero')
    expect(item.subtitle).toBe('Sub')
    expect(item.showcaseVideo?.url).toBe('http://cms.local/api/media/file/hero.mp4')
    expect(item.detailBlocks).toHaveLength(3) // future-block dropped
    expect(item.detailBlocks![0]).toMatchObject({ blockType: 'image-block', caption: 'cap' })
    expect(item.detailBlocks![0].blockType === 'image-block' && item.detailBlocks![0].image?.url)
      .toBe('http://cms.local/api/media/file/a.jpg')
    expect(item.detailBlocks![1]).toEqual({ blockType: 'text-block', richText: 'para one\n\npara two' })
    expect(item.detailBlocks![2]).toMatchObject({ blockType: 'video-block', title: 't' })
  })

  it('leaves detailBlocks undefined when the CMS sends none', async () => {
    apiService.init(settings)
    stubPackage({ id: 'p', name: 'P', mode: 'browse',
      menuItems: [{ id: 'm1', itemId: 'm1', contentType: 'video',
        title: 'Plain', video: { id: 'v', url: '/api/media/file/v.mp4', mimeType: 'video/mp4' } }] })
    const item = (await apiService.getContentPackage('p')).menuItems![0]
    expect(item.detailBlocks).toBeUndefined()
    expect(item.showcaseVideo).toBeUndefined()
  })
})
