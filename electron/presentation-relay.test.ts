import { describe, it, expect, vi } from 'vitest'
import { createPresentationRelay } from './presentation-relay'

function makeIpc() {
  const handlers: Record<string, (e: unknown, ...a: unknown[]) => void> = {}
  return {
    on: (channel: string, cb: (e: unknown, ...a: unknown[]) => void) => { handlers[channel] = cb },
    emit: (channel: string, ...args: unknown[]) => handlers[channel]?.({}, ...args),
  }
}

describe('createPresentationRelay', () => {
  it('forwards an incoming update to the current secondary webContents', () => {
    const ipc = makeIpc()
    const send = vi.fn()
    const relay = createPresentationRelay({ ipcMain: ipc, getSecondary: () => ({ send }) })
    ipc.emit('presentation:update', { kind: 'idle', placeholder: { packageName: 'P' } })
    expect(send).toHaveBeenCalledWith('presentation:update', { kind: 'idle', placeholder: { packageName: 'P' } })
    relay.dispose()
  })

  it('does not throw when there is no secondary window', () => {
    const ipc = makeIpc()
    const relay = createPresentationRelay({ ipcMain: ipc, getSecondary: () => null })
    expect(() => ipc.emit('presentation:update', { kind: 'idle', placeholder: { packageName: 'P' } })).not.toThrow()
    relay.dispose()
  })

  it('replays the cached last payload when a secondary registers', () => {
    const ipc = makeIpc()
    let secondary: { send: (channel: string, payload: unknown) => void } | null = null
    const relay = createPresentationRelay({ ipcMain: ipc, getSecondary: () => secondary })
    ipc.emit('presentation:update', { kind: 'media', content: { id: 'x' }, playback: 'playing', volume: 80, loop: true })
    const send = vi.fn()
    secondary = { send }
    relay.replayTo({ send })
    expect(send).toHaveBeenCalledWith('presentation:update',
      { kind: 'media', content: { id: 'x' }, playback: 'playing', volume: 80, loop: true })
    relay.dispose()
  })

  it('replayTo sends nothing when no payload has been seen yet', () => {
    const ipc = makeIpc()
    const relay = createPresentationRelay({ ipcMain: ipc, getSecondary: () => null })
    const send = vi.fn()
    relay.replayTo({ send })
    expect(send).not.toHaveBeenCalled()
    relay.dispose()
  })
})
