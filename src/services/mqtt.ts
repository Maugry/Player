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
    try {
      const parts = topic.split('/')
      // Topic format: umka/kiosks/{slug}/commands/{type}
      if (parts.length < 5 || parts[3] !== 'commands') return

      const commandType = parts[4]
      const data = JSON.parse(payload.toString())

      console.log(`[MQTT] Received command [${commandType}]:`, data)

      // Convert to unified command format
      let command: KioskCommand

      switch (commandType) {
        case 'playback':
          // Playback commands: { action: "play" | "pause" | "stop" | "next" | "prev" | "home" | "content", mediaId?: string, contentId?: string }
          command = {
            action: data.action,
            value: data.mediaId || data.contentId,
          }
          break

        case 'volume':
          // Volume: number 0-100
          command = {
            action: 'volume',
            value: typeof data === 'number' ? data : parseInt(data, 10),
          }
          break

        case 'app':
          // App commands: { action: "sync" | "restart" | "mode", value?: string }
          if (data.action === 'mode') {
            command = { action: 'mode', value: data.value }
          } else if (data.action === 'sync') {
            command = { action: 'sync' as any }
          } else if (data.action === 'restart') {
            command = { action: 'restart' as any }
          } else {
            return
          }
          break

        case 'power':
          // Power: "off" | "reboot"
          const powerAction = typeof data === 'string' ? data : data.action
          if (powerAction === 'off') {
            command = { action: 'power_off' }
          } else if (powerAction === 'reboot') {
            command = { action: 'reboot' }
          } else {
            return
          }
          break

        case 'locale':
          command = { action: 'locale' as any, value: data }
          break

        case 'loop':
          // Loop toggle: boolean or toggle
          command = {
            action: 'loop',
            value: typeof data === 'boolean' ? data : data.value,
          }
          break

        default:
          console.warn(`[MQTT] Unknown command type: ${commandType}`)
          return
      }

      // Notify all handlers
      this.commandHandlers.forEach(handler => {
        try {
          handler(command)
        } catch (err) {
          console.error('[MQTT] Command handler error:', err)
        }
      })
    } catch (err) {
      console.error('[MQTT] Failed to parse message:', err)
    }
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
