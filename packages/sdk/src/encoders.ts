import { encodeAbiParameters, encodeFunctionData, encodePacked, erc20Abi, type Address } from 'viem'
import { morphoBlueAbi, permit2Abi, universalRouterAbi, vaultAbi } from './abis'
import { holdsakeFundsAbi, holdsakeGiftsAbi } from './generated/abis'

// Calldata for every call the server puts in a user operation. The submit checks decode with the
// same ABIs, so what's built and what's verified can't drift apart.

export type GiftItem = { token: Address; amount: bigint }
export type MixEntry = { token: Address; minRaw: bigint }

export const encodeCreateGift = (recipient: Address, items: readonly GiftItem[]) =>
  encodeFunctionData({
    abi: holdsakeGiftsAbi,
    functionName: 'createGift',
    args: [recipient, items],
  })

export const encodeClaimGift = (id: bigint, to: Address) =>
  encodeFunctionData({ abi: holdsakeGiftsAbi, functionName: 'claimGift', args: [id, to] })

export const encodeClaimItem = (id: bigint, index: bigint, to: Address) =>
  encodeFunctionData({ abi: holdsakeGiftsAbi, functionName: 'claimItem', args: [id, index, to] })

export const encodeRefundGift = (id: bigint) =>
  encodeFunctionData({ abi: holdsakeGiftsAbi, functionName: 'refundGift', args: [id] })

export const encodeRefundGiftTo = (id: bigint, to: Address) =>
  encodeFunctionData({ abi: holdsakeGiftsAbi, functionName: 'refundGiftTo', args: [id, to] })

export const encodeCreateFund = (
  beneficiary: Address,
  unlockAt: bigint,
  mix: readonly MixEntry[],
) =>
  encodeFunctionData({
    abi: holdsakeFundsAbi,
    functionName: 'createFund',
    args: [beneficiary, unlockAt, mix],
  })

export const encodeContribute = (id: bigint, token: Address, amount: bigint) =>
  encodeFunctionData({
    abi: holdsakeFundsAbi,
    functionName: 'contribute',
    args: [id, token, amount],
  })

export const encodeWithdraw = (id: bigint, to: Address) =>
  encodeFunctionData({ abi: holdsakeFundsAbi, functionName: 'withdraw', args: [id, to] })

export const encodeWithdrawToken = (id: bigint, token: Address, to: Address) =>
  encodeFunctionData({
    abi: holdsakeFundsAbi,
    functionName: 'withdrawToken',
    args: [id, token, to],
  })

/** Exact-amount approval for the escrow call that follows it in the same batch; never unlimited */
export const encodeApprove = (spender: Address, amount: bigint) =>
  encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] })

export const encodeTransfer = (to: Address, amount: bigint) =>
  encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amount] })

export type PoolKey = {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

/** Permit2 allowance for the router, exact amount, expiring with the operation */
export const encodePermit2Approve = (
  token: Address,
  spender: Address,
  amount: bigint,
  expiration: number,
) =>
  encodeFunctionData({
    abi: permit2Abi,
    functionName: 'approve',
    args: [token, spender, amount, expiration],
  })

// Universal Router command and v4-periphery action ids (Commands.sol, Actions.sol)
const V4_SWAP = 0x10
const SWAP_EXACT_IN_SINGLE = 0x06
const SETTLE_ALL = 0x0c
const TAKE_ALL = 0x0f

const poolKeyComponents = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const

/**
 * One exact-input swap through a single v4 pool: pay `amountIn` of the input currency (pulled
 * through Permit2), receive at least `minAmountOut` of the other, both to and from the caller.
 */
export function encodeV4SwapExactInSingle(input: {
  poolKey: PoolKey
  zeroForOne: boolean
  amountIn: bigint
  minAmountOut: bigint
  deadline: bigint
}) {
  const { poolKey, zeroForOne, amountIn, minAmountOut } = input
  const currencyIn = zeroForOne ? poolKey.currency0 : poolKey.currency1
  const currencyOut = zeroForOne ? poolKey.currency1 : poolKey.currency0
  const actions = encodePacked(
    ['uint8', 'uint8', 'uint8'],
    [SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL],
  )
  const params = [
    encodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [
            { name: 'poolKey', type: 'tuple', components: poolKeyComponents },
            { name: 'zeroForOne', type: 'bool' },
            { name: 'amountIn', type: 'uint128' },
            { name: 'amountOutMinimum', type: 'uint128' },
            // Universal Router 2.1.2's v4-periphery added a per-hop price floor here; without
            // the field the router misreads hookData and reverts with no reason (checked on a
            // fork, 2026-10-09). Zero turns it off: amountOutMinimum already bounds the swap.
            { name: 'minHopPriceX36', type: 'uint256' },
            { name: 'hookData', type: 'bytes' },
          ],
        },
      ],
      [
        {
          poolKey,
          zeroForOne,
          amountIn,
          amountOutMinimum: minAmountOut,
          minHopPriceX36: 0n,
          hookData: '0x',
        },
      ],
    ),
    encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [currencyIn, amountIn]),
    encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [currencyOut, minAmountOut]),
  ]
  const swapInput = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, params])
  return encodeFunctionData({
    abi: universalRouterAbi,
    functionName: 'execute',
    args: [encodePacked(['uint8'], [V4_SWAP]), [swapInput], input.deadline],
  })
}

/** Earn: put `assets` of cash into a lending vault, shares to `receiver` (the caller's account) */
export const encodeVaultDeposit = (assets: bigint, receiver: Address) =>
  encodeFunctionData({ abi: vaultAbi, functionName: 'deposit', args: [assets, receiver] })

/** Earn: take exactly `assets` of cash out of a lending vault, from and to the caller's account */
export const encodeVaultWithdraw = (assets: bigint, account: Address) =>
  encodeFunctionData({ abi: vaultAbi, functionName: 'withdraw', args: [assets, account, account] })

/** Earn: cash out every share the account holds (leaves no dust behind, unlike withdraw) */
export const encodeVaultRedeem = (shares: bigint, account: Address) =>
  encodeFunctionData({ abi: vaultAbi, functionName: 'redeem', args: [shares, account, account] })

export type MorphoMarketParams = {
  loanToken: Address
  collateralToken: Address
  oracle: Address
  irm: Address
  lltv: bigint
}

/** Borrow: lock `assets` of a stock as collateral for the caller's own position */
export const encodeSupplyCollateral = (
  params: MorphoMarketParams,
  assets: bigint,
  account: Address,
) =>
  encodeFunctionData({
    abi: morphoBlueAbi,
    functionName: 'supplyCollateral',
    args: [params, assets, account, '0x'],
  })

/** Borrow: take `assets` of cash against the caller's collateral, to the caller */
export const encodeBorrow = (params: MorphoMarketParams, assets: bigint, account: Address) =>
  encodeFunctionData({
    abi: morphoBlueAbi,
    functionName: 'borrow',
    args: [params, assets, 0n, account, account],
  })

/** Borrow: pay back either exact `assets`, or every borrow share (`shares`) to close the loan */
export const encodeRepay = (
  params: MorphoMarketParams,
  amount: { assets: bigint } | { shares: bigint },
  account: Address,
) =>
  encodeFunctionData({
    abi: morphoBlueAbi,
    functionName: 'repay',
    args: [
      params,
      'assets' in amount ? amount.assets : 0n,
      'shares' in amount ? amount.shares : 0n,
      account,
      '0x',
    ],
  })

/** Borrow: take locked shares back out, to the caller */
export const encodeWithdrawCollateral = (
  params: MorphoMarketParams,
  assets: bigint,
  account: Address,
) =>
  encodeFunctionData({
    abi: morphoBlueAbi,
    functionName: 'withdrawCollateral',
    args: [params, assets, account, account],
  })
