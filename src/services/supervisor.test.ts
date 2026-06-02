import { describe, it, expect } from 'vitest'
import { buildSystemHeartbeat, buildGracefulOffline, buildLwt } from '@/services/supervisor'

describe('supervisor payloads', () => {
  it('system heartbeat running shape', () => {
    const hb = buildSystemHeartbeat('kiosk-1', 0, true)
    expect(hb.kioskId).toBe('kiosk-1')
    expect(hb.player.status).toBe('running')
    expect(hb.system.networkConnected).toBe(true)
    expect(typeof hb.version).toBe('string')
  })
  it('graceful offline carries graceful:true', () => {
    const g = buildGracefulOffline('kiosk-1')
    expect(g).toMatchObject({ kioskId: 'kiosk-1', status: 'offline', graceful: true })
  })
  it('LWT omits graceful flag', () => {
    const w = buildLwt('kiosk-1', '2026-06-02T00:00:00Z')
    expect(w.status).toBe('offline')
    expect(w).not.toHaveProperty('graceful')
    expect(w.connectedAt).toBe('2026-06-02T00:00:00Z')
  })
})
