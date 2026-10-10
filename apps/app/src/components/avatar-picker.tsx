import { CameraIcon } from '@phosphor-icons/react'
import { Avatar } from '@/components/stock-logo'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage } from '@/lib/client/api'
import { useAvatarMutation } from '@/lib/client/queries'
import { cn } from '@/lib/utils'

/**
 * The person's photo, tappable to pick a new one. It uploads as soon as it's picked, so there's
 * nothing to save; the profile refetches and every screen shows the new one.
 */
export function AvatarPicker({
  name,
  url,
  size = 64,
  removable,
  className,
}: {
  name: string
  url: string | null
  size?: number
  /** Offer "Remove photo" under it when there is one */
  removable?: boolean
  className?: string
}) {
  const avatar = useAvatarMutation()
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <label className="relative shrink-0 cursor-pointer rounded-full has-focus-visible:ring-2 has-focus-visible:ring-ring">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="sr-only"
          aria-label={url ? 'Change photo' : 'Add a photo'}
          disabled={avatar.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0]
            // Cleared so picking the same photo again still fires
            event.target.value = ''
            if (file) avatar.mutate(file)
          }}
        />
        <Avatar name={name} url={url} size={size} />
        {avatar.isPending ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Spinner size={20} />
          </span>
        ) : (
          <span className="absolute -right-0.5 -bottom-0.5 flex size-6 items-center justify-center rounded-full border-2 border-background bg-foreground text-background">
            <CameraIcon weight="fill" className="size-3" />
          </span>
        )}
      </label>
      {removable && url && !avatar.isPending && (
        <button
          type="button"
          onClick={() => avatar.mutate(null)}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Remove photo
        </button>
      )}
      {avatar.isError && (
        <p className="text-center text-sm text-destructive">{errorMessage(avatar.error)}</p>
      )}
    </div>
  )
}
