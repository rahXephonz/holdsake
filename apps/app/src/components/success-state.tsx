import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * The end of a money flow: a green check that pops in and draws itself, then the title and the
 * one line under it. Green is the gain colour, the only other colour the app uses.
 */
export function SuccessState({
  title,
  children,
  details,
}: {
  title: string
  children?: ReactNode
  /** Shown under the text once it has settled, e.g. a receipt */
  details?: ReactNode
}) {
  const still = useReducedMotion() ?? false

  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-6 text-center">
      <div className="relative flex size-20 items-center justify-center">
        {/* One soft ring that spreads out once, behind the circle */}
        {!still && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-gain"
            initial={{ scale: 0.8, opacity: 0.35 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.9, delay: 0.25, ease: 'easeOut' }}
          />
        )}
        <motion.span
          className="relative flex size-20 items-center justify-center rounded-full bg-gain text-white"
          initial={still ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 18 }}
        >
          <svg viewBox="0 0 24 24" className="size-10" fill="none" aria-hidden="true">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={still ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, delay: 0.2, ease: 'easeOut' }}
            />
          </svg>
        </motion.span>
      </div>

      <motion.h1
        className="mt-6 text-3xl font-bold tracking-tight"
        initial={still ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.35, ease: 'easeOut' }}
      >
        {title}
      </motion.h1>
      {children && (
        <motion.p
          className="mt-2 text-muted-foreground"
          initial={still ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.45, ease: 'easeOut' }}
        >
          {children}
        </motion.p>
      )}
      {details && (
        <motion.div
          className="mt-8 w-full text-left"
          initial={still ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.6, ease: 'easeOut' }}
        >
          {details}
        </motion.div>
      )}
    </div>
  )
}
