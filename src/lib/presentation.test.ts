import { describe, it, expect } from 'vitest'
import { derivePlaceholder } from './presentation'
import type { ContentPackage } from '@/types'

const base = (over: Partial<ContentPackage>): ContentPackage =>
  ({ id: 'p1', name: 'Demo Package', mode: 'browse', ...over }) as ContentPackage

describe('derivePlaceholder', () => {
  it('uses the screensaver block when present', () => {
    const pkg = base({
      screensaver: {
        media: [{ id: 'm1', url: 'http://x/ss.mp4', mimeType: 'video/mp4' }],
        title: 'Welcome',
        subtitle: 'Tap a card',
      },
    })
    const ph = derivePlaceholder(pkg)
    expect(ph.packageName).toBe('Demo Package')
    expect(ph.media?.id).toBe('m1')
    expect(ph.title).toBe('Welcome')
    expect(ph.subtitle).toBe('Tap a card')
  })

  it('falls back to the first showcase image and package name when no screensaver', () => {
    const pkg = base({
      showcaseItems: [
        { id: 's1', title: 'First', image: { id: 'img1', url: 'http://x/1.jpg', mimeType: 'image/jpeg' } },
      ],
    })
    const ph = derivePlaceholder(pkg)
    expect(ph.media?.id).toBe('img1')
    expect(ph.title).toBe('Demo Package')
    expect(ph.subtitle).toBeUndefined()
  })

  it('falls back to the first menu-item thumbnail when no screensaver or showcase', () => {
    const pkg = base({
      menuItems: [
        { id: 'mi1', title: 'Card', contentType: 'video',
          thumbnail: { id: 'th1', url: 'http://x/t.jpg', mimeType: 'image/jpeg' } } as never,
      ],
    })
    const ph = derivePlaceholder(pkg)
    expect(ph.media?.id).toBe('th1')
  })

  it('returns title-only placeholder when the package has no media at all', () => {
    const ph = derivePlaceholder(base({}))
    expect(ph.packageName).toBe('Demo Package')
    expect(ph.media).toBeUndefined()
    expect(ph.title).toBe('Demo Package')
  })

  it('returns a safe placeholder for a null package', () => {
    const ph = derivePlaceholder(null)
    expect(ph.packageName).toBe('')
    expect(ph.media).toBeUndefined()
  })
})

import { derivePresentation } from './presentation'
import type { PlayerState } from '@/services/player'

const pkg = ({ id: 'p1', name: 'Demo', mode: 'browse' }) as ContentPackage

const state = (over: Partial<PlayerState>): PlayerState =>
  ({
    appState: 'menu', mode: 'browse', playbackState: 'idle', volume: 80,
    looping: true, currentContent: null, triggeredPlayActive: false,
    ...over,
  }) as PlayerState

describe('derivePresentation', () => {
  it('is idle when not in content state', () => {
    const p = derivePresentation(state({ appState: 'menu' }), pkg)
    expect(p.kind).toBe('idle')
  })

  it('is idle when content state but no current content', () => {
    const p = derivePresentation(state({ appState: 'content', currentContent: null }), pkg)
    expect(p.kind).toBe('idle')
  })

  it('produces media for a selected leaf, propagating playback/volume/loop', () => {
    const item = { id: 'mi1', title: 'Card', contentType: 'video',
      video: { id: 'v1', url: 'http://x/v.mp4', mimeType: 'video/mp4' } } as never
    const p = derivePresentation(
      state({ appState: 'content', currentContent: item, playbackState: 'playing', volume: 55, looping: false }),
      pkg,
    )
    expect(p.kind).toBe('media')
    if (p.kind === 'media') {
      expect((p.content as { id: string }).id).toBe('mi1')
      expect(p.playback).toBe('playing')
      expect(p.volume).toBe(55)
      expect(p.loop).toBe(false)
    }
  })

  it('maps non-playing playbackState to paused', () => {
    const item = { id: 'mi2', title: 'Card2', contentType: 'video' } as never
    const p = derivePresentation(state({ appState: 'content', currentContent: item, playbackState: 'paused' }), pkg)
    expect(p.kind === 'media' && p.playback).toBe('paused')
  })
})
