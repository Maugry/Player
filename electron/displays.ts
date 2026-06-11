// Pure display-role resolution. No `electron` import so it is unit-testable
// under vitest; main.ts feeds it screen.getAllDisplays() + getPrimaryDisplay().id.

export interface DisplayLike {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
}

export type WindowPlan =
  | { secondary: false }
  | { secondary: true; panelDisplayId: number; secondaryDisplay: DisplayLike }

/**
 * Decide whether to run a second demonstration window. Dual-screen Browse is
 * the ONLY trigger: mode must be 'browse' AND at least two displays present.
 * Mode is the discriminator that keeps Loop (mirror) and single-display on the
 * unchanged single-window path.
 */
export function resolveWindowPlan(
  displays: DisplayLike[],
  primaryId: number,
  settings: { mode: string },
): WindowPlan {
  if (settings.mode !== 'browse' || displays.length < 2) return { secondary: false }
  const secondaryDisplay = displays.find(disp => disp.id !== primaryId)
  if (!secondaryDisplay) return { secondary: false }
  return { secondary: true, panelDisplayId: primaryId, secondaryDisplay }
}
