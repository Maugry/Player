/**
 * Configuration Service
 * Loads kiosk settings from settings.json or environment
 */

import type { KioskSettings } from '@/types'

// Default settings for development
const defaultSettings: KioskSettings = {
  kioskId: 'kiosk-dev',
  kioskSlug: 'kiosk-1-1', // Match seed data kiosk slug
  serverUrl: 'http://localhost:3001', // Payload CMS port
  mqttUrl: 'ws://localhost:9001', // MQTT WebSocket port (browsers can't use mqtt://)
  museumId: 'museum',
  mode: 'browse',
  display: {
    fullscreen: false,
    cursor: true,
  },
  debug: {
    showDevTools: true,
    logLevel: 'debug',
  },
}

let cachedSettings: KioskSettings | null = null

/**
 * Load settings from file or use defaults
 * In production, this would load from settings.json next to the executable
 */
export async function loadSettings(): Promise<KioskSettings> {
  if (cachedSettings) {
    return cachedSettings
  }

  try {
    // In Electron, we'd use IPC to load from main process
    // For now, check if window.electronAPI exists
    if (window.electronAPI?.loadSettings) {
      const fileSettings = await window.electronAPI.loadSettings()
      if (fileSettings) {
        const merged: KioskSettings = { ...defaultSettings, ...fileSettings }
        cachedSettings = merged
        return merged
      }
    }
  } catch (err) {
    console.warn('Failed to load settings from file, using defaults:', err)
  }

  // Use defaults for development
  cachedSettings = defaultSettings
  return cachedSettings
}

/**
 * Get cached settings (must call loadSettings first)
 */
export function getSettings(): KioskSettings {
  if (!cachedSettings) {
    throw new Error('Settings not loaded. Call loadSettings() first.')
  }
  return cachedSettings
}

/**
 * Update settings at runtime (for testing/debugging)
 */
export function updateSettings(partial: Partial<KioskSettings>): KioskSettings {
  if (!cachedSettings) {
    cachedSettings = defaultSettings
  }
  cachedSettings = { ...cachedSettings, ...partial }
  return cachedSettings
}

// Type augmentation moved to storage.ts to avoid duplication
