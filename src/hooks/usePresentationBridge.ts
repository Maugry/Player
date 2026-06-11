// src/hooks/usePresentationBridge.ts
import { useEffect } from 'react'
import { playerService } from '@/services/player'
import { derivePresentation, type PresentationState } from '@/lib/presentation'
import type { ContentPackage } from '@/types'

const CHANNEL = 'presentation:update'

function samePayload(a: PresentationState | null, b: PresentationState): boolean {
  if (!a) return false
  if (a.kind !== b.kind) return false
  if (a.kind === 'idle' && b.kind === 'idle') {
    return a.placeholder.media?.id === b.placeholder.media?.id && a.placeholder.title === b.placeholder.title
  }
  if (a.kind === 'media' && b.kind === 'media') {
    const ai = (a.content as { id?: string }).id
    const bi = (b.content as { id?: string }).id
    return ai === bi && a.playback === b.playback && a.volume === b.volume && a.loop === b.loop
  }
  return false
}

/**
 * Panel only: mirror the player's selection to the demonstration window.
 * Subscribes to playerService state, derives the PresentationState, and sends
 * it over IPC (de-duped so identical states don't spam the channel).
 */
export function usePresentationBridge(pkg: ContentPackage | null): void {
  useEffect(() => {
    let lastSent: PresentationState | null = null
    const send = (next: PresentationState) => {
      if (samePayload(lastSent, next)) return
      lastSent = next
      window.ipcRenderer?.send(CHANNEL, next)
    }
    const unsubscribe = playerService.onStateChange(state => {
      send(derivePresentation(state, pkg))
    })
    return () => unsubscribe()
  }, [pkg])
}
