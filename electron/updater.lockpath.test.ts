import { describe, it, expect } from 'vitest'
import { resolveLockPath } from './updater'

describe('resolveLockPath', () => {
  it('joins the appData dir with umka/updating.lock', () => {
    expect(resolveLockPath('/home/u/.config')).toBe('/home/u/.config/umka/updating.lock')
  })
})
