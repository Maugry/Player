import { describe, it, expect } from 'vitest'
import { isDownloadComplete } from '../../electron/download-validate'

describe('isDownloadComplete', () => {
  it('rejects an empty file', () => {
    expect(isDownloadComplete({ totalSize: 100, actualSize: 0 })).toBe(false)
  })
  it('rejects a size mismatch when total is known', () => {
    expect(isDownloadComplete({ totalSize: 100, actualSize: 80 })).toBe(false)
  })
  it('accepts an exact match', () => {
    expect(isDownloadComplete({ totalSize: 100, actualSize: 100 })).toBe(true)
  })
  it('accepts a non-empty file when total is unknown (0)', () => {
    expect(isDownloadComplete({ totalSize: 0, actualSize: 42 })).toBe(true)
  })
})
