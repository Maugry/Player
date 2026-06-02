/**
 * MQTT Service
 * Handles communication with MQTT broker for commands and status updates
 *
 * Topic structure (aligned with Kiosk-Architecture.md):
 * - Commands: umka/kiosks/{slug}/commands/{type}
 * - Status: umka/kiosks/{slug}/status
 * - Heartbeat: umka/kiosks/{slug}/heartbeat
 */

import mqtt, { MqttClient, IClientOptions } from 'mqtt'
import type { KioskCommand, KioskStatus, KioskHeartbeat, KioskSettings } from '@/types'

type CommandHandler = (command: KioskCommand) => void

/**
 * Pure parser: maps a command topic leaf + raw payload to a KioskCommand,
 * or null if the payload does not match the leaf's expected shape (STANDARD
 * §Command topics). Callers MUST ignore null.
 */
export function parseCommand(leaf: string, raw: string): KioskCommand | null {
  switch (leaf) {
    case 'volume': {
      const n = Number(raw.trim())
      if (!Number.isFinite(n)) return null
      return { action: 'volume', value: Math.max(0, Math.min(100, Math.round(n))) }
    }
    case 'locale': {
      let v = raw.trim()
      try { const j = JSON.parse(raw); if (typeof j === 'string') v = j } catch { /* unquoted */ }
      return v ? { action: 'locale', value: v } : null
    }
    case 'loop': {
      const t = raw.trim()
      if (t !== 'true' && t !== 'false') return null
      return { action: 'loop', value: t === 'true' }
    }
    case 'power': {
      const p = raw.trim().replace(/^"|"$/g, '')
      if (p === 'off' || p === 'shutdown') return { action: 'power_off' }
      if (p === 'reboot') return { action: 'reboot' }
      return null
    }
    case 'playback': {
      let d: any
      try { d = JSON.parse(raw) } catch { return null }
      if (!d || typeof d !== 'object') return null
      switch (d.action) {
        case 'play': return { action: 'play', value: d.mediaId }
        case 'content': return { action: 'content', value: d.contentId }
        case 'seek': return { action: 'seek', value: d.value }
        case 'pause': case 'stop': case 'next': case 'prev': case 'home': case 'screensaver':
          return { action: d.action }
        case 'trigger_play':
          if (!d.mediaId || !d.mediaUrl) return null
          return {
            action: 'trigger_play',
            trigger: {
              mediaId: d.mediaId, mediaUrl: d.mediaUrl,
              mediaMimeType: d.mediaMimeType, mediaTitle: d.mediaTitle,
            },
          }
        default: return null
      }
    }
    case 'app': {
      let d: any
      try { d = JSON.parse(raw) } catch { return null } // bare-string => Supervisor's, ignore
      if (!d || typeof d !== 'object' || typeof d.action !== 'string') return null
      switch (d.action) {
        case 'sync': return { action: 'sync' }
        case 'quit': return { action: 'quit' }
        case 'restart': return { action: 'restart' }
        case 'mode': return { action: 'mode', value: d.value }
        default: return null
      }
    }
    default:
      return null
  }
}

class MqttService {
  private client: MqttClient | null = null
  private settings: KioskSettings | null = null
  private commandHandlers: Set<CommandHandler> = new Set()
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private startTime = Date.now()
  private reconnectAttempts = 0

  /**
   * Get the base topic for this kiosk
   */
  private getBaseTopic(): string {
    return `umka/kiosks/${this.settings?.kioskSlug}`
  }

  /**
   * Initialize and connect to MQTT broker
   */
  async connect(settings: KioskSettings): Promise<void> {
    this.settings = settings

    const options: IClientOptions = {
      clientId: `kiosk-${settings.kioskSlug}-${Date.now()}`,
      reconnectPeriod: 5000,
      connectTimeout: 3000,
      clean: true,
    }

    return new Promise((resolve, reject) => {
      console.log(`[MQTT] Connecting to ${settings.mqttUrl}...`)

      this.client = mqtt.connect(settings.mqttUrl, options)

      this.client.on('connect', () => {
        console.log('[MQTT] Connected')
        this.reconnectAttempts = 0
        this.subscribeToCommands()
        this.startHeartbeat()
        resolve()
      })

      this.client.on('error', (err) => {
        console.error('[MQTT] Error:', err.message)
        if (this.reconnectAttempts === 0) {
          reject(err)
        }
      })

      this.client.on('reconnect', () => {
        this.reconnectAttempts++
        console.log(`[MQTT] Reconnecting... (attempt ${this.reconnectAttempts})`)
      })

      this.client.on('offline', () => {
        console.warn('[MQTT] Offline')
      })

      this.client.on('message', this.handleMessage.bind(this))

      // Timeout for initial connection
      setTimeout(() => {
        if (!this.client?.connected) {
          reject(new Error('MQTT connection timeout'))
        }
      }, 5000)
    })
  }

  /**
   * Subscribe to command topics
   */
  private subscribeToCommands(): void {
    if (!this.client || !this.settings) return

    const baseTopic = this.getBaseTopic()

    // Subscribe to all command subtopics
    const commandTopics = [
      `${baseTopic}/commands/power`,
      `${baseTopic}/commands/app`,
      `${baseTopic}/commands/playback`,
      `${baseTopic}/commands/volume`,
      `${baseTopic}/commands/locale`,
      `${baseTopic}/commands/loop`,
    ]

    commandTopics.forEach(topic => {
      this.client?.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          console.error(`[MQTT] Subscribe error for ${topic}:`, err)
        } else {
          console.log(`[MQTT] Subscribed to ${topic}`)
        }
      })
    })
  }

  /**
   * Handle incoming MQTT messages
   */
  private handleMessage(topic: string, payload: Buffer): void {
    const parts = topic.split('/')
    // umka/kiosks/{slug}/commands/{leaf}
    if (parts.length < 5 || parts[3] !== 'commands') return
    const leaf = parts[4]
    const raw = payload.toString()
    const command = parseCommand(leaf, raw)
    if (!command) {
      console.warn(`[MQTT] Ignored payload on ${leaf}:`, raw)
      return
    }
    this.commandHandlers.forEach(handler => {
      try { handler(command) } catch (err) { console.error('[MQTT] Command handler error:', err) }
    })
  }

  /**
   * Register a command handler
   */
  onCommand(handler: CommandHandler): () => void {
    this.commandHandlers.add(handler)
    return () => this.commandHandlers.delete(handler)
  }

  /**
   * Publish kiosk status
   */
  publishStatus(status: Omit<KioskStatus, 'kioskId' | 'timestamp'>): void {
    if (!this.client?.connected || !this.settings) return

    const topic = `${this.getBaseTopic()}/status`
    const fullStatus: KioskStatus = {
      ...status,
      kioskId: this.settings.kioskId,
      timestamp: new Date().toISOString(),
    }

    this.client.publish(topic, JSON.stringify(fullStatus), { qos: 0, retain: true })
  }

  /**
   * Start heartbeat publishing
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    // Publish immediately
    this.publishHeartbeat()

    // Then every 10 seconds (as per architecture doc)
    this.heartbeatInterval = setInterval(() => {
      this.publishHeartbeat()
    }, 10000)
  }

  /**
   * Publish heartbeat
   */
  private publishHeartbeat(): void {
    if (!this.client?.connected || !this.settings) return

    const topic = `${this.getBaseTopic()}/heartbeat`
    const heartbeat: KioskHeartbeat = {
      kioskId: this.settings.kioskId,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    }

    this.client.publish(topic, JSON.stringify(heartbeat), { qos: 0 })
  }

  /**
   * Disconnect from broker
   */
  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    if (this.client) {
      this.client.end(true)
      this.client = null
    }

    this.commandHandlers.clear()
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.client?.connected ?? false
  }
}

// Singleton instance
export const mqttService = new MqttService()
