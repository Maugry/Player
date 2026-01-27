/**
 * Loading Screen
 * Displayed while initializing and loading content
 */

import { Loader2 } from 'lucide-react'

interface LoadingScreenProps {
  message?: string
}

export function LoadingScreen({ message = 'Загрузка...' }: LoadingScreenProps) {
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin text-primary" />
        <p className="text-xl text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
