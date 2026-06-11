// src/DemonstrationApp.tsx
import { usePresentationReceiver } from '@/hooks/usePresentationReceiver'
import { DemonstrationScreen } from '@/screens/DemonstrationScreen'

/** Root component for the secondary (?role=display) window. */
export function DemonstrationApp() {
  const state = usePresentationReceiver()
  return <DemonstrationScreen state={state} />
}
