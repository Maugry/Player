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
 * DemonstrationApp. Framed in dev; frameless + fullscreen on its own monitor in
 * prod.
 *
 * IMPORTANT (Windows multi-monitor): Electron has no way to construct a window
 * fullscreen on a *specific* non-primary display — passing `fullscreen: true`
 * at construction tends to fullscreen on the PRIMARY monitor regardless of
 * x/y, landing the window on the wrong screen or showing black on the intended
 * one (electron/electron #30249, #12664). The reliable pattern is to position
 * the window on the target display FIRST, then call setFullScreen(true). We
 * also keep the window hidden until `ready-to-show` to avoid a black flash on
 * the public display, then position → fullscreen → show in that order. See
 * docs/research/2026-06-10-electron-dual-screen-kiosk.md.
 */
export function createSecondaryWindow(display: DisplayLike, opts: SecondaryWindowOpts): BrowserWindow {
  const win = new BrowserWindow({
    // Construct at the target display's coordinates but NOT fullscreen — the
    // fullscreen toggle happens after positioning (see note above).
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    show: false,                 // reveal on ready-to-show to avoid a black flash
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

  win.once('ready-to-show', () => {
    if (!opts.isDev) {
      // Position on the target display, THEN fullscreen — order matters on
      // Windows multi-monitor (see note above).
      win.setBounds(display.bounds)
      win.setFullScreen(true)
      win.setAlwaysOnTop(true, 'screen-saver')
    }
    win.show()
  })

  if (opts.devServerUrl) {
    void win.loadURL(`${opts.devServerUrl}?role=display`)
  } else {
    void win.loadFile(path.join(opts.rendererDist, 'index.html'), { search: 'role=display' })
  }

  return win
}
