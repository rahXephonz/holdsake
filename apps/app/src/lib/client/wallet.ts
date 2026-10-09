import { usePrivy, useCreateWallet, useWallets } from '@privy-io/react-auth'
import { useEffect, useRef, useState } from 'react'

/**
 * The signed-in person's embedded account, created on the spot if Privy didn't make one at login
 * (e.g. the page navigated away mid-creation). Everything with money needs it.
 */
export function useEnsureWallet() {
  const { ready, authenticated } = usePrivy()
  const { ready: walletsReady, wallets } = useWallets()
  const { createWallet } = useCreateWallet()
  const [failed, setFailed] = useState(false)
  const creating = useRef(false)
  const embedded = wallets.find((wallet) => wallet.walletClientType === 'privy')
  const address = embedded?.address ?? null

  useEffect(() => {
    // One attempt per mount: a failure shows an error instead of retrying in a loop
    if (!ready || !authenticated || !walletsReady || address || creating.current || failed) return
    creating.current = true
    createWallet()
      .catch(() => setFailed(true))
      .finally(() => {
        creating.current = false
      })
  }, [ready, authenticated, walletsReady, address, createWallet, failed])

  return { address, ready: Boolean(address), failed }
}
