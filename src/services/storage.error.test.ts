import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playerService } from '@/services/player'
import { storageService } from '@/services/storage'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn() } }))

/**
 * Build a fake `indexedDB` whose `open()` fails for the first `failTimes`
 * calls and succeeds afterwards. `deleteDatabase()` (the recovery wipe)
 * always succeeds. Tracks how many times `open` was called.
 */
function fakeIndexedDB(failTimes: number) {
  const state = { openCalls: 0, deleteCalls: 0 }
  const idb = {
    open: () => {
      state.openCalls++
      const shouldFail = state.openCalls <= failTimes
      const req: any = { error: shouldFail ? new Error('open failed') : null }
      setTimeout(() => {
        if (shouldFail) {
          req.onerror?.(new Event('error'))
        } else {
          req.result = { objectStoreNames: { contains: () => true } }
          req.onsuccess?.(new Event('success'))
        }
      }, 0)
      return req
    },
    deleteDatabase: () => {
      state.deleteCalls++
      const req: any = {}
      setTimeout(() => req.onsuccess?.(new Event('success')), 0)
      return req
    },
  }
  return { idb, state }
}

const flush = async () => {
  // The failure branch dispatches setError from a lazy dynamic import, and
  // recovery chains through async deleteDatabase + re-open. Drain timers and
  // microtasks a few times so the whole chain settles.
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await Promise.resolve()
  }
}

describe('storage open recovery', () => {
  let originalIndexedDB: any

  beforeEach(() => {
    vi.restoreAllMocks()
    originalIndexedDB = (globalThis as any).indexedDB
    ;(storageService as any).db = null
  })

  afterEach(() => {
    (globalThis as any).indexedDB = originalIndexedDB
  })

  it('recovers from a single transient open failure (wipe + retry) without surfacing an error', async () => {
    const spy = vi.spyOn(playerService, 'setError')
    const { idb, state } = fakeIndexedDB(1) // fail once, then succeed
    ;(globalThis as any).indexedDB = idb

    await storageService.init().catch(() => {})
    await flush()

    expect(state.openCalls).toBe(2) // initial + one retry after wipe
    expect(state.deleteCalls).toBe(1) // recovery wiped once
    expect(spy).not.toHaveBeenCalled() // no error surfaced
  })

  it('emits INDEXEDDB_OPEN_FAILED_PERMANENT only after the max attempts are exhausted', async () => {
    const spy = vi.spyOn(playerService, 'setError')
    const { idb, state } = fakeIndexedDB(Infinity) // always fail
    ;(globalThis as any).indexedDB = idb

    await storageService.init().catch(() => {})
    await flush()

    expect(state.openCalls).toBe(2) // MAX_OPEN_ATTEMPTS
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(
      'INDEXEDDB_OPEN_FAILED_PERMANENT',
      expect.any(String)
    )
  })
})
