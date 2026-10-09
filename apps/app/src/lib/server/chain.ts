import { robinhoodChain } from '@holdsake/sdk'
import { createPublicClient, http, type PublicClient } from 'viem'
import { required } from '@/lib/server/env'

let client: PublicClient | undefined

/** Reads over the configured RPC. The URL may carry an API key, so it is never logged */
export function chain(): PublicClient {
  client ??= createPublicClient({
    chain: robinhoodChain,
    transport: http(required('ROBINHOOD_RPC_URL'), { batch: { wait: 10 }, retryCount: 2 }),
    batch: { multicall: true },
  }) as PublicClient
  return client
}
