/**
 * API Service
 * Fetches content from Payload CMS
 */

import type { KioskSettings, ContentPackage, MediaItem, Article } from '@/types'

class ApiService {
  private settings: KioskSettings | null = null
  private baseUrl: string = ''

  /**
   * Initialize with settings
   */
  init(settings: KioskSettings): void {
    this.settings = settings
    this.baseUrl = settings.serverUrl
  }

  /**
   * Make API request
   */
  private async request<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}/api${endpoint}`

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Get kiosk configuration from server
   */
  async getKioskConfig(): Promise<any> {
    if (!this.settings) throw new Error('API not initialized')

    const response = await this.request<{ docs: any[] }>(
      `/kiosks?where[slug][equals]=${this.settings.kioskSlug}&depth=2`
    )

    if (!response.docs || response.docs.length === 0) {
      throw new Error(`Kiosk not found: ${this.settings.kioskSlug}`)
    }

    return response.docs[0]
  }

  /**
   * Get content package by ID
   */
  async getContentPackage(id: string): Promise<ContentPackage> {
    const response = await this.request<any>(`/content-packages/${id}?depth=3`)

    // Transform CMS response to our ContentPackage type
    return this.transformContentPackage(response)
  }

  /**
   * Get content package by slug
   */
  async getContentPackageBySlug(slug: string): Promise<ContentPackage> {
    const response = await this.request<{ docs: any[] }>(
      `/content-packages?where[slug][equals]=${slug}&depth=3`
    )

    if (!response.docs || response.docs.length === 0) {
      throw new Error(`Content package not found: ${slug}`)
    }

    return this.transformContentPackage(response.docs[0])
  }

  /**
   * Get article by ID
   */
  async getArticle(id: string): Promise<Article> {
    const response = await this.request<any>(`/articles/${id}?depth=2`)

    return {
      id: response.id,
      title: response.title,
      content: response.content,
      coverImage: response.coverImage ? this.transformMedia(response.coverImage) : undefined,
    }
  }

  /**
   * Transform CMS content package to our type
   */
  private transformContentPackage(data: any): ContentPackage {
    const pkg: ContentPackage = {
      id: data.id,
      name: data.name,
      mode: data.mode || 'browse',
    }

    // Transform menu items
    if (data.menuItems && Array.isArray(data.menuItems)) {
      pkg.menuItems = this.transformMenuItems(data.menuItems)
    }

    // Transform guide-only content
    if (data.guideContent?.items && Array.isArray(data.guideContent.items)) {
      pkg.guideContent = {
        items: data.guideContent.items.map((item: any) => this.transformMedia(item)),
      }
    }

    // Transform playlist
    if (data.playlist) {
      pkg.playlist = {
        items: (data.playlist.items || []).map((item: any) =>
          typeof item === 'string' ? { id: item, url: '', mimeType: '' } : this.transformMedia(item)
        ),
        loopPlaylist: data.playlist.loopPlaylist ?? true,
      }
    }

    // Transform screensaver (v2.5)
    if (data.screensaver) {
      pkg.screensaver = {
        enabled: data.screensaver.enabled ?? true,
        media: Array.isArray(data.screensaver.media)
          ? data.screensaver.media.map((m: any) =>
              typeof m === 'string' ? { id: m, url: '', mimeType: '' } : this.transformMedia(m)
            )
          : data.screensaver.media
            ? [this.transformMedia(data.screensaver.media)]
            : undefined,
        title: data.screensaver.title,
        subtitle: data.screensaver.subtitle,
        showStartButton: data.screensaver.showStartButton ?? true,
        startButtonText: data.screensaver.startButtonText,
        idleTimeoutSeconds: data.screensaver.idleTimeoutSeconds,
        showTransitionAnimation: data.screensaver.showTransitionAnimation ?? true,
      }
    }

    return pkg
  }

  /**
   * Transform menu items recursively (handles submenu items and guideOnly)
   */
  private transformMenuItems(items: any[]): any[] {
    return items.map((item: any) => ({
      id: item.id || String(Math.random()),
      title: item.title,
      description: item.description,
      thumbnail: item.thumbnail ? this.transformMedia(item.thumbnail) : undefined,
      contentType: item.contentType,
      video: item.video ? this.transformMedia(item.video) : undefined,
      article: item.article,
      showcaseItems: item.showcaseItems?.map((si: any) => ({
        id: si.id || String(Math.random()),
        title: si.title,
        description: si.description,
        image: this.transformMedia(si.image),
      })),
      submenuItems: item.submenuItems ? this.transformMenuItems(item.submenuItems) : undefined,
      guideOnly: item.guideOnly || false,
    }))
  }

  /**
   * Transform CMS media to our type
   */
  private transformMedia(data: any): MediaItem {
    if (typeof data === 'string') {
      return { id: data, url: '', mimeType: '' }
    }

    return {
      id: data.id,
      url: data.url ? `${this.baseUrl}${data.url}` : '',
      title: data.title || data.filename,
      mimeType: data.mimeType || '',
      durationSeconds: data.durationSeconds,
      thumbnail: data.sizes?.thumbnail?.url
        ? `${this.baseUrl}${data.sizes.thumbnail.url}`
        : undefined,
      guideOnly: data.guideOnly || false,
      checksum: data.checksum || undefined,
    }
  }

  /**
   * Get media URL with base
   */
  getMediaUrl(path: string): string {
    if (path.startsWith('http')) return path
    return `${this.baseUrl}${path}`
  }
}

// Singleton instance
export const apiService = new ApiService()
