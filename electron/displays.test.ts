import { describe, it, expect } from 'vitest'
import { resolveWindowPlan, type DisplayLike } from './displays'

const d = (id: number): DisplayLike => ({ id, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })

describe('resolveWindowPlan', () => {
  it('no secondary with a single display', () => {
    expect(resolveWindowPlan([d(1)], 1, { mode: 'browse' })).toEqual({ secondary: false })
  })

  it('no secondary when mode is not browse, even with two displays', () => {
    expect(resolveWindowPlan([d(1), d(2)], 1, { mode: 'loop' })).toEqual({ secondary: false })
  })

  it('spawns a secondary on the first non-primary display in browse + 2 displays', () => {
    const plan = resolveWindowPlan([d(1), d(2)], 1, { mode: 'browse' })
    expect(plan.secondary).toBe(true)
    if (plan.secondary) {
      expect(plan.panelDisplayId).toBe(1)
      expect(plan.secondaryDisplay.id).toBe(2)
    }
  })

  it('picks the non-primary display regardless of array order', () => {
    const plan = resolveWindowPlan([d(7), d(3)], 3, { mode: 'browse' })
    expect(plan.secondary && plan.secondaryDisplay.id).toBe(7)
  })
})
