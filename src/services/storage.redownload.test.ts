import { describe, it, expect, vi, afterEach } from 'vitest'
import { storageService } from '@/services/storage'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn(() => true) } }))

function fakeDbWith(record: any) {
  const store = new Map<string, any>([[record.id, record]])
  return {
    transaction: () => ({
      objectStore: () => ({
        get: (id: string) => {
          const req: any = {}
          setTimeout(() => { req.result = store.get(id) || null; req.onsuccess?.() }, 0)
          return req
        },
        put: (val: any) => {
          const req: any = {}
          store.set(val.id, val)
          setTimeout(() => req.onsuccess?.(), 0)
          return req
        },
        delete: (id: string) => {
          const req: any = {}
          store.delete(id)
          setTimeout(() => req.onsuccess?.(), 0)
          return req
        },
      }),
    }),
    _store: store,
  }
}

describe('cacheMedia stale re-download', () => {
  afterEach(() => { vi.restoreAllMocks(); delete (window as any).electronAPI })

  it('forces a re-download (force=true) when the cached copy is stale (checksum changed)', async () => {
    const dl = vi.fn<(url: string, id: string, mimeType: string, onProgress: unknown, force: boolean) => Promise<string>>(async () => '/c/m1.mp4')
    ;(storageService as any).isElectron = true
    ;(storageService as any).db = fakeDbWith({ id: 'm1', originalUrl: 'u', localPath: '/c/m1.mp4', mimeType: 'video/mp4', size: 100, downloadedAt: 'x', checksum: 'old' })
    ;(window as any).electronAPI = { fileExists: vi.fn(async () => true), getFileSize: vi.fn(async () => 100), downloadMedia: dl }

    await storageService.cacheMedia({ id: 'm1', url: 'http://x/m1.mp4', mimeType: 'video/mp4', checksum: 'new' })

    expect(dl).toHaveBeenCalledTimes(1)
    expect(dl.mock.calls[0][4]).toBe(true) // force flag (5th arg)
  })

  it('does NOT re-download when the cached copy is fresh (checksum matches)', async () => {
    const dl = vi.fn<(url: string, id: string, mimeType: string, onProgress: unknown, force: boolean) => Promise<string>>(async () => '/c/m1.mp4')
    ;(storageService as any).isElectron = true
    ;(storageService as any).db = fakeDbWith({ id: 'm1', originalUrl: 'u', localPath: '/c/m1.mp4', mimeType: 'video/mp4', size: 100, downloadedAt: 'x', checksum: 'same' })
    ;(window as any).electronAPI = { fileExists: vi.fn(async () => true), getFileSize: vi.fn(async () => 100), downloadMedia: dl }

    await storageService.cacheMedia({ id: 'm1', url: 'http://x/m1.mp4', mimeType: 'video/mp4', checksum: 'same' })

    expect(dl).not.toHaveBeenCalled()
  })
})
