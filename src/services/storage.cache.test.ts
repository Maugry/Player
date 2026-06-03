import { describe, it, expect } from 'vitest'
import { isCachedCopyStale } from '@/services/storage'

describe('isCachedCopyStale — cache-skip decision', () => {
  it('uses checksum when both sides have one: match => fresh', () => {
    expect(isCachedCopyStale({ checksum: 'abc' }, { size: 10, checksum: 'abc' })).toBe(false)
  })

  it('uses checksum when both sides have one: mismatch => stale', () => {
    expect(isCachedCopyStale({ checksum: 'abc' }, { size: 10, checksum: 'def' })).toBe(true)
  })

  it('falls back to size-match when no usable checksum: equal size => fresh', () => {
    expect(isCachedCopyStale({ size: 2048 }, { size: 2048 })).toBe(false)
  })

  it('falls back to size-match when no usable checksum: differing size => stale', () => {
    expect(isCachedCopyStale({ size: 2048 }, { size: 4096 })).toBe(true)
  })

  it('uses size-match when checksum is present on only one side', () => {
    expect(isCachedCopyStale({ checksum: 'abc', size: 100 }, { size: 200 })).toBe(true)
    expect(isCachedCopyStale({ size: 100 }, { size: 100, checksum: 'abc' })).toBe(false)
  })

  it('treats existence as sufficient when neither checksum nor size is known', () => {
    expect(isCachedCopyStale({}, { size: null })).toBe(false)
    expect(isCachedCopyStale({ size: 0 }, { size: null })).toBe(false)
  })

  it('cannot detect staleness when the local size is unavailable', () => {
    expect(isCachedCopyStale({ size: 2048 }, { size: null })).toBe(false)
  })
})
