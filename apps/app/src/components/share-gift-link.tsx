import { CheckIcon, ExportIcon, LinkIcon } from '@phosphor-icons/react'
import { useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const noop = () => () => {}

/**
 * The gift's own page, to send however the sender likes. Safe to share anywhere: the gift is
 * locked to the recipient's account, so the link only saves them a search; anyone else who opens
 * it sees nothing they can take. Signed-out visitors sign in and land back on it.
 */
export function ShareGiftLink({
  giftId,
  senderName,
  compact,
}: {
  giftId: string
  senderName?: string
  /** One small button for the gift page; the success screen gets the full pair */
  compact?: boolean
}) {
  const [copied, setCopied] = useState(false)
  // Browser-only APIs; false while rendering on the server
  const canShare = useSyncExternalStore(
    noop,
    () => typeof navigator.share === 'function',
    () => false,
  )
  const link = () => new URL(`/gift/${giftId}`, window.location.origin).toString()

  const copy = async () => {
    await navigator.clipboard.writeText(link())
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const share = async () => {
    try {
      await navigator.share({
        title: 'A gift for you',
        text: senderName
          ? `${senderName} sent you a gift on Holdsake. Open it here:`
          : 'You have a gift on Holdsake. Open it here:',
        url: link(),
      })
    } catch {
      // Closing the share sheet rejects; nothing to do
    }
  }

  if (compact)
    return (
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-medium"
      >
        {copied ? <CheckIcon className="size-4" weight="bold" /> : <LinkIcon className="size-4" />}
        {copied ? 'Link copied' : 'Copy gift link'}
      </button>
    )

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full gap-3">
        <Button
          size="xl"
          variant="secondary"
          className={cn('flex-1', copied && 'text-gain')}
          onClick={copy}
        >
          {copied ? <CheckIcon weight="bold" /> : <LinkIcon />}
          {copied ? 'Copied' : 'Copy gift link'}
        </Button>
        {canShare && (
          <Button size="xl" variant="secondary" className="w-auto px-6" onClick={share}>
            <ExportIcon />
            Share
          </Button>
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Send it any way you like. Only they can open the gift, even if someone else gets the link.
      </p>
    </div>
  )
}
