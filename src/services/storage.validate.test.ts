import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { storageService } from '@/services/storage'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn(() => true) } }))

// Minimal fake IndexedDB holding one media-metadata record we can mutate.
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

describe('serve-time cache validation', () => {
  beforeEach(() => {
    (storageService as any).isElectron = true
    ;(window as any).electronAPI = {
      fileExists: vi.fn(async () => true),
      getFileSize: vi.fn(async () => 100),
    }
  })
  afterEach(() => { vi.restoreAllMocks(); delete (window as any).electronAPI })

  it('returns the cached path when on-disk size matches the recorded size', async () => {
    const db = fakeDbWith({ id: 'm1', originalUrl: 'u', localPath: '/c/m1.mp4', mimeType: 'video/mp4', size: 100, downloadedAt: 'x' })
    ;(storageService as any).db = db
    const url = await storageService.getMediaUrl({ id: 'm1', url: 'http://x/m1.mp4', mimeType: 'video/mp4' })
    expect(url).toBe('media-cache://local/m1.mp4')
    expect(db._store.has('m1')).toBe(true)
  })

  it('drops a corrupted cache entry (size mismatch) and falls back to the original URL', async () => {
    (window as any).electronAPI.getFileSize = vi.fn(async () => 80) // disk differs from recorded 100
    const db = fakeDbWith({ id: 'm1', originalUrl: 'u', localPath: '/c/m1.mp4', mimeType: 'video/mp4', size: 100, downloadedAt: 'x' })
    ;(storageService as any).db = db
    const url = await storageService.getMediaUrl({ id: 'm1', url: 'http://x/m1.mp4', mimeType: 'video/mp4' })
    expect(url).toBe('http://x/m1.mp4') // fell back to original
    expect(db._store.has('m1')).toBe(false) // bad entry deleted
  })

  it('keeps the entry on a transient stat failure when the file still exists', async () => {
    (window as any).electronAPI.getFileSize = vi.fn(async () => -1) // stat threw (transient)
    ;(window as any).electronAPI.fileExists = vi.fn(async () => true) // but file is present
    const db = fakeDbWith({ id: 'm1', originalUrl: 'u', localPath: '/c/m1.mp4', mimeType: 'video/mp4', size: 100, downloadedAt: 'x' })
    ;(storageService as any).db = db
    const url = await storageService.getMediaUrl({ id: 'm1', url: 'http://x/m1.mp4', mimeType: 'video/mp4' })
    expect(url).toBe('media-cache://local/m1.mp4') // still served from cache
    expect(db._store.has('m1')).toBe(true) // entry NOT evicted on a transient error
  })

  it('drops the entry when the file is confirmed absent', async () => {
    (window as any).electronAPI.getFileSize = vi.fn(async () => -1)
    ;(window as any).electronAPI.fileExists = vi.fn(async () => false) // confirmed gone
    const db = fakeDbWith({ id: 'm1', originalUrl: 'u', localPath: '/c/m1.mp4', mimeType: 'video/mp4', size: 100, downloadedAt: 'x' })
    ;(storageService as any).db = db
    const url = await storageService.getMediaUrl({ id: 'm1', url: 'http://x/m1.mp4', mimeType: 'video/mp4' })
    expect(url).toBe('http://x/m1.mp4') // fell back to original
    expect(db._store.has('m1')).toBe(false) // evicted
  })
})
