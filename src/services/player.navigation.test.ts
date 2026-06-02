import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playerService } from '@/services/player'
import type { ContentPackage } from '@/types'

vi.mock('@/services/mqtt', () => ({ mqttService: { publishStatus: vi.fn() } }))

const pkg: ContentPackage = {
  id: 'p', name: 'p', mode: 'browse',
  menuItems: [
    { id: 'sec1', title: 'Section', contentType: 'submenu', submenuItems: [
      { id: 'obj1', title: 'Object', contentType: 'article', article: { id: 'a', title: 'A', content: {} } },
    ] },
    { id: 'gal', title: 'Gallery', contentType: 'showcase', showcaseItems: [
      { id: 's1', title: 'S', image: { id: 'i', url: 'u', mimeType: 'image/jpg' } },
    ] },
  ],
}

describe('navigation tracking', () => {
  beforeEach(() => { playerService.init(pkg, 'browse'); playerService.wake() })

  it('root has null nodeId and empty path', () => {
    const n = playerService.getState().navigation
    expect(n.nodeId).toBeNull()
    expect(n.path).toEqual([])
  })

  it('entering a submenu pushes its id', () => {
    playerService.selectMenuItem(pkg.menuItems![0])
    const n = playerService.getState().navigation
    expect(n.nodeId).toBe('sec1')
    expect(n.path).toEqual(['sec1'])
  })

  it('selecting a leaf inside a section yields full path', () => {
    playerService.selectMenuItem(pkg.menuItems![0])
    playerService.selectMenuItem(pkg.menuItems![0].submenuItems![0])
    const n = playerService.getState().navigation
    expect(n.nodeId).toBe('obj1')
    expect(n.path).toEqual(['sec1', 'obj1'])
  })

  it('opening a showcase sets showcaseOpen', () => {
    playerService.selectMenuItem(pkg.menuItems![1])
    const n = playerService.getState().navigation
    expect(n.nodeId).toBe('gal')
    expect(n.showcaseOpen).toBe(true)
  })

  it('home resets navigation', () => {
    playerService.selectMenuItem(pkg.menuItems![0])
    playerService.goHome()
    const n = playerService.getState().navigation
    expect(n.nodeId).toBeNull()
    expect(n.path).toEqual([])
    expect(n.showcaseOpen).toBe(false)
  })

  it('goBack from a leaf returns to the section, then to root, in lockstep', () => {
    playerService.selectMenuItem(pkg.menuItems![0])
    playerService.selectMenuItem(pkg.menuItems![0].submenuItems![0])

    // First goBack: leave the leaf content, back to the section
    playerService.goBack()
    let s = playerService.getState()
    expect(s.navigation.nodeId).toBe('sec1')
    expect(s.navigation.path).toEqual(['sec1'])
    expect(s.sectionPath).toEqual(['sec1'])

    // Second goBack: back to root
    playerService.goBack()
    s = playerService.getState()
    expect(s.navigation.nodeId).toBeNull()
    expect(s.navigation.path).toEqual([])
    expect(s.sectionPath).toEqual([])
  })

  it('screensaverActive reflects screensaver state', () => {
    expect(playerService.getState().screensaverActive).toBe(false) // woke in beforeEach
    playerService.handleCommand({ action: 'screensaver' })
    expect(playerService.getState().screensaverActive).toBe(true)
  })
})
