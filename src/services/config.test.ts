import { describe, it, expect, beforeEach, vi } from 'vitest'

// config.ts caches settings at module scope, so each test re-imports a fresh copy.
describe('loadSettings — kioskId derivation (#bug: defaulted to kiosk-dev)', () => {
  beforeEach(() => { vi.resetModules() })

  it('derives kioskId from kioskSlug when the settings file omits kioskId', async () => {
    vi.stubGlobal('window', {
      electronAPI: { loadSettings: async () => ({ kioskSlug: 'kiosk-2-3', serverUrl: 'http://x' }) },
    })
    const { loadSettings } = await import('./config')
    const s = await loadSettings()
    expect(s.kioskId).toBe('kiosk-2-3')
  })

  it('keeps an explicit kioskId from the file', async () => {
    vi.stubGlobal('window', {
      electronAPI: { loadSettings: async () => ({ kioskSlug: 'kiosk-2-3', kioskId: 'explicit-id' }) },
    })
    const { loadSettings } = await import('./config')
    const s = await loadSettings()
    expect(s.kioskId).toBe('explicit-id')
  })

  it('falls back to the dev default kioskId when there is no file at all', async () => {
    vi.stubGlobal('window', {})
    const { loadSettings } = await import('./config')
    const s = await loadSettings()
    expect(s.kioskId).toBe('kiosk-dev')
  })
})

describe('APP_VERSION (#bug: runtime reported stale 0.2.0)', () => {
  it('matches package.json version (single source of truth)', async () => {
    const { APP_VERSION } = await import('@/version')
    const pkg = (await import('../../package.json')).default as { version: string }
    expect(APP_VERSION).toBe(pkg.version)
  })
})
