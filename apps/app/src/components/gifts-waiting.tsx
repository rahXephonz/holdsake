import { Link } from '@tanstack/react-router'
import { GiftIcon } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import type { GiftView } from '@/lib/types'

const DAY_MS = 24 * 3600 * 1000

function daysLeft(expiresAt: string | null, now: number) {
  if (!expiresAt) return null
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / DAY_MS))
}

function names(gifts: GiftView[]) {
  const unique = [...new Set(gifts.map((gift) => gift.sender.name))]
  if (unique.length === 1) return unique[0]!
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique[0]}, ${unique[1]} and ${unique.length - 2} more`
}

/**
 * The first thing on Home when someone has sent you a gift you haven't opened: who it's from,
 * and how long you have. Nothing shows when there's nothing to open.
 */
export function GiftsWaiting({ gifts, now }: { gifts: GiftView[] | undefined; now: number }) {
  const still = useReducedMotion() ?? false
  const waiting = (gifts ?? []).filter((gift) => gift.role === 'recipient' && gift.canClaim)
  if (waiting.length === 0) return null

  const single = waiting.length === 1 ? waiting[0]! : null
  // The soonest to go back sets the clock people see
  const soonest = waiting
    .map((gift) => daysLeft(gift.expiresAt, now))
    .filter((days): days is number => days !== null)
    .reduce<number | null>((min, days) => (min === null || days < min ? days : min), null)

  return (
    <motion.div
      initial={still ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="pt-2"
    >
      <Link
        to={single ? '/gift/$id' : '/gifts'}
        params={single ? { id: single.id } : undefined}
        className="flex items-center gap-4 rounded-3xl bg-foreground p-4 text-background"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-background/15">
          <GiftIcon className="size-6" weight="fill" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {single
              ? `${single.sender.name} sent you a gift`
              : `${waiting.length} gifts waiting for you`}
          </span>
          <span className="block truncate text-sm text-background/70">
            {single
              ? single.message
                ? `“${single.message}”`
                : 'Open it to see what’s inside'
              : `From ${names(waiting)}`}
            {soonest !== null &&
              ` · ${soonest === 0 ? 'Last day' : `${soonest} ${soonest === 1 ? 'day' : 'days'} left`}`}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-background px-4 py-2 text-sm font-medium text-foreground">
          Open
        </span>
      </Link>
    </motion.div>
  )
}
