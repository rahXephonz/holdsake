import { usePrivy, useCreateWallet, useWallets } from '@privy-io/react-auth'
import { useEffect, useRef, useState } from 'react'

// Privy makes the account at login (`createOnLogin`); this is the fallback for when it didn't,
// given a moment first so the two don't race
const CREATE_AFTER_MS = 3000

/**
 * The signed-in person's embedded account, created on the spot if Privy didn't make one at login
 * (e.g. the page navigated away mid-creation). Everything with money needs it.
 *
 * Never waits on `useWallets().ready`: with external wallets disabled it stays false forever
 * (AGENT.md "Signing in the browser"), which left new accounts on the loading screen for good.
 * The address comes from the wallet list or, sooner, from the Privy user's linked accounts.
 */
export function useEnsureWallet() {
  const { ready, authenticated, user } = usePrivy()
  const { wallets } = useWallets()
  const { createWallet } = useCreateWallet()
  const [failed, setFailed] = useState(false)
  const creating = useRef(false)
  const linked = user?.linkedAccounts.find(
    (account) =>
      account.type === 'wallet' &&
      account.walletClientType === 'privy' &&
      account.chainType === 'ethereum',
  )
  const address =
    wallets.find((wallet) => wallet.walletClientType === 'privy')?.address ??
    (linked && 'address' in linked ? linked.address : null)

  useEffect(() => {
    // One attempt per mount: a failure shows an error instead of retrying in a loop
    if (!ready || !authenticated || address || creating.current || failed) return undefined
    const timer = window.setTimeout(() => {
      creating.current = true
      createWallet()
        .catch((error: unknown) => {
          // Privy finished making it in the meantime: the user object updates on its own
          if (error instanceof Error && /already/i.test(error.message)) return
          setFailed(true)
        })
        .finally(() => {
          creating.current = false
        })
    }, CREATE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [ready, authenticated, address, createWallet, failed])

  return { address, ready: Boolean(address), failed }
}
