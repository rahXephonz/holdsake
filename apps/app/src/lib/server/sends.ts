import { deployments, encodeTransfer, STOCK_TOKEN_LIST, USDG } from '@holdsake/sdk'
import { getAddress, isAddress, isAddressEqual, type Address } from 'viem'
import { CASH_ADDRESS, cashDecimals, chargeableFeed, findGiftAsset } from '@/lib/server/catalog'
import { chain } from '@/lib/server/chain'
import { badRequest } from '@/lib/server/http'
import { buildOperation, type Call } from '@/lib/server/operations'
import { microUsdToRaw } from '@/lib/server/prices'
import { db } from '@/lib/server/supabase'
import { balancesOf } from '@/lib/server/tokens'
import { treasury } from '@/lib/server/treasury'
import { userByHandle } from '@/lib/server/recipients'
import type { UserRow } from '@/lib/server/users'
import { HANDLE_PATTERN, normalizeHandle } from '@/lib/handles'

/** Never a destination: our own contracts and token contracts swallow what's sent to them */
function isForbiddenDestination(address: Address): boolean {
  const ours = [
    ...deployments.gifts,
    ...deployments.funds,
    ...deployments.paymaster,
    ...deployments.tokenList,
    USDG,
    ...STOCK_TOKEN_LIST.map((token) => token.address),
  ]
  return ours.some((candidate) => isAddressEqual(candidate, address))
}

export async function validateDestination(value: string, sender: Address): Promise<Address> {
  // Someone on Holdsake, by @username: only people who already have an account, never a new one
  if (value.startsWith('@')) {
    const handle = normalizeHandle(value)
    const user = HANDLE_PATTERN.test(handle) ? await userByHandle(handle) : null
    if (!user?.wallet_address)
      throw badRequest('No one on Holdsake has that username.', 'unknown_handle')
    const wallet = getAddress(user.wallet_address)
    if (isAddressEqual(wallet, sender)) throw badRequest('That’s your own account.', 'self_send')
    return wallet
  }
  if (!isAddress(value, { strict: false }))
    throw badRequest('That address doesn’t look right.', 'bad_address')
  const destination = getAddress(value)
  if (isAddressEqual(destination, sender)) throw badRequest('That’s your own account.', 'self_send')
  if (isForbiddenDestination(destination))
    throw badRequest('That address can’t receive anything. Check it and try again.', 'bad_address')
  // A contract that isn't an account may not be able to send it back out
  const code = await chain().getCode({ address: destination })
  if (code && code !== '0x' && !code.toLowerCase().startsWith('0xef0100'))
    throw badRequest('That address can’t receive this. Check it and try again.', 'bad_address')
  return destination
}

/**
 * A plain transfer out of the person's own account, plus the fee: from cash when there's enough
 * left after the send, otherwise from the same stock at its Chainlink price
 */
export async function buildSend(input: {
  user: UserRow
  sender: Address
  token: string
  destination: Address
  amountRaw: bigint
}) {
  const { user, sender, destination, amountRaw } = input
  const asset = await findGiftAsset(input.token)
  if (!asset) throw badRequest('We don’t offer that stock.', 'unknown_token')
  const token = asset.kind === 'cash' ? CASH_ADDRESS : asset.stock.address
  const [tokenBalance = 0n, cashBalance = 0n] = await balancesOf(sender, [token, CASH_ADDRESS])
  if (amountRaw <= 0n || amountRaw > tokenBalance)
    throw badRequest('You don’t have that much.', 'insufficient_balance')
  const decimals = await cashDecimals()

  const sendId = crypto.randomUUID()
  // What actually goes out; less than asked when the fee has to come out of it
  let sentRaw = amountRaw
  let feePaidRaw = 0n
  const built = await buildOperation({
    user,
    sender,
    kind: 'send',
    context: { sendId },
    callsWithFee: (feeRaw) => {
      sentRaw = amountRaw
      feePaidRaw = feeRaw
      const transfer: Call = { to: token, data: encodeTransfer(destination, amountRaw) }
      const cashLeft = asset.kind === 'cash' ? cashBalance - amountRaw : cashBalance
      if (cashLeft >= feeRaw)
        return [transfer, { to: CASH_ADDRESS, data: encodeTransfer(treasury(), feeRaw) }]
      // Sending cash with too little left over (say, all of it): the fee comes out of what's
      // sent, like a gift's cash (AGENT.md "Who pays the fee"), so "send everything" works
      if (asset.kind === 'cash') {
        const shortfall = feeRaw - cashLeft
        if (amountRaw > shortfall) {
          sentRaw = amountRaw - shortfall
          return [
            { to: token, data: encodeTransfer(destination, sentRaw) },
            { to: CASH_ADDRESS, data: encodeTransfer(treasury(), feeRaw) },
          ]
        }
      }
      const feed = asset.kind === 'stock' ? chargeableFeed(asset.stock) : null
      if (asset.kind === 'stock' && feed) {
        const feeStock = microUsdToRaw(
          (feeRaw * 10n ** 6n) / 10n ** BigInt(decimals),
          asset.stock.decimals,
          feed,
        )
        if (amountRaw + feeStock <= tokenBalance)
          return [transfer, { to: token, data: encodeTransfer(treasury(), feeStock) }]
      }
      throw badRequest('Not enough cash to cover the fee.', 'fee_shortfall')
    },
  })

  const { error } = await db().from('sends').insert({
    id: sendId,
    user_id: user.id,
    token: token.toLowerCase(),
    destination: destination.toLowerCase(),
    amount_raw: sentRaw.toString(),
    operation_id: built.operationId,
  })
  if (error) throw error
  // The screen shows what actually arrives and the fee, which can differ from what was typed
  return { ...built, send: { sentRaw: sentRaw.toString(), feeRaw: feePaidRaw.toString() } }
}

export async function afterSend(sendId: string, success: boolean, txHash: string) {
  await db()
    .from('sends')
    .update({ status: success ? 'confirmed' : 'failed', tx_hash: txHash })
    .eq('id', sendId)
}
