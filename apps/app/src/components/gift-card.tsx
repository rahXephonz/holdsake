import { motion, useReducedMotion } from 'motion/react'
import { artDataUri, CARD_THEMES, cardOf, type CardTheme } from '@/lib/gift-cards'
import { cn } from '@/lib/utils'

/**
 * The greeting card a gift comes in: the occasion's art on its own paper, who it's for, who it's
 * from and their note. Full width, like a card held open. On the gift page it lifts in like a
 * card out of an envelope.
 */
export function GiftCard({
  theme,
  recipientName,
  senderName,
  message,
  animate,
  className,
}: {
  theme: CardTheme
  recipientName: string | null
  senderName: string
  message?: string | null
  animate?: boolean
  className?: string
}) {
  const still = useReducedMotion() ?? false
  const card = cardOf(theme)
  return (
    <motion.div
      initial={animate && !still ? { y: 40, rotate: -4, opacity: 0, scale: 0.94 } : false}
      animate={{ y: 0, rotate: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      className={cn('w-full overflow-hidden rounded-3xl', className)}
      style={{ background: card.paper, color: card.ink }}
    >
      {/* A wide band: the art keeps its 4:3 shape, centred on the card's own paper */}
      <div className="flex h-44 items-center justify-center pt-3">
        <img src={artDataUri(card.theme)} alt="" className="h-full w-auto" />
      </div>
      <div className="px-6 pt-3 pb-6">
        <p className="text-sm font-medium opacity-70">{card.label}</p>
        <p className="mt-0.5 text-2xl leading-tight font-bold tracking-tight text-balance">
          {recipientName ? `For ${recipientName}` : 'For you'}
        </p>
        {message && <p className="mt-4 text-lg leading-relaxed text-pretty">“{message}”</p>}
        <p className={cn('font-medium', message ? 'mt-4' : 'mt-1')}>
          {message ? `— ${senderName}` : `from ${senderName}`}
        </p>
      </div>
    </motion.div>
  )
}

/** A row of small cards to choose from; the chosen one is outlined in ink */
export function CardPicker({
  value,
  onChange,
}: {
  value: CardTheme
  onChange: (theme: CardTheme) => void
}) {
  return (
    // The scroller is a plain div: a fieldset keeps min-width: min-content, so it would stretch
    // to fit every card and widen the whole screen instead of sliding. The vertical padding is
    // room for the chosen card's ring, which a horizontal scroller would otherwise clip.
    <div className="-mx-5 snap-x snap-mandatory scroll-px-5 [scrollbar-width:none] overflow-x-auto overscroll-x-contain px-5 py-2 [&::-webkit-scrollbar]:hidden">
      <fieldset className="m-0 flex w-max min-w-0 gap-3 border-0 p-0">
        <legend className="sr-only">Card</legend>
        {CARD_THEMES.map((theme) => {
          const card = cardOf(theme)
          const selected = value === theme
          return (
            <label
              key={theme}
              className={cn(
                'w-28 shrink-0 cursor-pointer snap-start overflow-hidden rounded-2xl text-left transition-transform active:scale-95 has-focus-visible:ring-2 has-focus-visible:ring-ring',
                selected ? 'ring-2 ring-foreground ring-offset-2' : '',
              )}
              style={{ background: card.paper, color: card.ink }}
            >
              <input
                type="radio"
                name="card-theme"
                value={theme}
                checked={selected}
                onChange={() => onChange(theme)}
                className="sr-only"
              />
              <img src={artDataUri(theme)} alt="" className="block aspect-[4/3] w-full" />
              <span className="block truncate px-2.5 pb-2 text-xs font-medium">{card.label}</span>
            </label>
          )
        })}
      </fieldset>
    </div>
  )
}
