import { type PrivyClientConfig, PrivyProvider, usePrivy } from '@privy-io/react-auth'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useRef } from 'react'
import { robinhoodChain } from '@holdsake/sdk'

/** Private queries are shared across screens, but never across signed-in accounts */
function SessionCache({ children }: { children: ReactNode }) {
  const { ready, authenticated, user } = usePrivy()
  const queryClient = useQueryClient()
  const identity = !ready ? undefined : authenticated ? (user?.id ?? null) : null
  const seen = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (identity === undefined) return
    if (seen.current !== undefined && seen.current !== identity) queryClient.clear()
    seen.current = identity
  }, [identity, queryClient])
  return children
}

// Privy's embedded wallet provider refuses to start for a chain without an RPC URL, even though
// signing (all we use it for) never calls one. Our own RPC carries an API key and stays on the
// server, so the browser gets the chain's free public endpoint.
const browserChain = {
  ...robinhoodChain,
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
}

// One stable object: a new config on every render makes Privy re-initialise
const PRIVY_CONFIG: PrivyClientConfig = {
  // Sign-in screens are ours (headless hooks); this only says which methods are allowed
  loginMethods: ['email', 'google'],
  appearance: {
    theme: 'light',
    walletChainType: 'ethereum-only',
    showWalletLoginFirst: false,
  },
  defaultChain: browserChain,
  supportedChains: [browserChain],
  // Accounts are only ever Privy's embedded ones: no Coinbase Smart Wallet, no browser extensions
  externalWallets: { disableAllExternalWallets: true },
  embeddedWallets: {
    ethereum: { createOnLogin: 'users-without-wallets' },
    // Every signing step is our own UI; Privy's wallet modals would show crypto terms
    showWalletUIs: false,
  },
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      clientId={import.meta.env.VITE_PRIVY_CLIENT_ID || undefined}
      config={PRIVY_CONFIG}
    >
      <SessionCache>{children}</SessionCache>
    </PrivyProvider>
  )
}
