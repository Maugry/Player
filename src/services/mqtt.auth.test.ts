import { describe, it, expect, vi, afterEach } from 'vitest'

// Capture the options passed to mqtt.connect.
const connectSpy = vi.fn<(url: string, opts: Record<string, unknown>) => unknown>(() => {
  const handlers: Record<string, (arg?: unknown) => void> = {}
  const client: any = {
    on: (ev: string, cb: (arg?: unknown) => void) => { handlers[ev] = cb; if (ev === 'connect') setTimeout(() => cb(), 0); return client },
    subscribe: vi.fn(), publish: vi.fn(), end: vi.fn(), connected: true,
  }
  return client
})
vi.mock('mqtt', () => ({
  default: { connect: (url: string, opts: Record<string, unknown>) => connectSpy(url, opts) },
  connect: (url: string, opts: Record<string, unknown>) => connectSpy(url, opts),
}))

import { mqttService } from '@/services/mqtt'

const base = { kioskId: 'k1', kioskSlug: 'kiosk-1', serverUrl: 'http://x', mqttUrl: 'ws://x:9001', museumId: 'm', mode: 'browse' as const }

afterEach(() => { connectSpy.mockClear(); mqttService.disconnect() })

describe('mqtt auth', () => {
  it('passes username/password when present', async () => {
    await mqttService.connect({ ...base, mqttUsername: 'user', mqttPassword: 'pass' })
    const opts = connectSpy.mock.calls[0][1] as any
    expect(opts.username).toBe('user')
    expect(opts.password).toBe('pass')
  })
  it('passes undefined credentials when absent', async () => {
    await mqttService.connect({ ...base })
    const opts = connectSpy.mock.calls[0][1] as any
    expect(opts.username).toBeUndefined()
    expect(opts.password).toBeUndefined()
  })
})
