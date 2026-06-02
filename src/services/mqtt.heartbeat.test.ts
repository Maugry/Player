import { describe, it, expect } from 'vitest'
import { buildHeartbeat } from '@/services/mqtt'

describe('buildHeartbeat', () => {
  it('has no diskFreeGB and carries version/uptime', () => {
    const hb = buildHeartbeat('kiosk-1', 0)
    expect(hb).not.toHaveProperty('diskFreeGB')
    expect(hb.kioskId).toBe('kiosk-1')
    expect(typeof hb.version).toBe('string')
    expect(typeof hb.uptime).toBe('number')
  })
})
