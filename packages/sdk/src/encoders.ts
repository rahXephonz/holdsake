import { encodeFunctionData, type Address } from 'viem'
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
