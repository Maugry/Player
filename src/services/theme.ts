/**
 * Kiosk theme application (#260).
 *
 * The CMS `themes` collection is a set of design tokens; the Player applies the
 * kiosk's selected theme at startup by overriding CSS custom properties on the
 * document root. Unspecified values fall back to the appearance baseline
 * (`:root` / `.dark` defaults in index.css), so partial themes look correct.
 *
 * The shape is consumed type-only (no zod) — it mirrors the CMS Themes fields at
 * depth>=1, where `theme.backgroundImage` is a populated media object.
 */

export interface KioskThemeColors {
  primary?: string | null
  primaryForeground?: string | null
  accent?: string | null
  accentForeground?: string | null
  background?: string | null
  foreground?: string | null
  card?: string | null
  cardForeground?: string | null
  secondary?: string | null
  secondaryForeground?: string | null
  muted?: string | null
  mutedForeground?: string | null
  border?: string | null
}

export interface KioskTheme {
  appearance?: 'light' | 'dark' | null
  colors?: KioskThemeColors | null
  gradient?: { from?: string | null; to?: string | null; angle?: number | null } | null
  backgroundImage?: { url?: string | null } | string | null
  backgroundFit?: 'cover' | 'contain' | 'tile' | 'center' | null
  backgroundOverlay?: { color?: string | null; opacity?: number | null } | null
  fontFamily?: string | null
  radius?: number | null
  customCss?: string | null
}

/** colour token key → CSS custom property it overrides. */
const COLOR_VARS: Record<keyof KioskThemeColors, string> = {
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  border: '--border',
}

const CUSTOM_STYLE_ID = 'kiosk-theme-custom'

/** Expand a #RGB/#RRGGBB hex to an `rgba(r, g, b, a)` string. */
function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function resolveUrl(url: string, serverUrl: string): string {
  return /^https?:\/\//.test(url) ? url : `${serverUrl}${url}`
}

/**
 * Apply a kiosk theme to the document root. Safe to call with null/undefined
 * (no-op). `serverUrl` resolves a relative background-image URL.
 */
export function applyTheme(theme: KioskTheme | null | undefined, serverUrl = ''): void {
  if (!theme) return
  const root = document.documentElement

  // Appearance baseline first, so unspecified tokens fall back correctly.
  root.classList.toggle('dark', theme.appearance === 'dark')

  // Brand colours → CSS variables (only the ones provided).
  if (theme.colors) {
    for (const key of Object.keys(COLOR_VARS) as (keyof KioskThemeColors)[]) {
      const value = theme.colors[key]
      if (value) root.style.setProperty(COLOR_VARS[key], value)
    }
  }

  // Corner radius — index.css derives radius-sm/md/lg/xl from --radius.
  if (typeof theme.radius === 'number') {
    root.style.setProperty('--radius', `${theme.radius}rem`)
  }

  // Brand gradient (needs both stops).
  if (theme.gradient?.from && theme.gradient?.to) {
    const angle = theme.gradient.angle ?? 135
    root.style.setProperty('--brand-gradient', `linear-gradient(${angle}deg, ${theme.gradient.from}, ${theme.gradient.to})`)
  }

  // Typography.
  if (theme.fontFamily) {
    root.style.setProperty('--font-sans', theme.fontFamily)
    root.style.fontFamily = theme.fontFamily
  }

  // Background image + fit + overlay.
  const rawBg = typeof theme.backgroundImage === 'object' && theme.backgroundImage
    ? theme.backgroundImage.url
    : (theme.backgroundImage as string | null | undefined)
  if (rawBg) {
    const tile = theme.backgroundFit === 'tile'
    root.style.setProperty('--kiosk-bg-image', `url("${resolveUrl(rawBg, serverUrl)}")`)
    root.style.setProperty('--kiosk-bg-size', tile ? 'auto' : (theme.backgroundFit ?? 'cover'))
    root.style.setProperty('--kiosk-bg-repeat', tile ? 'repeat' : 'no-repeat')
  }
  if (theme.backgroundOverlay?.color) {
    root.style.setProperty('--kiosk-bg-overlay', hexToRgba(theme.backgroundOverlay.color, theme.backgroundOverlay.opacity ?? 0.5))
  }

  // Custom CSS escape hatch — single managed <style> element.
  applyCustomCss(theme.customCss)
}

function applyCustomCss(css: string | null | undefined): void {
  let el = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null
  if (!css) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('style')
    el.id = CUSTOM_STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = css
}
