import { deployments } from '@holdsake/sdk'
import {
  concat,
  encodeAbiParameters,
  keccak256,
  numberToHex,
  pad,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { required } from '@/lib/server/env'
import { HttpError } from '@/lib/server/http'
import type { OperationKind } from '@/lib/server/operations'

/**
 * Gas caps per flow, checked before the server signs a sponsorship. Execution numbers come from
 * "Limits you'll hit" (worst case: createGift with 3 stocks + cash at 587k) plus the 7702 account
 * and EntryPoint overhead, with room for a first-time delegation. `preVerificationGas` is capped
 * apart: on this chain it carries the L1 data cost and moves with L1 prices.
 */
export const GAS_CAPS: Record<OperationKind, { execution: bigint; preVerification: bigint }> = {
  gift_create: { execution: 1_600_000n, preVerification: 3_000_000n },
  gift_claim: { execution: 700_000n, preVerification: 3_000_000n },
  gift_refund: { execution: 700_000n, preVerification: 3_000_000n },
  fund_create: { execution: 900_000n, preVerification: 3_000_000n },
  // Up to three swaps plus three deposits when cash buys the mix
  fund_contribute: { execution: 2_600_000n, preVerification: 3_000_000n },
  fund_withdraw: { execution: 700_000n, preVerification: 3_000_000n },
  trade: { execution: 1_600_000n, preVerification: 3_000_000n },
  send: { execution: 500_000n, preVerification: 3_000_000n },
  // Vault V2 moves cash through its adapter into Morpho and back; a claim adds a swap on top
  earn_deposit: { execution: 900_000n, preVerification: 3_000_000n },
  earn_withdraw: { execution: 900_000n, preVerification: 3_000_000n },
  earn_claim: { execution: 2_000_000n, preVerification: 3_000_000n },
  // Morpho: lock + borrow measured ~240k on a fork, repay ~105k, take back ~90k
  borrow_open: { execution: 800_000n, preVerification: 3_000_000n },
  borrow_repay: { execution: 600_000n, preVerification: 3_000_000n },
  borrow_withdraw: { execution: 600_000n, preVerification: 3_000_000n },
}

/** Fixed gas the paymaster's own validation needs; it has no postOp */
export const PAYMASTER_VERIFICATION_GAS = 60_000n
export const PAYMASTER_POST_OP_GAS = 0n

/** How long a signed sponsorship stays good: long enough to sign, short enough to not linger */
export const SPONSORSHIP_TTL_SECONDS = 300

/** Past this many reverted sponsored operations, a person pays nothing more from us */
export const MAX_FAILED_OPS = 3

/** The newest paymaster version; older ones are drained by the multisig, never used again */
export function currentPaymaster(): Address {
  const address = deployments.paymaster.at(-1)
  if (!address) throw new HttpError(503, 'not_open', 'Sending isn’t open yet. Try again soon.')
  return address
}

export type SponsoredFields = {
  sender: Address
  nonce: bigint
  /** The packed initCode exactly as the EntryPoint sees it ("0x" once the account is delegated) */
  initCode: Hex
  callData: Hex
  verificationGasLimit: bigint
  callGasLimit: bigint
  preVerificationGas: bigint
  maxPriorityFeePerGas: bigint
  maxFeePerGas: bigint
  paymasterVerificationGasLimit: bigint
  paymasterPostOpGasLimit: bigint
}

/** Two uint128s packed high|low into one word, the way the EntryPoint packs gas fields */
const pack128 = (high: bigint, low: bigint) =>
  BigInt(concat([pad(numberToHex(high), { size: 16 }), pad(numberToHex(low), { size: 16 })]))

/** Mirrors HoldsakePaymaster.getHash field for field; a drift fails every sponsorship (AA34) */
export function sponsorshipHash(
  op: SponsoredFields,
  paymaster: Address,
  chainId: number,
  validUntil: number,
  validAfter: number,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'uint48' },
        { type: 'uint48' },
      ],
      [
        op.sender,
        op.nonce,
        keccak256(op.initCode),
        keccak256(op.callData),
        pad(numberToHex(pack128(op.verificationGasLimit, op.callGasLimit)), { size: 32 }),
        pack128(op.paymasterVerificationGasLimit, op.paymasterPostOpGasLimit),
        op.preVerificationGas,
        pad(numberToHex(pack128(op.maxPriorityFeePerGas, op.maxFeePerGas)), { size: 32 }),
        BigInt(chainId),
        paymaster,
        validUntil,
        validAfter,
      ],
    ),
  )
}

/** `validUntil (6) | validAfter (6) | signature (65)`, the part after the gas limits */
export async function signSponsorship(
  op: SponsoredFields,
  paymaster: Address,
  chainId: number,
  validUntil: number,
): Promise<Hex> {
  const validAfter = 0
  const signer = privateKeyToAccount(required('PAYMASTER_SIGNER_KEY'))
  const signature = await signer.signMessage({
    message: { raw: sponsorshipHash(op, paymaster, chainId, validUntil, validAfter) },
  })
  return concat([
    pad(numberToHex(validUntil), { size: 6 }),
    pad(numberToHex(validAfter), { size: 6 }),
    signature,
  ])
}

/** Stub of the same length for gas estimation: a real-length signature that won't recover */
export function stubSponsorship(validUntil: number): Hex {
  return concat([
    pad(numberToHex(validUntil), { size: 6 }),
    pad('0x', { size: 6 }),
    `0x${'ff'.repeat(32)}${'7a'.repeat(32)}1c`,
  ])
}
