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
import { topics, parseAppCommand, parseWirePayload } from '@umka/protocol'
import { APP_VERSION } from '@/version'
import type { KioskCommand, KioskStatus, KioskHeartbeat, KioskSettings } from '@/types'

type CommandHandler = (command: KioskCommand) => void

export function buildHeartbeat(kioskId: string, startTime: number): KioskHeartbeat {
  return {
    kioskId,
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  }
}

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
      let parsed: unknown
      try { parsed = JSON.parse(raw) } catch { return null }
      if (!parsed || typeof parsed !== 'object') return null
      const d = parsed as Record<string, unknown>
      switch (d.action) {
        case 'play': return { action: 'play', value: d.mediaId }
        case 'content': return { action: 'content', value: d.contentId }
        case 'seek': return { action: 'seek', value: d.value }
        case 'pause': case 'stop': case 'next': case 'prev': case 'home': case 'screensaver':
          return { action: d.action }
        case 'trigger_play': {
          const mediaId = d.mediaId
          const mediaUrl = d.mediaUrl
          if (typeof mediaId !== 'string' || typeof mediaUrl !== 'string') return null
          return {
            action: 'trigger_play',
            trigger: {
              mediaId, mediaUrl,
              mediaMimeType: typeof d.mediaMimeType === 'string' ? d.mediaMimeType : '',
              mediaTitle: typeof d.mediaTitle === 'string' ? d.mediaTitle : undefined,
            },
          }
        }
        default: return null
      }
    }
    case 'app': {
      // commands/app carries two consumers' payloads disambiguated by shape:
      // Player reads JSON {action}; Supervisor reads a bare string. Act only on
      // the Player branch (target === 'player'); ignore Supervisor commands.
      const r = parseAppCommand(raw)
      if (!r.ok || r.target !== 'player') return null
      switch (r.data.action) {
        case 'sync': return { action: 'sync' }
        case 'quit': return { action: 'quit' }
        case 'mode': return { action: 'mode', value: r.data.value }
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
  // Guard: the connect handler fires again on every reconnect, but the
  // onUpdateStatus forwarder must be registered with the main process only once.
  private updateForwarderRegistered = false

  /**
   * Get this kiosk's slug for topic builders.
   */
  private get slug(): string {
    return this.settings?.kioskSlug ?? ''
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
      username: settings.mqttUsername || undefined,
      password: settings.mqttPassword || undefined,
      // Supervisor-emulation LWT: on ungraceful disconnect the broker publishes
      // an `offline` status to the retained system/heartbeat topic (STANDARD
      // §Supervisor topics). A real Sentinel would own this.
      will: {
        topic: topics.systemHeartbeat(settings.kioskSlug),
        payload: JSON.stringify({
          kioskId: settings.kioskId, status: 'offline', connectedAt: new Date().toISOString(),
        }),
        qos: 1, retain: true,
      },
    }

    return new Promise((resolve, reject) => {
      console.log(`[MQTT] Connecting to ${settings.mqttUrl}...`)

      this.client = mqtt.connect(settings.mqttUrl, options)

      this.client.on('connect', () => {
        console.log('[MQTT] Connected')
        this.reconnectAttempts = 0
        this.subscribeToCommands()
        this.registerUpdateForwarder()
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

    const slug = this.slug

    // Subscribe to all command subtopics
    const commandTopics = [
      topics.commandsPower(slug),
      topics.commandsApp(slug),
      topics.commandsPlayback(slug),
      topics.commandsVolume(slug),
      topics.commandsLocale(slug),
      topics.commandsLoop(slug),
      topics.commandsUpdate(slug),
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
   * Register the main-process update-status forwarder exactly once. The main
   * process emits each electron-updater status; we republish it on MQTT
   * (system/update-status). The connect handler fires again on every reconnect,
   * so guard against re-registering the same IPC listener.
   */
  private registerUpdateForwarder(): void {
    if (this.updateForwarderRegistered) return
    if (typeof window === 'undefined' || !window.electronAPI?.onUpdateStatus) return
    this.updateForwarderRegistered = true
    window.electronAPI.onUpdateStatus((s) => {
      this.client?.publish(topics.systemUpdateStatus(this.slug), JSON.stringify(s), { qos: 1 })
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

    // commands/update is not a player action: hand it off to the main process,
    // where electron-updater + quitAndInstall live. Do not route it through the
    // player command handlers.
    if (leaf === 'update') {
      const r = parseWirePayload('updateCommand', raw)
      if (!r.ok) {
        console.warn(`[MQTT] Ignored malformed update payload:`, raw)
        return
      }
      window.electronAPI?.startUpdate?.(r.data)
      return
    }

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
  publishStatus(status: Omit<KioskStatus, 'kioskId' | 'timestamp'>): boolean {
    if (!this.client?.connected || !this.settings) return false
    const topic = topics.status(this.slug)
    const full: KioskStatus = {
      ...status,
      kioskId: this.settings.kioskId,
      timestamp: new Date().toISOString(),
    }
    this.client.publish(topic, JSON.stringify(full), { qos: 0, retain: true })
    return true
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
    const topic = topics.heartbeat(this.slug)
    this.client.publish(topic, JSON.stringify(buildHeartbeat(this.settings.kioskId, this.startTime)), { qos: 0 })
  }

  /**
   * Publish a system heartbeat (Supervisor emulation) to the retained
   * system/heartbeat topic. Reflects current liveness while alive.
   */
  publishSystemHeartbeat(payload: object): void {
    if (!this.client?.connected || !this.settings) return
    this.client.publish(topics.systemHeartbeat(this.slug), JSON.stringify(payload), { qos: 0, retain: true })
  }

  /**
   * Publish a graceful-offline status (Supervisor emulation) to the retained
   * system/heartbeat topic on clean shutdown.
   */
  publishGracefulOffline(payload: object): void {
    if (!this.client?.connected || !this.settings) return
    this.client.publish(topics.systemHeartbeat(this.slug), JSON.stringify(payload), { qos: 1, retain: true })
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
    this.updateForwarderRegistered = false
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
