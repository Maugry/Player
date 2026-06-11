import { ipcRenderer, contextBridge } from 'electron'

// Progress callback registry for downloads
const progressCallbacks = new Map<string, (percent: number) => void>()

// Listen for download progress events
ipcRenderer.on('download-progress', (_event, data: { id: string; percent: number }) => {
  const callback = progressCallbacks.get(data.id)
  if (callback) {
    callback(data.percent)
  }
})

// Expose electron API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Load kiosk settings from file
  loadSettings: () => ipcRenderer.invoke('load-settings'),

  // Get app version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Get media cache directory path
  getMediaPath: () => ipcRenderer.invoke('get-media-path'),

  // Download media file with progress reporting
  downloadMedia: async (
    url: string,
    id: string,
    mimeType: string,
    onProgress?: (percent: number) => void,
    force?: boolean
  ): Promise<string> => {
    if (onProgress) {
      progressCallbacks.set(id, onProgress)
    }

    try {
      const result = await ipcRenderer.invoke('download-media', url, id, mimeType, force)
      return result
    } finally {
      progressCallbacks.delete(id)
    }
  },

  // Check if a file exists
  fileExists: (path: string) => ipcRenderer.invoke('file-exists', path),

  // Size in bytes of a cached file (-1 if missing)
  getFileSize: (path: string) => ipcRenderer.invoke('get-file-size', path),

  // Clear all cached media
  clearMediaCache: () => ipcRenderer.invoke('clear-media-cache'),

  // Wipe the IndexedDB storage directory (cache-corruption recovery)
  wipeDatabase: () => ipcRenderer.invoke('wipe-database'),

  // Power controls
  shutdown: () => ipcRenderer.invoke('system-shutdown'),
  reboot: () => ipcRenderer.invoke('system-reboot'),
  quitApp: () => ipcRenderer.invoke('quit-app'),

  // Software update (Epic C)
  startUpdate: (cmd: { action: string; version: string; feedUrl: string }) =>
    ipcRenderer.invoke('start-update', cmd),
  onUpdateStatus: (cb: (s: { version: string; phase: string; error?: string; progressPercent?: number }) => void) => {
    const listener = (_e: unknown, s: { version: string; phase: string; error?: string; progressPercent?: number }) => cb(s)
    ipcRenderer.on('update-status', listener)
    return () => ipcRenderer.off('update-status', listener)
  },
})

// Track the wrapper closures registered by on() so off() can remove the exact
// wrapper that was registered with Electron's ipcRenderer (EventEmitter matches
// listeners by reference). Keyed by the original listener, then by channel, so
// the same listener used on multiple channels is handled correctly.
type IpcListener = Parameters<typeof ipcRenderer.on>[1]
type IpcWrapper = (event: Parameters<IpcListener>[0], ...args: unknown[]) => void
const ipcWrappers = new WeakMap<IpcListener, Map<string, IpcWrapper>>()

// Also expose basic ipcRenderer for other uses
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    const wrapper: IpcWrapper = (event, ...rest) => listener(event, ...rest)
    let byChannel = ipcWrappers.get(listener)
    if (!byChannel) {
      byChannel = new Map<string, IpcWrapper>()
      ipcWrappers.set(listener, byChannel)
    }
    byChannel.set(channel, wrapper)
    return ipcRenderer.on(channel, wrapper)
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, listener] = args
    const byChannel = ipcWrappers.get(listener)
    const wrapper = byChannel?.get(channel)
    if (wrapper) {
      byChannel?.delete(channel)
      if (byChannel?.size === 0) {
        ipcWrappers.delete(listener)
      }
      ipcRenderer.off(channel, wrapper)
    }
    return ipcRenderer
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})
