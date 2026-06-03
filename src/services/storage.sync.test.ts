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

describe('cacheContentPackage concurrency', () => {
  it('caches all items but never runs more than the concurrency limit at once', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const cached: string[] = []
    // Replace cacheMedia with a controllable async stub.
    ;(storageService as any).cacheMedia = vi.fn(async (m: any) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(r => setTimeout(r, 5))
      inFlight--
      cached.push(m.id)
      return '/c/' + m.id
    })
    ;(storageService as any).saveContentPackage = vi.fn(async () => {})
    ;(storageService as any).saveSyncState = vi.fn(async () => {})

    const items = Array.from({ length: 10 }, (_, i) => ({ id: 'm' + i, url: 'http://x/' + i, mimeType: 'image/jpeg' }))
    const pkg = { id: 'p', name: 'P', mode: 'browse' as const, playlist: { items, loopPlaylist: true } }

    await storageService.cacheContentPackage(pkg as any)

    expect(cached).toHaveLength(10)
    expect(maxInFlight).toBeLessThanOrEqual(4)
    expect(maxInFlight).toBeGreaterThan(1) // proves it actually parallelised
  })
})

describe('cacheContentPackage staleness guard', () => {
  it('skips the package + sync-state commit when shouldPersistAsActive() returns false', async () => {
    (storageService as any).cacheMedia = vi.fn(async (m: any) => '/c/' + m.id)
    const savePkg = vi.fn(async () => {})
    const saveSync = vi.fn(async () => {})
    ;(storageService as any).saveContentPackage = savePkg
    ;(storageService as any).saveSyncState = saveSync

    const pkg = { id: 'p', name: 'P', mode: 'browse' as const, playlist: { items: [{ id: 'm1', url: 'http://x/1', mimeType: 'image/jpeg' }], loopPlaylist: true } }

    await storageService.cacheContentPackage(pkg as any, undefined, { shouldPersistAsActive: () => false })

    expect((storageService as any).cacheMedia).toHaveBeenCalledTimes(1) // media still cached
    expect(savePkg).not.toHaveBeenCalled() // but not committed as active
    expect(saveSync).not.toHaveBeenCalled()
  })

  it('commits by default when no options are given', async () => {
    (storageService as any).cacheMedia = vi.fn(async (m: any) => '/c/' + m.id)
    const savePkg = vi.fn(async () => {})
    const saveSync = vi.fn(async () => {})
    ;(storageService as any).saveContentPackage = savePkg
    ;(storageService as any).saveSyncState = saveSync
    const pkg = { id: 'p', name: 'P', mode: 'browse' as const, playlist: { items: [], loopPlaylist: true } }

    await storageService.cacheContentPackage(pkg as any)

    expect(savePkg).toHaveBeenCalledTimes(1)
    expect(saveSync).toHaveBeenCalledTimes(1)
  })
})
