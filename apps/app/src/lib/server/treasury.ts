import { getAddress, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { env } from '@/lib/server/env'
import { HttpError } from '@/lib/server/http'

/** Where fees go: TREASURY_ADDRESS, or the ops wallet when it's unset */
export function treasury(): Address {
  const { TREASURY_ADDRESS, OPS_PRIVATE_KEY } = env()
  if (TREASURY_ADDRESS) return getAddress(TREASURY_ADDRESS)
  if (OPS_PRIVATE_KEY) return privateKeyToAccount(OPS_PRIVATE_KEY).address
  throw new HttpError(503, 'not_open', 'Sending isn’t open yet. Try again soon.')
}
