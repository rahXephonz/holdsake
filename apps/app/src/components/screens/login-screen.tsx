import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth'
import { useNavigate } from '@tanstack/react-router'
import { EnvelopeIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { EmailLogin } from '@/components/email-login'
import { Loading, Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { safeNext } from '@/lib/client/next'
import { Avatar } from '@/components/stock-logo'
import { useGiftPreviewQuery, useProfileQuery } from '@/lib/client/queries'
import { useEnsureWallet } from '@/lib/client/wallet'

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
        {preview.data ? (
          <div className="flex flex-col items-center text-center">
            <Avatar name={preview.data.senderName} url={preview.data.senderAvatarUrl} size={88} />
            <h1 className="mt-6 text-4xl leading-tight font-bold tracking-tight text-balance">
              {preview.data.waiting
                ? `${preview.data.senderName} sent you a gift`
                : `A gift from ${preview.data.senderName}`}
            </h1>
            <p className="mt-4 text-lg text-balance text-muted-foreground">
              {preview.data.waiting
                ? 'Sign in to open it and see what’s inside. Only you can.'
                : 'This one has already been opened or gone back. Sign in to see your gifts.'}
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-5xl leading-[1.05] font-bold tracking-tight">
              Give real
              <br />
              ownership.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Send shares of the companies you love to the people you love. They open it, they own
              it.
            </p>
          </>
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
