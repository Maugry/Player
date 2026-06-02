import { describe, it, expect } from 'vitest'
import { APP_VERSION } from '@/version'
import pkg from '../package.json'

describe('APP_VERSION', () => {
  it('is a semver string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
  it('matches package.json', () => {
    expect(APP_VERSION).toBe(pkg.version)
  })
})
