import { describe, it, expect, afterEach, vi } from 'vitest'
import { apiService } from '@/services/api'

const settings = {
  kioskId: 'k1', kioskSlug: 'kiosk-1', serverUrl: 'http://cms.local',
  mqttUrl: 'ws://localhost:9001', museumId: 'm1', mode: 'browse' as const,
}

function stubPackage(raw: Record<string, unknown>) {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(raw) } as Response))
}

afterEach(() => { vi.restoreAllMocks() })

// The CMS stores screensaver.title as a Lexical richText field (see
// TechDocs/architecture/Physical-Model-Payload.md). The Player renders titles
// as plain strings, so the api transform MUST flatten them — otherwise React
// throws "Objects are not valid as a React child" and the screen goes white.
describe('screensaver transform', () => {
  it('flattens a Lexical richText title to a plain string', async () => {
    apiService.init(settings)
    stubPackage({
      id: 'p', name: 'P', mode: 'browse', menuItems: [],
      screensaver: {
        enabled: true,
        title: { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Demo Museum' }] }] } },
        subtitle: { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Welcome' }] }] } },
      },
    })

    const pkg = await apiService.getContentPackage('p')
    expect(pkg.screensaver?.title).toBe('Demo Museum')
    expect(pkg.screensaver?.subtitle).toBe('Welcome')
  })

  it('passes a plain-string title through unchanged', async () => {
    apiService.init(settings)
    stubPackage({
      id: 'p', name: 'P', mode: 'browse', menuItems: [],
      screensaver: { enabled: true, title: 'Plain Title' },
    })

    const pkg = await apiService.getContentPackage('p')
    expect(pkg.screensaver?.title).toBe('Plain Title')
  })

  it('leaves an absent title undefined (no empty-string artifact)', async () => {
    apiService.init(settings)
    stubPackage({
      id: 'p', name: 'P', mode: 'browse', menuItems: [],
      screensaver: { enabled: true, media: [] },
    })

    const pkg = await apiService.getContentPackage('p')
    expect(pkg.screensaver?.title).toBeUndefined()
  })
})
