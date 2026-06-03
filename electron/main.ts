import { app, BrowserWindow, ipcMain, protocol, session } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import { Readable } from 'node:stream'
import log from 'electron-log/main'
import { isDownloadComplete } from './download-validate'
import { resolveRange, getMimeTypeFromFilePath } from './media-range'

log.initialize({ preload: true })
log.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Media cache directory
const MEDIA_CACHE_DIR = path.join(app.getPath('userData'), 'media-cache')

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Ensure media cache directory exists
function ensureMediaCacheDir(): void {
  if (!fs.existsSync(MEDIA_CACHE_DIR)) {
    fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true })
  }
}

function getFileInfo(filePath: string): { exists: boolean; size: number } {
  try {
    const stats = fs.statSync(filePath)
    return { exists: stats.isFile(), size: stats.isFile() ? stats.size : 0 }
  } catch {
    return { exists: false, size: 0 }
  }
}

function removeFileIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

// Get file extension from mime type
function getExtensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/ogg': '.ogv',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
  }
  return map[mimeType] || ''
}

// IPC Handlers for media caching

// Get the media cache path
ipcMain.handle('get-media-path', () => {
  ensureMediaCacheDir()
  return MEDIA_CACHE_DIR
})

// Check if a file exists
ipcMain.handle('file-exists', async (_event, filePath: string) => {
  return fs.existsSync(filePath)
})

// Size in bytes of a cached file, or -1 if it does not exist / cannot be read
ipcMain.handle('get-file-size', async (_event, filePath: string) => {
  try {
    return fs.statSync(filePath).size
  } catch {
    return -1
  }
})

// Download media file with progress
ipcMain.handle('download-media', async (event, url: string, id: string, mimeType: string) => {
  ensureMediaCacheDir()

  const ext = getExtensionFromMimeType(mimeType)
  const fileName = `${id}${ext}`
  const filePath = path.join(MEDIA_CACHE_DIR, fileName)

  // Reuse an existing non-empty file so a wiped-DB kiosk can restore metadata
  // and keep working offline. An empty leftover is removed before re-download.
  if (fs.existsSync(filePath)) {
    const info = getFileInfo(filePath)
    if (info.exists && info.size > 0) {
      log.info('[Main] Reusing existing cached media file:', filePath)
      return filePath
    }
    log.warn('[Main] Removing empty cached media before redownload:', filePath)
    removeFileIfExists(filePath)
  }

  return new Promise<string>((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    let settled = false
    let fileStream: fs.WriteStream | null = null

    const failDownload = (error: Error) => {
      if (settled) return
      settled = true
      if (fileStream && !fileStream.destroyed) fileStream.destroy()
      try {
        removeFileIfExists(filePath)
      } catch (cleanupError) {
        log.warn('[Main] Failed to remove partial media file:', cleanupError)
      }
      reject(error)
    }

    const request = proto.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          ipcMain.emit('download-media', event, redirectUrl, id, mimeType)
          return
        }
      }

      if (response.statusCode !== 200) {
        failDownload(new Error(`HTTP ${response.statusCode}`))
        return
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10)
      let downloadedSize = 0
      fileStream = fs.createWriteStream(filePath)

      response.on('data', (chunk) => {
        downloadedSize += chunk.length
        if (totalSize > 0) {
          const percent = Math.round((downloadedSize / totalSize) * 100)
          event.sender.send('download-progress', { id, percent })
        }
      })

      response.on('aborted', () => failDownload(new Error('Download aborted')))
      response.pipe(fileStream)

      fileStream.on('finish', () => {
        fileStream!.close((closeErr) => {
          if (closeErr) { failDownload(closeErr); return }
          const info = getFileInfo(filePath)
          if (!isDownloadComplete({ totalSize, actualSize: info.size })) {
            failDownload(new Error(
              `Downloaded file invalid: expected ${totalSize}, got ${info.size}`))
            return
          }
          if (settled) return
          settled = true
          resolve(filePath)
        })
      })

      fileStream.on('error', (err) => failDownload(err))
    })

    request.on('error', (err) => failDownload(err))
    request.setTimeout(30000, () => {
      request.destroy()
      failDownload(new Error('Download timeout'))
    })
  })
})

// Clear all cached media
ipcMain.handle('clear-media-cache', async () => {
  if (fs.existsSync(MEDIA_CACHE_DIR)) {
    const files = fs.readdirSync(MEDIA_CACHE_DIR)
    for (const file of files) {
      fs.unlinkSync(path.join(MEDIA_CACHE_DIR, file))
    }
  }
})

// Wipe the renderer's IndexedDB storage (cache-corruption recovery). Clearing
// it at the session level removes the on-disk database directory that a bare
// renderer-side deleteDatabase() cannot reach when the DB is wedged.
ipcMain.handle('wipe-database', async () => {
  await session.defaultSession.clearStorageData({ storages: ['indexdb'] })
})

// Get app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// Load settings from file (or return defaults)
// Priority: 1. Next to executable (portable), 2. userData directory, 3. null (use defaults)
ipcMain.handle('load-settings', async () => {
  // Portable mode: check for settings next to the executable
  const exeDir = path.dirname(app.getPath('exe'))
  const portableSettingsPath = path.join(exeDir, 'kiosk-settings.json')

  // Also check resources directory (for development/packaged app)
  const resourcesSettingsPath = path.join(process.resourcesPath || exeDir, 'kiosk-settings.json')

  // User data directory (traditional location)
  const userDataSettingsPath = path.join(app.getPath('userData'), 'kiosk-settings.json')

  // Try each location in order
  const settingsPaths = [
    portableSettingsPath,
    resourcesSettingsPath,
    userDataSettingsPath,
  ]

  for (const settingsPath of settingsPaths) {
    if (fs.existsSync(settingsPath)) {
      try {
        log.info('[Main] Loading settings from:', settingsPath)
        const data = fs.readFileSync(settingsPath, 'utf-8')
        return JSON.parse(data)
      } catch (err) {
        log.error('[Main] Failed to load settings from', settingsPath, err)
      }
    }
  }

  log.info('[Main] No settings file found, using defaults')
  // Return null to use defaults from renderer
  return null
})

// Power controls
ipcMain.handle('system-shutdown', async () => {
  log.info('[Main] Shutdown requested')
  const { exec } = await import('node:child_process')

  // Platform-specific shutdown command
  const isWindows = process.platform === 'win32'
  const command = isWindows ? 'shutdown /s /t 5' : 'sudo shutdown -h now'

  exec(command, (error) => {
    if (error) {
      log.error('[Main] Shutdown failed:', error)
    }
  })

  // Quit the app after initiating shutdown
  setTimeout(() => app.quit(), 1000)
})

ipcMain.handle('system-reboot', async () => {
  log.info('[Main] Reboot requested')
  const { exec } = await import('node:child_process')

  // Platform-specific reboot command
  const isWindows = process.platform === 'win32'
  const command = isWindows ? 'shutdown /r /t 5' : 'sudo reboot'

  exec(command, (error) => {
    if (error) {
      log.error('[Main] Reboot failed:', error)
    }
  })

  // Quit the app after initiating reboot
  setTimeout(() => app.quit(), 1000)
})

ipcMain.handle('quit-app', () => {
  log.info('[Main] App quit requested')
  app.quit()
})

// Register custom protocol for serving local media files
// Must be called before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media-cache',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,        // Enable video/audio streaming
      bypassCSP: true,     // Bypass Content Security Policy
    },
  },
])

app.whenReady().then(() => {
  // Register protocol handler for media-cache://
  // URL format: media-cache://local/filename.mp4
  protocol.handle('media-cache', async (request) => {
    const { host, pathname } = new URL(request.url)

    if (host === 'local') {
      const fileName = decodeURIComponent(pathname.substring(1)) // Remove leading /
      const filePath = path.join(MEDIA_CACHE_DIR, fileName)

      // Security: keep requests inside MEDIA_CACHE_DIR
      const relativePath = path.relative(MEDIA_CACHE_DIR, filePath)
      const isSafe = relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
      if (!isSafe) {
        log.error('[Protocol] Forbidden path:', filePath)
        return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } })
      }

      let fileSize = 0
      try {
        const stats = await fs.promises.stat(filePath)
        if (!stats.isFile()) throw new Error('NOT_A_FILE')
        fileSize = stats.size
      } catch {
        log.error('[Protocol] File not found:', filePath)
        return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } })
      }

      const mimeType = getMimeTypeFromFilePath(filePath)
      const range = resolveRange(request.headers.get('range'), fileSize)

      if (range.status === 416) {
        return new Response('Range Not Satisfiable', {
          status: 416,
          headers: { 'content-type': 'text/plain', 'accept-ranges': 'bytes', 'content-range': `bytes */${fileSize}` },
        })
      }

      if (range.status === 206) {
        const chunkSize = range.end - range.start + 1
        const stream = Readable.toWeb(fs.createReadStream(filePath, { start: range.start, end: range.end })) as ReadableStream
        return new Response(stream, {
          status: 206,
          headers: {
            'content-type': mimeType,
            'accept-ranges': 'bytes',
            'content-length': String(chunkSize),
            'content-range': `bytes ${range.start}-${range.end}/${fileSize}`,
          },
        })
      }

      const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': mimeType, 'accept-ranges': 'bytes', 'content-length': String(fileSize) },
      })
    }

    return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } })
  })

  createWindow()
})
