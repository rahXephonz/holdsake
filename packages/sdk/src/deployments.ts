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
 * From Uniswap's Robinhood Chain deployment list, checked on-chain 2026-10-07: both report the
 * PoolManager above as their `poolManager()`. Universal Router 2.1.2 supersedes 0x8876…0904 and
 * 0x06af…BF99, which the docs list as older.
 */
export const UNISWAP_V4_QUOTER: Address = '0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94'
export const UNIVERSAL_ROUTER: Address = '0x204FAca1764B154221e35c0d20aBb3c525710498'

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
 * (contract address, on-chain id). The last entry is the current one.
 *
 * v1, deployed 2026-10-09 at blocks 84043655–84043671 (`contracts/broadcast/Deploy.s.sol/4663`).
 * Read back on-chain: token list owned by the Safe below with USDG and all 194 stocks allowed;
 * gifts and funds point at that list, gifts' cash is USDG; paymaster on EntryPoint v0.8 with
 * signer 0x9367…D96A and maxCostPerOp 0.0002 ETH, owned by the Safe.
 */
export const deployments = {
  tokenList: ['0xEe7c5B5a9eeAf667A6EFb217A8a77534C873f7a9'] as Address[],
  gifts: ['0x4b96E74B963efa7Ab7D7497854Fc87220Bd092C4'] as Address[],
  funds: ['0x1515c22fDBa8CCa4B3610dEbCf8BEa8867055Bd7'] as Address[],
  paymaster: ['0x04CD74e77ac145B18d61c6C8D7939e3241DBB60A'] as Address[],
} as const

/**
 * Earn: the lending vault people's cash goes into (Morpho Vault V2, ERC-4626 over USDG). Chosen
 * 2026-10-09 by the user: NetNet Credit (nnUSDG) lends to people borrowing against Stock Tokens
 * (SPCX, NVDA, AAPL, GOOGL, MSFT) plus wsNET. Read back on-chain: asset() is USDG, all four gates
 * are unset (anyone may deposit and withdraw), 18-decimal shares. Its curator and owner is one
 * multisig (0x3Bb7…5f42) with a 10% performance fee. Markets ran at ~99.8% use that day, so
 * withdrawals can wait until borrowers repay; the screen says so. A new vault is a new entry.
 */
export const EARN_VAULT: Address = '0x99347d5F70D3838763f6Bddcf80304C8aa953B57'

/**
 * Borrow: the Morpho Blue markets offered, Stock Token collateral against USDG. Chosen
 * 2026-10-09 after reading each on-chain: idToMarketParams gives USDG as loan, the canonical
 * Stock Token as collateral, LLTV 62.5%, IRM 0x2BD3…0fa1; each oracle is Morpho's Chainlink
 * oracle reading Chainlink proxies (owner 0xeE27…9C52, same aggregators and prices as
 * CHAINLINK_FEEDS) for the stock and for USDG. NVDA/AAPL/GOOGL held ~$100k free at ~0.8%; TSLA
 * ~$6.5k. The busy AAPL market (0xdeb4…, ~99.8% used) has a non-standard oracle: not offered.
 */
export const BORROW_MARKETS = {
  NVDA: '0xf5ff7d546af5e72f3912d2aa723088fd0bf66fddc158714995637714d9db6e4c',
  AAPL: '0xcaa167af7ba0422c76424fae56167b7db25bf19f4f435215e6dd7d06a943bdac',
  GOOGL: '0xba01f6625137b692c5dd86afb8e654b4016d7b64e36dfca4124e84bef98bc4d2',
  TSLA: '0xb41b34c5989420ad080e79363a9cfe3e23bec7459fcd2d88029250da370288df',
} as const satisfies Record<string, `0x${string}`>

/** Owns the token list and the paymaster: a Safe (1-of-1 for the demo; raise before real users). */
export const OWNER_SAFE: Address = '0x812a47f8860ca05045C3Ad69FF0caea732f32922'
