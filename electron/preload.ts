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
    onProgress?: (percent: number) => void
  ): Promise<string> => {
    if (onProgress) {
      progressCallbacks.set(id, onProgress)
    }

    try {
      const result = await ipcRenderer.invoke('download-media', url, id, mimeType)
      return result
    } finally {
      progressCallbacks.delete(id)
    }
  },

  // Check if a file exists
  fileExists: (path: string) => ipcRenderer.invoke('file-exists', path),

  // Clear all cached media
  clearMediaCache: () => ipcRenderer.invoke('clear-media-cache'),

  // Power controls
  shutdown: () => ipcRenderer.invoke('system-shutdown'),
  reboot: () => ipcRenderer.invoke('system-reboot'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
})

// Also expose basic ipcRenderer for other uses
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
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
