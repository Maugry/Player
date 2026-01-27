/**
 * Error Screen
 * Displayed when there's a connection or loading error
 */

import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react'

interface ErrorScreenProps {
  error: string
  onRetry: () => void
}

export function ErrorScreen({ error, onRetry }: ErrorScreenProps) {
  const isConnectionError = error.toLowerCase().includes('connection') ||
    error.toLowerCase().includes('network') ||
    error.toLowerCase().includes('mqtt') ||
    error.toLowerCase().includes('fetch')

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {/* Icon */}
        <div className="mb-8">
          {isConnectionError ? (
            <WifiOff className="w-24 h-24 mx-auto text-destructive" />
          ) : (
            <AlertCircle className="w-24 h-24 mx-auto text-destructive" />
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold mb-4">
          {isConnectionError ? 'Нет соединения' : 'Произошла ошибка'}
        </h1>

        {/* Error message */}
        <p className="text-muted-foreground text-lg mb-8">
          {error}
        </p>

        {/* Retry button */}
        <Button size="lg" onClick={onRetry} className="gap-2">
          <RefreshCw className="w-5 h-5" />
          Повторить попытку
        </Button>

        {/* Additional info */}
        <div className="mt-8 text-sm text-muted-foreground">
          <p>Если проблема сохраняется, обратитесь к администратору.</p>
          {isConnectionError && (
            <p className="mt-2 flex items-center justify-center gap-2">
              <Wifi className="w-4 h-4" />
              Проверьте подключение к сети
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
