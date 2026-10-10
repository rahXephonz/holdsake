import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth'
import { useNavigate } from '@tanstack/react-router'
import { EnvelopeIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { EmailLogin } from '@/components/email-login'
import { GiftCard } from '@/components/gift-card'
import { ListRow } from '@/components/list-row'
import { Loading, Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { safeNext } from '@/lib/client/next'
import { Avatar, StockLogo } from '@/components/stock-logo'
import { useGiftPreviewQuery, useProfileQuery } from '@/lib/client/queries'
import { useEnsureWallet } from '@/lib/client/wallet'
import { formatShares, formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Our own sign-in screens over Privy's headless hooks (email code and Google), so no Privy modal
 * ever shows. Google redirects away and back here; Privy finishes the login on return.
 */
export default function LoginScreen({ next }: { next?: string }) {
  const { ready, authenticated } = usePrivy()
  const navigate = useNavigate()
  const wallet = useEnsureWallet()
  const profile = useProfileQuery(wallet.address, {
    enabled: ready && authenticated && wallet.ready,
  })
  const { initOAuth, state: oauth } = useLoginWithOAuth()
  const [view, setView] = useState<'welcome' | 'email'>('welcome')
  const [error, setError] = useState<string | null>(null)
  const destination = safeNext(next)
  // Arriving through a gift link: show whose gift is waiting instead of the general pitch
  const giftId = /^\/gift\/([0-9a-f-]{36})$/i.exec(destination)?.[1] ?? null
  const preview = useGiftPreviewQuery(giftId)

  // After any login (or landing here signed in): wait for the account to exist, since leaving
  // earlier interrupts Privy creating it, then go to setup or wherever they were headed
  useEffect(() => {
    if (!profile.data) return
    if (profile.data.onboarded) void navigate({ to: destination, replace: true })
    else void navigate({ to: '/onboarding', search: { next: destination }, replace: true })
  }, [profile.data, destination, navigate])

  const setupError = wallet.failed
    ? 'We couldn’t finish setting up your account. Try again.'
    : profile.isError
      ? 'We couldn’t load your account. Try again.'
      : null
  const shownError = error ?? setupError

  if (!ready || (authenticated && !setupError)) return <Loading />

  if (view === 'email')
    return (
      <Screen back="/login" title="">
        <EmailLogin />
      </Screen>
    )

  const google = async () => {
    setError(null)
    try {
      await initOAuth({ provider: 'google' })
    } catch {
      setError('That sign-in didn’t finish. Try again or use your email.')
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[max(48px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <p className="font-heading text-2xl font-bold">Holdsake</p>
      <div className="flex flex-1 flex-col justify-center">
        {preview.data?.waiting ? (
          <div className="py-6">
            <h1 className="text-center text-3xl leading-tight font-bold tracking-tight text-balance">
              {preview.data.senderName} sent you a gift
            </h1>
            <GiftCard
              theme={preview.data.cardTheme}
              recipientName={preview.data.recipientName}
              senderName={preview.data.senderName}
              animate
              className="mt-6"
            />
            <div className="mt-4">
              {preview.data.items.map((item, index) => (
                <ListRow
                  key={index}
                  leading={<StockLogo ticker={item.ticker ?? '$'} />}
                  title={item.name}
                  subtitle={
                    item.kind === 'stock' && item.shares !== null
                      ? `${formatShares(item.shares)} shares`
                      : 'Cash'
                  }
                  value={item.usdValue === null ? '—' : formatUsd(item.usdValue)}
                />
              ))}
            </div>
            <p className="mt-4 text-center text-base text-balance text-muted-foreground">
              Sign in to open it. Only you can.
            </p>
          </div>
        ) : preview.data ? (
          <div className="flex flex-col items-center text-center">
            <Avatar name={preview.data.senderName} url={preview.data.senderAvatarUrl} size={88} />
            <h1 className="mt-6 text-4xl leading-tight font-bold tracking-tight text-balance">
              A gift from {preview.data.senderName}
            </h1>
            <p className="mt-4 text-lg text-balance text-muted-foreground">
              This one has already been opened or gone back. Sign in to see your gifts.
            </p>
          </div>
        ) : (
          <Pitch />
        )}
      </div>
      <div className="flex flex-col gap-3">
        {shownError && <p className="text-center text-sm text-destructive">{shownError}</p>}
        <Button size="xl" onClick={() => setView('email')}>
          <EnvelopeIcon className="size-5" />
          Continue with email
        </Button>
        <Button
          size="xl"
          variant="secondary"
          disabled={oauth.status === 'loading'}
          onClick={google}
        >
          <img src="/google-logo.svg" alt="" className="size-5" />
          {oauth.status === 'loading' ? 'Opening Google…' : 'Continue with Google'}
        </Button>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Not available to US persons or in restricted countries.
        </p>
      </div>
    </div>
  )
}

// The welcome line cycles through what Holdsake is for. Each pair stays two lines at this size,
// so swapping never moves the buttons below.
const PITCHES = [
  {
    title: ['Give real', 'ownership.'],
    body: 'Send shares of the companies you love to the people you love. They open it, they own it.',
  },
  {
    title: ['Save up for', 'someone.'],
    body: 'Start a goal fund, let family chip in, and it unlocks on the day you pick.',
  },
  {
    title: ['Every day is', 'a gift day.'],
    body: 'Birthdays, Lebaran, angpao or just because. Pick a card and send it in a minute.',
  },
] as const

const PITCH_MS = 3800

function Pitch() {
  const still = useReducedMotion() ?? false
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % PITCHES.length),
      PITCH_MS,
    )
    return () => window.clearInterval(timer)
  }, [])
  const pitch = PITCHES[index]!
  // Reduced motion still changes the words, as a plain crossfade without movement
  const hidden = still ? { opacity: 0 } : { opacity: 0, y: 24, filter: 'blur(6px)' }
  const shown = still ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }
  const gone = still ? { opacity: 0 } : { opacity: 0, y: -24, filter: 'blur(6px)' }
  return (
    <div>
      <div className="relative min-h-[6.4rem] overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={index}
            className="text-5xl leading-[1.05] font-bold tracking-tight"
            initial={hidden}
            animate={shown}
            exit={gone}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {pitch.title[0]}
            <br />
            {pitch.title[1]}
          </motion.h1>
        </AnimatePresence>
      </div>
      <div className="mt-5 min-h-[5.9rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={index}
            className="text-lg text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, delay: still ? 0 : 0.1 }}
          >
            {pitch.body}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="mt-6 flex gap-1.5" aria-hidden="true">
        {PITCHES.map((_, dot) => (
          <span
            key={dot}
            className={cn(
              'h-1.5 rounded-full transition-all duration-500',
              dot === index ? 'w-6 bg-foreground' : 'w-1.5 bg-border',
            )}
          />
        ))}
      </div>
    </div>
  )
}
