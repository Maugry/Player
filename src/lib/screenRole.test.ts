import { describe, it, expect } from 'vitest'
import { parseRole } from './screenRole'

describe('parseRole', () => {
  it('returns null when no role param is present', () => {
    expect(parseRole('')).toBeNull()
    expect(parseRole('?foo=bar')).toBeNull()
  })

  it('parses role=panel', () => {
    expect(parseRole('?role=panel')).toBe('panel')
  })

  it('parses role=display', () => {
    expect(parseRole('?role=display')).toBe('display')
  })

  it('returns null for an unknown role value', () => {
    expect(parseRole('?role=banana')).toBeNull()
  })
})
