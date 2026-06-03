import path from 'node:path'

export type RangeResolution =
  | { status: 200 }
  | { status: 206; start: number; end: number }
  | { status: 416 }

/**
 * Resolve an HTTP Range header against a known file size (RFC 7233 subset:
 * `bytes=start-end`, `bytes=start-`, `bytes=-suffix`). Returns a 200 directive
 * when no range is requested, a 206 directive with an inclusive [start,end]
 * byte window, or 416 when the range is malformed or unsatisfiable. Pure — no
 * fs/Electron — so it is unit-testable.
 */
export function resolveRange(rangeHeader: string | null, fileSize: number): RangeResolution {
  if (!rangeHeader) return { status: 200 }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!match) return { status: 416 }

  const startRaw = match[1] !== '' ? Number.parseInt(match[1], 10) : undefined
  const endRaw = match[2] !== '' ? Number.parseInt(match[2], 10) : undefined
  if (startRaw === undefined && endRaw === undefined) return { status: 416 }

  let start: number
  let end: number
  if (startRaw === undefined) {
    const suffix = Math.min(endRaw ?? 0, fileSize)
    start = Math.max(0, fileSize - suffix)
    end = fileSize - 1
  } else {
    start = startRaw
    end = endRaw ?? fileSize - 1
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= fileSize) {
    return { status: 416 }
  }
  end = Math.min(end, fileSize - 1)
  return { status: 206, start, end }
}

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
}

export function getMimeTypeFromFilePath(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}
