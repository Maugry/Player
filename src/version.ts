// Single source of the Player version, read from package.json at build time so it
// always matches the actual build (each electron-builder build stamps its own
// package.json version). Consumed by status, heartbeat, and system/heartbeat
// payloads — and, crucially, by the CMS update-completion logic, which matches the
// kiosk's reported version to the update target. A hardcoded constant made every
// build report the same stale version (0.2.0), so an update could never be marked
// completed and the version-drift indicator was always wrong (found in Windows e2e).
import pkg from '../package.json'

export const APP_VERSION: string = pkg.version
