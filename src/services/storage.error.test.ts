import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playerService } from '@/services/player'
import { storageService } from '@/services/storage'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn() } }))

describe('storage permanent failure', () => {
  let originalIndexedDB: any

  beforeEach(() => {
    vi.restoreAllMocks()
    originalIndexedDB = (globalThis as any).indexedDB
  })

  afterEach(() => {
    ;(globalThis as any).indexedDB = originalIndexedDB
  })

  it('emits INDEXEDDB_OPEN_FAILED_PERMANENT via player.setError', async () => {
    const spy = vi.spyOn(playerService, 'setError')

    // Force indexedDB.open to always error (single attempt = permanent failure).
    ;(globalThis as any).indexedDB = {
      open: () => {
        const req: any = { error: new Error('open failed') }
        setTimeout(() => req.onerror?.(new Event('error')), 0)
        return req
      },
    }

    await storageService.init().catch(() => {})
    // setError is dispatched from a lazy dynamic import in the failure
    // branch; flush pending microtasks so that import resolves.
    await new Promise((r) => setTimeout(r, 0))
    await Promise.resolve()

    expect(spy).toHaveBeenCalledWith(
      'INDEXEDDB_OPEN_FAILED_PERMANENT',
      expect.any(String)
    )
  })
})
