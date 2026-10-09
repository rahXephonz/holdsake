import { parseAbi } from 'viem'

// Third-party interfaces the app reads or calls. Our own contracts' ABIs are generated.

/** Chainlink AggregatorV3 */
export const chainlinkFeedAbi = parseAbi([
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function getRoundData(uint80 roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
])

/** What a Robinhood Stock Token adds on top of ERC-20 (ERC-8056 multiplier, pause) */
export const stockTokenAbi = parseAbi([
  'function uiMultiplier() view returns (uint256)',
  'function paused() view returns (bool)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
])

/** eth-infinitism Simple7702Account / BaseAccount */
export const simpleAccountAbi = parseAbi([
  'struct Call { address target; uint256 value; bytes data; }',
  'function execute(address target, uint256 value, bytes data)',
  'function executeBatch(Call[] calls)',
])

const poolKeyTuple =
  '(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)'

/** Uniswap v4 Quoter: simulates a swap and reverts with the result, so call it with eth_call */
export const v4QuoterAbi = parseAbi([
  `function quoteExactInputSingle((${poolKeyTuple} poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)`,
])

export const universalRouterAbi = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
])

export const permit2Abi = parseAbi([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
])

/** ERC-4626, as Morpho Vault V2 implements it (its max* functions always return 0: don't use) */
export const vaultAbi = parseAbi([
  'function asset() view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function previewWithdraw(uint256 assets) view returns (uint256)',
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
])

const marketParamsTuple =
  '(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)'

/** Morpho Blue: the lending book borrowing runs on (no contract of ours) */
export const morphoBlueAbi = parseAbi([
  'function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
  'function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',
  'function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
  `function supplyCollateral(${marketParamsTuple} marketParams, uint256 assets, address onBehalf, bytes data)`,
  `function withdrawCollateral(${marketParamsTuple} marketParams, uint256 assets, address onBehalf, address receiver)`,
  `function borrow(${marketParamsTuple} marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)`,
  `function repay(${marketParamsTuple} marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)`,
])

/** Morpho oracle: one collateral unit's price in loan units, scaled by 1e36 */
export const morphoOracleAbi = parseAbi(['function price() view returns (uint256)'])
