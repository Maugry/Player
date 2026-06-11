export type ScreenRole = 'panel' | 'display'

/** Pure: parse a role from a location search string (e.g. "?role=panel"). */
export function parseRole(search: string): ScreenRole | null {
  const value = new URLSearchParams(search).get('role')
  return value === 'panel' || value === 'display' ? value : null
}

/** Read the current window's role from its URL. null = legacy single-screen. */
export function screenRole(): ScreenRole | null {
  if (typeof window === 'undefined') return null
  return parseRole(window.location.search)
}
