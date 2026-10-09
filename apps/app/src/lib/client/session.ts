import { usePrivy } from '@privy-io/react-auth'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useProfileQuery } from '@/lib/client/queries'
import { useEnsureWallet } from '@/lib/client/wallet'

/**
 * Privy session + our profile. With `required`, signed-out people go to login and people who
 * haven't finished setup go to onboarding, each coming back here afterwards.
 */
export function useSession({ required = true }: { required?: boolean } = {}) {
  const { ready, authenticated, logout } = usePrivy()
  const navigate = useNavigate()
  // Where they were when the screen opened. Read once: once a redirect starts, the URL becomes
  // /login while this screen is still mounted, and chasing it would nest `next` forever.
  const pathname = useLocation({ select: (location) => location.pathname })
  const [here] = useState(() =>
    typeof window === 'undefined' ? '/' : location.pathname + location.search,
  )
  // Creates the account for people who ended up without one; the profile refetches once it exists
  const wallet = useEnsureWallet()
  const me = useProfileQuery(wallet.address, { enabled: ready && authenticated })

  useEffect(() => {
    if (!required || !ready) return
    if (pathname === '/login' || pathname === '/onboarding') return
    if (!authenticated) void navigate({ to: '/login', search: { next: here }, replace: true })
    else if (me.data && !me.data.onboarded)
      void navigate({ to: '/onboarding', search: { next: here }, replace: true })
  }, [required, ready, authenticated, me.data, navigate, pathname, here])

  const loaded = ready && (!authenticated || me.isSuccess || me.isError)
  return {
    ready: loaded && (!required || Boolean(me.data?.onboarded)),
    authenticated,
    profile: me.data ?? null,
    refresh: me.refetch,
    logout,
  }
}
