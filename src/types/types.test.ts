import { describe, it, expectTypeOf } from 'vitest'
import type { KioskMode, KioskStatus, KioskError, KioskCommand, KioskHeartbeat } from '@/types'

describe('v1.26.5.1 types', () => {
  it('KioskMode is exactly the three wire modes', () => {
    expectTypeOf<KioskMode>().toEqualTypeOf<'loop' | 'browse' | 'custom'>()
  })
  it('KioskStatus requires version/uptime/error', () => {
    expectTypeOf<KioskStatus>().toHaveProperty('version').toEqualTypeOf<string>()
    expectTypeOf<KioskStatus>().toHaveProperty('uptime').toEqualTypeOf<number>()
    expectTypeOf<KioskStatus>().toHaveProperty('error').toEqualTypeOf<KioskError | null>()
  })
  it('KioskCommand includes new actions', () => {
    const a: KioskCommand['action'] = 'trigger_play'
    const b: KioskCommand['action'] = 'screensaver'
    const c: KioskCommand['action'] = 'seek'
    const d: KioskCommand['action'] = 'quit'
    expectTypeOf(a).toBeString()
    expectTypeOf(b).toBeString()
    expectTypeOf(c).toBeString()
    expectTypeOf(d).toBeString()
  })
  it('KioskHeartbeat has no diskFreeGB', () => {
    expectTypeOf<KioskHeartbeat>().not.toHaveProperty('diskFreeGB')
  })
})
