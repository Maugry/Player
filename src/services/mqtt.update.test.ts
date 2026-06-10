import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

// Mirror mqtt.auth.test.ts harness: mock the mqtt module with a fake client.
// Expose the registered event handlers so the test can drive a `message` event,
// and a publish spy so the test can assert on the status forwarder.
const publish = vi.fn()
let handlers: Record<string, (arg?: unknown, arg2?: unknown) => void> = {}
const connectSpy = vi.fn<(url: string, opts: Record<string, unknown>) => unknown>(() => {
  handlers = {}
  const client: any = {
    on: (ev: string, cb: (arg?: unknown, arg2?: unknown) => void) => {
      handlers[ev] = cb
      if (ev === 'connect') setTimeout(() => cb(), 0)
      return client
    },
    subscribe: vi.fn(),
    publish,
    end: vi.fn(),
    connected: true,
  }
  return client
})
vi.mock('mqtt', () => ({
  default: { connect: (url: string, opts: Record<string, unknown>) => connectSpy(url, opts) },
  connect: (url: string, opts: Record<string, unknown>) => connectSpy(url, opts),
}))

import { mqttService } from '@/services/mqtt'

const base = { kioskId: 'k1', kioskSlug: 'kiosk-1', serverUrl: 'http://x', mqttUrl: 'ws://x:9001', museumId: 'm', mode: 'browse' as const }

const startUpdate = vi.fn()
const onUpdateStatus = vi.fn()
let updateStatusCb: ((s: unknown) => void) | null = null

beforeEach(() => {
  startUpdate.mockClear()
  onUpdateStatus.mockClear()
  publish.mockClear()
  updateStatusCb = null
  onUpdateStatus.mockImplementation((cb: (s: unknown) => void) => { updateStatusCb = cb; return () => {} })
  ;(globalThis as any).window = {
    electronAPI: { startUpdate, onUpdateStatus },
  }
})

afterEach(() => {
  connectSpy.mockClear()
  mqttService.disconnect()
  delete (globalThis as any).window
})

describe('mqtt commands/update', () => {
  it('forwards commands/update to electronAPI.startUpdate', async () => {
    await mqttService.connect({ ...base })
    handlers.message(
      'umka/kiosks/kiosk-1/commands/update',
      Buffer.from(JSON.stringify({ action: 'update', version: '1.4.0', feedUrl: 'x' })),
    )
    expect(startUpdate).toHaveBeenCalledWith({ action: 'update', version: '1.4.0', feedUrl: 'x' })
  })

  it('ignores malformed update payloads', async () => {
    await mqttService.connect({ ...base })
    handlers.message('umka/kiosks/kiosk-1/commands/update', Buffer.from('{not json'))
    expect(startUpdate).not.toHaveBeenCalled()
  })

  it('publishes update status to system/update-status', async () => {
    await mqttService.connect({ ...base })
    expect(updateStatusCb).toBeTypeOf('function')
    updateStatusCb!({ version: '1.4.0', phase: 'downloading', progressPercent: 42 })
    expect(publish).toHaveBeenCalledWith(
      'umka/kiosks/kiosk-1/system/update-status',
      JSON.stringify({ version: '1.4.0', phase: 'downloading', progressPercent: 42 }),
      { qos: 1 },
    )
  })

  it('registers the status forwarder only once across reconnects', async () => {
    await mqttService.connect({ ...base })
    // simulate a reconnect firing the connect handler again
    handlers.connect()
    handlers.connect()
    expect(onUpdateStatus).toHaveBeenCalledTimes(1)
  })
})
