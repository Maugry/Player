// src/hooks/usePresentationReceiver.ts
import { useEffect, useState } from 'react'
import { applyPresentation, type PresentationState } from '@/lib/presentation'

const CHANNEL = 'presentation:update'

/**
 * Display only: subscribe to presentation updates relayed from the panel and
 * expose the current PresentationState. Starts idle; every payload is validated
 * through applyPresentation (fail-safe to idle).
 */
export function usePresentationReceiver(): PresentationState {
  const [state, setState] = useState<PresentationState>({ kind: 'idle', placeholder: { packageName: '' } })

  useEffect(() => {
    // The preload's ipcRenderer.on forwards (event, ...args) to the listener,
    // so the payload is the second argument.
    const handler = (_event: unknown, payload: unknown) => {
      setState(applyPresentation(payload))
    }
    window.ipcRenderer?.on(CHANNEL, handler)
    return () => {
      window.ipcRenderer?.off(CHANNEL, handler)
    }
  }, [])

  return state
}
