import { describe, it, expect, beforeEach } from 'vitest'
import { applyTheme } from './theme'

const root = () => document.documentElement

beforeEach(() => {
  // Reset between tests
  root().className = ''
  root().removeAttribute('style')
  document.getElementById('kiosk-theme-custom')?.remove()
})

describe('applyTheme', () => {
  it('is a no-op for null/undefined (keeps defaults)', () => {
    expect(() => applyTheme(null)).not.toThrow()
    expect(() => applyTheme(undefined)).not.toThrow()
    expect(root().classList.contains('dark')).toBe(false)
  })

  it('toggles the dark baseline from appearance', () => {
    applyTheme({ appearance: 'dark' })
    expect(root().classList.contains('dark')).toBe(true)
    applyTheme({ appearance: 'light' })
    expect(root().classList.contains('dark')).toBe(false)
  })

  it('maps brand colours onto the matching CSS variables', () => {
    applyTheme({ colors: { primary: '#C9A227', cardForeground: '#FFF', border: '#2E2E35' } })
    expect(root().style.getPropertyValue('--primary')).toBe('#C9A227')
    expect(root().style.getPropertyValue('--card-foreground')).toBe('#FFF')
    expect(root().style.getPropertyValue('--border')).toBe('#2E2E35')
  })

  it('only overrides provided colours (omitted ones untouched)', () => {
    applyTheme({ colors: { primary: '#111111' } })
    expect(root().style.getPropertyValue('--primary')).toBe('#111111')
    expect(root().style.getPropertyValue('--accent')).toBe('')
  })

  it('sets the radius in rem', () => {
    applyTheme({ radius: 1.25 })
    expect(root().style.getPropertyValue('--radius')).toBe('1.25rem')
  })

  it('builds a brand gradient when both stops are present', () => {
    applyTheme({ gradient: { from: '#A', to: '#B', angle: 120 } })
    expect(root().style.getPropertyValue('--brand-gradient')).toBe('linear-gradient(120deg, #A, #B)')
  })

  it('skips the gradient when a stop is missing', () => {
    applyTheme({ gradient: { from: '#A' } })
    expect(root().style.getPropertyValue('--brand-gradient')).toBe('')
  })

  it('applies the font family to --font-sans and the root', () => {
    applyTheme({ fontFamily: "'Avenir Next Cyr', sans-serif" })
    expect(root().style.getPropertyValue('--font-sans')).toContain('Avenir')
    expect(root().style.fontFamily).toContain('Avenir')
  })

  it('resolves a relative background image against the server URL', () => {
    applyTheme({ backgroundImage: { url: '/api/media/file/bg.jpg' }, backgroundFit: 'cover' }, 'http://cms.local')
    expect(root().style.getPropertyValue('--kiosk-bg-image')).toBe('url("http://cms.local/api/media/file/bg.jpg")')
    expect(root().style.getPropertyValue('--kiosk-bg-size')).toBe('cover')
  })

  it('keeps an absolute background image URL as-is', () => {
    applyTheme({ backgroundImage: { url: 'https://cdn.example/bg.jpg' } }, 'http://cms.local')
    expect(root().style.getPropertyValue('--kiosk-bg-image')).toBe('url("https://cdn.example/bg.jpg")')
  })

  it('builds an rgba overlay from colour + opacity', () => {
    applyTheme({ backgroundOverlay: { color: '#000000', opacity: 0.5 } })
    expect(root().style.getPropertyValue('--kiosk-bg-overlay')).toBe('rgba(0, 0, 0, 0.5)')
  })

  it('injects custom CSS once and replaces it on re-apply', () => {
    applyTheme({ customCss: ':root { --x: 1; }' })
    const el = document.getElementById('kiosk-theme-custom')
    expect(el?.textContent).toContain('--x: 1')
    applyTheme({ customCss: ':root { --y: 2; }' })
    expect(document.querySelectorAll('#kiosk-theme-custom').length).toBe(1)
    expect(document.getElementById('kiosk-theme-custom')?.textContent).toContain('--y: 2')
  })
})
