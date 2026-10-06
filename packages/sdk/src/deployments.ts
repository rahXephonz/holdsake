import type { Address } from 'viem'

// Robinhood Chain (4663) addresses, checked 2026-10-06. Read back on-chain: USDG, EntryPoint,
// Simple7702Account (its entryPoint() is v0.8), Multicall3, Permit2, Morpho Blue, the Uniswap v4
// PoolManager, and the ETH and TSLA feeds. The other feeds and StateView come from their
// publishers' lists and haven't been called yet.

export const USDG: Address = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' // 6 decimals
export const WETH: Address = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'

/** Account abstraction. The bundler (Alchemy) serves EntryPoint v0.8. */
export const ENTRY_POINT_V08: Address = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'
/**
 * The only EIP-7702 delegation target users are ever pointed at: eth-infinitism's audited
 * Simple7702Account for EntryPoint v0.8. Never a contract of ours, never from user input.
 */
export const SIMPLE_7702_ACCOUNT: Address = '0xe6Cae83BdE06E4c305530e199D7217f42808555B'

export const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'
export const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3'

/** Morpho Blue. Holds Stock Tokens as collateral against USDG; borrow runs on it. */
export const MORPHO_BLUE: Address = '0x9d53d5e3bd5e8d4cbfa6db1ca238aea02e651010'

/** Uniswap v4. PoolManager holds most TSLA and USDG on the chain, as expected. */
export const UNISWAP_V4_POOL_MANAGER: Address = '0x8366a39cc670b4001a1121b8f6a443a643e40951'
export const UNISWAP_V4_STATE_VIEW: Address = '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b'

/**
 * Chainlink USD feeds (8 decimals, 24h heartbeat, 0.5% deviation). Stock feeds run 24/5 and
 * stop over the weekend (gaps of ~52h, longer on US holidays), so a staleness check must allow
 * for market hours. Source: Chainlink's feed directory for "robinhood-mainnet".
 */
export const CHAINLINK_FEEDS = {
  ETH: '0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9',
  USDG: '0x61B7e5650328764B076A108EFF5fa7282a1B9aD2',
  TSLA: '0x4A1166a659A55625345e9515b32adECea5547C38',
  AAPL: '0x6B22A786bAa607d76728168703a39Ea9C99f2cD0',
  NVDA: '0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15',
  MSFT: '0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E',
  AMZN: '0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C',
  GOOGL: '0xF6f373a037c30F0e5010d854385cA89185AE638b',
  META: '0x7C38C00C30BEe9378381E7B6135d7283356D71b1',
  COIN: '0xA3a468A452940B7D6b69991207B508c609a98Ef2',
  SPY: '0x319724394D3A0e3669269846abE664Cd621f9f6A',
  QQQ: '0x80901d846d5D7B030F26B480776EE3b29374C2ae',
} as const satisfies Record<string, Address>

/**
 * Our contracts, every deployed version. Contracts are non-upgradeable, so a fix ships as a new
 * version and old ones keep running: indexers read all of them and key rows by
 * (contract address, on-chain id). Empty until the first deploy.
 */
export const deployments = {
  tokenList: [] as Address[],
  gifts: [] as Address[],
  funds: [] as Address[],
  paymaster: [] as Address[],
} as const
