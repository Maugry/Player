// Secondary ("display") demonstration window factory. Constructs a real
// BrowserWindow on a given physical display, loading the SAME renderer bundle
// with ?role=display so it renders DemonstrationApp. No unit test (it builds a
// real window); verified by tsc + build + manual. Mirrors the PROD window
// options used by createWindow() in main.ts (kiosk/fullscreen/frame/preload).

import { BrowserWindow } from 'electron'
import path from 'node:path'
import type { DisplayLike } from './displays'

interface SecondaryWindowOpts {
  isDev: boolean
  preloadPath: string          // same preload.mjs as the panel
  devServerUrl?: string        // VITE_DEV_SERVER_URL when in dev
  rendererDist: string         // RENDERER_DIST when in prod
}

/**
 * Create the demonstration ("display") window on a given physical display.
 * Loads the SAME renderer bundle with ?role=display so it renders
 * DemonstrationApp. Kiosk/fullscreen on its own monitor in prod; framed in dev.
 */
export function createSecondaryWindow(display: DisplayLike, opts: SecondaryWindowOpts): BrowserWindow {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    kiosk: !opts.isDev,
    fullscreen: !opts.isDev,
    frame: opts.isDev,
    alwaysOnTop: !opts.isDev,
    autoHideMenuBar: true,
    closable: opts.isDev,
    minimizable: opts.isDev,
    maximizable: opts.isDev,
    resizable: opts.isDev,
    movable: opts.isDev,
    skipTaskbar: !opts.isDev,
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: opts.isDev,
    },
  })

  if (opts.devServerUrl) {
    void win.loadURL(`${opts.devServerUrl}?role=display`)
  } else {
    void win.loadFile(path.join(opts.rendererDist, 'index.html'), { search: 'role=display' })
  }

  if (!opts.isDev) {
    win.setAlwaysOnTop(true, 'screen-saver')
  }
  return win
}
