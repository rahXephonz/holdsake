import type { Hex } from 'viem'
import { z } from 'zod'

/** 0x-prefixed hex that types as viem's `Hex` without a cast */
export const hexSchema = z.custom<Hex>(
  (value) => typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value),
)

export const privateKeySchema = z.custom<Hex>(
  (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value),
)
