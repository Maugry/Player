/**
 * Supervisor emulation — lets the all-in-one reference Player demonstrate
 * two-tier liveness (STANDARD §Supervisor topics) without a separate Sentinel.
 * In production this file is deleted and a real Sentinel owns these topics.
 */
import { APP_VERSION } from '@/version'
import { mqttService } from './mqtt'
import type { KioskSettings } from '@/types'

export interface SystemHeartbeat {
  kioskId: string
  timestamp: string
  version: string
  uptime: number
  player: {
    status: 'running' | 'stopped' | 'updating' | 'unresponsive' | 'restarting'
    pid: number
    lastHeartbeat: string
    restartCount: number
    lastCrash: string | null
    crashedVersion: string | null
  }
  system: { cpuPercent: number; memoryPercent: number; networkConnected: boolean }
}

export function buildSystemHeartbeat(kioskId: string, startTime: number, networkConnected: boolean): SystemHeartbeat {
  const now = new Date().toISOString()
  return {
    kioskId, timestamp: now, version: APP_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    player: {
      status: 'running',
      pid: typeof process !== 'undefined' ? process.pid : 0,
      lastHeartbeat: now, restartCount: 0, lastCrash: null, crashedVersion: null,
    },
    // Reference build reports 0 for cpu/mem; a real Sentinel measures these.
    system: { cpuPercent: 0, memoryPercent: 0, networkConnected },
  }
}

export function buildGracefulOffline(kioskId: string) {
  return { kioskId, timestamp: new Date().toISOString(), status: 'offline' as const, graceful: true as const }
}

export function buildLwt(kioskId: string, connectedAt: string) {
  return { kioskId, status: 'offline' as const, connectedAt }
}

const HEARTBEAT_MS = 10000

class SupervisorService {
  private settings: KioskSettings | null = null
  private startTime = Date.now()
  private interval: ReturnType<typeof setInterval> | null = null

  start(settings: KioskSettings): void {
    this.settings = settings
    this.publish()
    this.interval = setInterval(() => this.publish(), HEARTBEAT_MS)
  }
  private publish(): void {
    if (!this.settings) return
    mqttService.publishSystemHeartbeat(
      buildSystemHeartbeat(this.settings.kioskId, this.startTime, mqttService.isConnected),
    )
  }
  shutdown(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null }
    if (this.settings) mqttService.publishGracefulOffline(buildGracefulOffline(this.settings.kioskId))
  }
}

export const supervisorService = new SupervisorService()
