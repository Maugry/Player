import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiService } from '@/services/api'

const settings = {
  kioskId: 'k1', kioskSlug: 'kiosk-1', serverUrl: 'http://cms.local',
  mqttUrl: 'ws://localhost:9001', museumId: 'm1', mode: 'browse' as const,
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('api request timeout', () => {
  it('aborts a hung request after the timeout window', async () => {
    vi.useFakeTimers()
    apiService.init(settings)
    // fetch that rejects when its AbortSignal fires (mirrors real fetch).
    vi.stubGlobal('fetch', (_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')))
      }))

    const promise = apiService.getContentPackageBySlug('foo')
    // Attach the rejection handler before the abort fires so there is no
    // window where the rejection is unhandled.
    const assertion = expect(promise).rejects.toThrow(/abort/i)
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
  })

  it('clears the timer once headers arrive (no abort on a fast response)', async () => {
    vi.useFakeTimers()
    apiService.init(settings)
    const abort = vi.fn()
    vi.stubGlobal('fetch', (_url: string, opts: { signal: AbortSignal }) => {
      opts.signal.addEventListener('abort', abort)
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ docs: [{ id: '1', name: 'P', mode: 'browse' }] }),
      } as Response)
    })

    await apiService.getContentPackageBySlug('foo')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(abort).not.toHaveBeenCalled()
  })
})
