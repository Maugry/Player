// src/screens/Placeholder.tsx
import { useCachedMediaUrl } from '@/hooks/useCachedMediaUrl'
import type { PlaceholderInfo } from '@/lib/presentation'

/**
 * Idle demonstration screen shown when nothing is selected on the panel.
 * Minimal + intentionally unstyled — visual design lands with #205.
 */
export function Placeholder({ info }: { info: PlaceholderInfo }) {
  const mediaUrl = useCachedMediaUrl(info.media ?? null)
  const isVideo = info.media?.mimeType?.startsWith('video/')

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-black text-white">
      {mediaUrl && isVideo && (
        <video src={mediaUrl} autoPlay loop muted className="absolute inset-0 w-full h-full object-cover" />
      )}
      {mediaUrl && !isVideo && (
        <img src={mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className="relative z-10 text-center">
        <h1 className="text-4xl">{info.title ?? info.packageName}</h1>
        {info.subtitle && <p className="mt-2 text-xl opacity-80">{info.subtitle}</p>}
      </div>
    </div>
  )
}
