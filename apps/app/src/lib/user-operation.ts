import type { UserOperation } from 'viem/account-abstraction'
import { z } from 'zod'
import { hexSchema } from '@/lib/hex'

// A user operation crosses the wire (and sits in the database) as strings; both sides read it
// back through the same schema, so a malformed one fails loudly instead of signing garbage.

const bigintString = z
  .string()
  .regex(/^[0-9]+$/)
  .transform(BigInt)

const storedSchema = z.object({
  sender: hexSchema,
  nonce: bigintString,
  factory: hexSchema.optional(),
  factoryData: hexSchema.optional(),
  callData: hexSchema,
  callGasLimit: bigintString,
  verificationGasLimit: bigintString,
  preVerificationGas: bigintString,
  maxFeePerGas: bigintString,
  maxPriorityFeePerGas: bigintString,
  paymaster: hexSchema.optional(),
  paymasterVerificationGasLimit: bigintString.optional(),
  paymasterPostOpGasLimit: bigintString.optional(),
  paymasterData: hexSchema.optional(),
  signature: hexSchema,
})

export function serializeUserOperation(op: UserOperation<'0.8'>): Record<string, string> {
  const stored: Record<string, string> = {}
  for (const [key, value] of Object.entries(op)) {
    if (!(key in storedSchema.shape)) continue
    if (typeof value === 'string' || typeof value === 'bigint') stored[key] = value.toString()
  }
  return stored
}

export const deserializeUserOperation = (stored: Record<string, string>): UserOperation<'0.8'> =>
  storedSchema.parse(stored)
