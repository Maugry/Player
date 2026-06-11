// Relays panel→display presentation updates and caches the last payload so a
// late-starting secondary window can be brought up to date. Dependency-injected
// (ipcMain + a getter for the secondary's webContents) so it unit-tests without
// a live Electron environment.

export const PRESENTATION_CHANNEL = 'presentation:update'

interface WebContentsLike {
  send: (channel: string, payload: unknown) => void
}

interface RelayDeps {
  ipcMain: { on: (channel: string, listener: (event: unknown, payload: unknown) => void) => void }
  getSecondary: () => WebContentsLike | null
}

export interface PresentationRelay {
  /** Push the last cached payload to a specific webContents (e.g. on load). */
  replayTo: (wc: WebContentsLike) => void
  /** Stop relaying (best-effort; ipcMain has no off in the injected shape). */
  dispose: () => void
}

export function createPresentationRelay(deps: RelayDeps): PresentationRelay {
  let last: unknown = undefined
  let disposed = false

  const listener = (_event: unknown, payload: unknown) => {
    if (disposed) return
    last = payload
    deps.getSecondary()?.send(PRESENTATION_CHANNEL, payload)
  }
  deps.ipcMain.on(PRESENTATION_CHANNEL, listener)

  return {
    replayTo(wc: WebContentsLike) {
      if (last !== undefined) wc.send(PRESENTATION_CHANNEL, last)
    },
    dispose() { disposed = true },
  }
}
