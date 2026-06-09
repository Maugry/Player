import { describe, it, expect, afterEach, vi } from 'vitest'
import { apiService } from '@/services/api'

const settings = {
  kioskId: 'k1', kioskSlug: 'kiosk-1', serverUrl: 'http://cms.local',
  mqttUrl: 'ws://localhost:9001', museumId: 'm1', mode: 'browse' as const,
}

function stubPackage(raw: Record<string, unknown>) {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(raw) } as Response))
}

afterEach(() => { vi.restoreAllMocks() })

// The CMS `menuItem.video` field is `relationship hasMany` (Physical-Model-Payload.md),
// so the wire shape is an ARRAY of media. The Player renders a single <video>, so the
// transform must normalise the array to its first element. If it doesn't, video.id is
// undefined -> getCachedMedia(undefined) throws a DataError and the <video> src is empty
// (NotSupportedError). Both observed when clicking a `video` content item.
describe('menu item video (hasMany) transform', () => {
  it('normalises an array-shaped video to a single populated MediaItem', async () => {
    apiService.init(settings)
    stubPackage({
      id: 'p', name: 'P', mode: 'browse',
      menuItems: [{
        id: 'm1', itemId: 'm1', contentType: 'video', title: 'Clip',
        video: [{ id: 7, url: '/api/media/file/demo.mp4', mimeType: 'video/mp4', filename: 'demo.mp4' }],
      }],
    })

    const item = (await apiService.getContentPackage('p')).menuItems![0]
    expect(item.video?.id).toBe(7)
    expect(item.video?.url).toBe('http://cms.local/api/media/file/demo.mp4')
    expect(item.video?.mimeType).toBe('video/mp4')
  })

  it('still accepts a single-object video (defensive, non-array)', async () => {
    apiService.init(settings)
    stubPackage({
      id: 'p', name: 'P', mode: 'browse',
      menuItems: [{
        id: 'm1', itemId: 'm1', contentType: 'video', title: 'Clip',
        video: { id: 9, url: '/api/media/file/single.mp4', mimeType: 'video/mp4' },
      }],
    })

    const item = (await apiService.getContentPackage('p')).menuItems![0]
    expect(item.video?.id).toBe(9)
    expect(item.video?.url).toBe('http://cms.local/api/media/file/single.mp4')
  })

  it('leaves video undefined when the array is empty', async () => {
    apiService.init(settings)
    stubPackage({
      id: 'p', name: 'P', mode: 'browse',
      menuItems: [{ id: 'm1', itemId: 'm1', contentType: 'video', title: 'Clip', video: [] }],
    })

    const item = (await apiService.getContentPackage('p')).menuItems![0]
    expect(item.video).toBeUndefined()
  })
})
