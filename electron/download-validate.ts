/**
 * Decide whether a finished media download is intact. A file must be non-empty;
 * when the server advertised a Content-Length (`totalSize > 0`) the on-disk size
 * must match it exactly. An unknown total (0) only requires a non-empty file.
 * Pure — no Electron/fs dependency — so it is unit-testable.
 */
export function isDownloadComplete(args: { totalSize: number; actualSize: number }): boolean {
  if (args.actualSize <= 0) return false
  if (args.totalSize > 0 && args.actualSize !== args.totalSize) return false
  return true
}
