import { autoUpdater } from 'electron-updater'
import log from 'electron-log/main'
import path from 'node:path'
import fs from 'node:fs'
import type { BrowserWindow } from 'electron'

export interface UpdateCommand { action: 'update' | 'rollback'; version: string; feedUrl: string }

/** The Sentinel-watched lock path (issue #3): a FIXED %APPDATA%/umka/updating.lock,
 *  independent of the per-install userData hash. Pure for testing. */
export function resolveLockPath(appDataDir: string): string {
  return path.join(appDataDir, 'umka', 'updating.lock')
}

let lockPath = ''
let pending: UpdateCommand | null = null

export function configureUpdater(win: BrowserWindow, appDataDir: string): void {
  lockPath = resolveLockPath(appDataDir)
  autoUpdater.logger = log
  autoUpdater.autoDownload = false          // we trigger explicitly on command
  autoUpdater.autoInstallOnAppQuit = false  // install happens via quitAndInstall

  const send = (s: { version: string; phase: string; error?: string; progressPercent?: number }) =>
    win.webContents.send('update-status', s)

  autoUpdater.on('checking-for-update', () => send({ version: pending?.version ?? '', phase: 'checking' }))
  autoUpdater.on('download-progress', (p) =>
    send({ version: pending?.version ?? '', phase: 'downloading', progressPercent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', () => {
    send({ version: pending?.version ?? '', phase: 'downloaded' })
    try { fs.mkdirSync(path.dirname(lockPath), { recursive: true }); fs.writeFileSync(lockPath, String(Date.now())) }
    catch (err) { log.error('[updater] write lock failed', err) }
    send({ version: pending?.version ?? '', phase: 'installing' })
    autoUpdater.quitAndInstall(true, true) // isSilent, forceRunAfter
  })
  autoUpdater.on('error', (err) =>
    send({ version: pending?.version ?? '', phase: 'failed', error: String(err?.message ?? err) }))
}

export async function startUpdate(cmd: UpdateCommand): Promise<void> {
  pending = cmd
  autoUpdater.allowDowngrade = cmd.action === 'rollback'
  autoUpdater.setFeedURL({ provider: 'generic', url: cmd.feedUrl })
  await autoUpdater.checkForUpdates()
  await autoUpdater.downloadUpdate()
}

/** Called on startup after an update completes: clear the lock so Sentinel resumes. */
export function clearUpdateLock(): void {
  try { if (lockPath && fs.existsSync(lockPath)) fs.unlinkSync(lockPath) } catch { /* ignore */ }
}
