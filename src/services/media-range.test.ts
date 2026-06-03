import { describe, it, expect } from 'vitest'
import { resolveRange, getMimeTypeFromFilePath } from '../../electron/media-range'

describe('resolveRange', () => {
  const SIZE = 1000
  it('returns full-content (200) when there is no range header', () => {
    expect(resolveRange(null, SIZE)).toEqual({ status: 200 })
  })
  it('parses a closed range', () => {
    expect(resolveRange('bytes=0-499', SIZE)).toEqual({ status: 206, start: 0, end: 499 })
  })
  it('parses an open-ended range to the last byte', () => {
    expect(resolveRange('bytes=500-', SIZE)).toEqual({ status: 206, start: 500, end: 999 })
  })
  it('parses a suffix range (last N bytes)', () => {
    expect(resolveRange('bytes=-200', SIZE)).toEqual({ status: 206, start: 800, end: 999 })
  })
  it('clamps an over-long end to the last byte', () => {
    expect(resolveRange('bytes=900-5000', SIZE)).toEqual({ status: 206, start: 900, end: 999 })
  })
  it('rejects a malformed range with 416', () => {
    expect(resolveRange('bytes=abc', SIZE)).toEqual({ status: 416 })
  })
  it('rejects a start beyond EOF with 416', () => {
    expect(resolveRange('bytes=2000-', SIZE)).toEqual({ status: 416 })
  })
})

describe('getMimeTypeFromFilePath', () => {
  it('maps known extensions', () => {
    expect(getMimeTypeFromFilePath('/c/x.mp4')).toBe('video/mp4')
    expect(getMimeTypeFromFilePath('/c/x.jpg')).toBe('image/jpeg')
  })
  it('falls back to octet-stream', () => {
    expect(getMimeTypeFromFilePath('/c/x.bin')).toBe('application/octet-stream')
  })
})
