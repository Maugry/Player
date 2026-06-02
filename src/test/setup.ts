// Global test setup. window.electronAPI is mocked per-test where needed.
import { vi } from 'vitest'

// Default no-op electronAPI so services that probe it don't throw.
;(globalThis as any).window = (globalThis as any).window ?? {}
;(window as any).electronAPI = {
  shutdown: vi.fn(),
  reboot: vi.fn(),
  quitApp: vi.fn(),
  getAppVersion: vi.fn().mockResolvedValue('0.2.0'),
}
