import { defineChain } from 'viem'

// Robinhood Chain (Arbitrum Orbit). RPC URLs are server config, not part of the SDK.
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [] } },
  // Multicall3 at its usual address, read back on-chain 2026-10-06 (deployments.ts)
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
})
