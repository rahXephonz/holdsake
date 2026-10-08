import type { Address } from 'viem'

// Canonical addresses from Robinhood's docs (read 2026-10-05). Re-read before deploying.
export const USDG: Address = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'
export const WETH: Address = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'

/**
 * Our contracts, every deployed version. Contracts are non-upgradeable, so a fix ships as a new
 * version and old ones keep running: indexers read all of them and key rows by
 * (contract address, on-chain id). Empty until the first deploy.
 */
export const deployments = {
  gifts: [] as Address[],
  funds: [] as Address[],
} as const
