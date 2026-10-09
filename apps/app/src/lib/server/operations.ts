import { ENTRY_POINT_V08, SIMPLE_7702_ACCOUNT, robinhoodChain } from '@holdsake/sdk'
import {
  concat,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  getAddress,
  isAddressEqual,
  pad,
  parseEther,
  parseEventLogs,
  recoverTypedDataAddress,
  type Account,
  type Address,
  type Hex,
  type Log,
  type SignedAuthorization,
  type WalletClient,
} from 'viem'
import {
  createBundlerClient,
  entryPoint08Abi,
  getUserOperationHash,
  getUserOperationTypedData,
  toPackedUserOperation,
  toSimple7702SmartAccount,
  type BundlerClient,
  type UserOperation,
} from 'viem/account-abstraction'
import { http, type Transport } from 'viem'
import { privateKeyToAccount, toAccount } from 'viem/accounts'
import { recoverAuthorizationAddress } from 'viem/utils'
import { z } from 'zod'
import { hexSchema } from '@/lib/hex'
import { chain } from '@/lib/server/chain'
import { required } from '@/lib/server/env'
import { expectedGasUsed, gasFeeInCash } from '@/lib/server/fees'
import { badRequest, conflict, forbidden, HttpError, logError, notFound } from '@/lib/server/http'
import {
  currentPaymaster,
  GAS_CAPS,
  MAX_FAILED_OPS,
  PAYMASTER_POST_OP_GAS,
  PAYMASTER_VERIFICATION_GAS,
  signSponsorship,
  SPONSORSHIP_TTL_SECONDS,
  stubSponsorship,
  type SponsoredFields,
} from '@/lib/server/paymaster'
import { db } from '@/lib/server/supabase'
import type { UserRow } from '@/lib/server/users'
import type { SignRequest } from '@/lib/types'
import { deserializeUserOperation, serializeUserOperation } from '@/lib/user-operation'

// Every on-chain action runs the same three steps (AGENT.md "Signing and gas"): the server
// builds the batch and records it as a draft, the browser signs it with no UI, and `submit`
// sends exactly what was recorded. The browser contributes only signatures, so the submit
// checks reduce to "is this the draft, signed by its sender, still valid".

export type OperationKind =
  | 'gift_create'
  | 'gift_claim'
  | 'gift_refund'
  | 'fund_create'
  | 'fund_contribute'
  | 'fund_withdraw'
  | 'trade'
  | 'send'
  | 'earn_deposit'
  | 'earn_withdraw'
  | 'earn_claim'
  | 'borrow_open'
  | 'borrow_repay'
  | 'borrow_withdraw'

export type Call = { to: Address; data: Hex; value?: bigint }

const DELEGATION_PREFIX = '0xef0100'

let bundler: BundlerClient | undefined

/** Alchemy's own method, outside viem's typed RPC schema */
async function rundlerPriorityFee(): Promise<Hex> {
  const response = await fetch(required('BUNDLER_URL'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'rundler_maxPriorityFeePerGas',
      params: [],
    }),
  })
  const body: unknown = await response.json()
  const result = z.object({ result: hexSchema }).safeParse(body)
  if (!result.success) throw new Error('Bundler gave no priority fee')
  return result.data.result
}

const FACTORY_7702 = pad('0x7702', { dir: 'right', size: 20 })

/**
 * viem marks a first-time 7702 operation with `factory: "0x7702"`, but Alchemy's bundler rejects
 * anything shorter than an address ("wrong address length"). EntryPoint v0.8 reads the marker
 * from the first 20 bytes of initCode either way, so the padded form is the same operation.
 */
function paddedFactoryTransport(url: string): Transport {
  const base = http(url)
  return (config) => {
    const transport = base(config)
    const request: typeof transport.request = async ({ method, params }) => {
      const [op, ...rest] = Array.isArray(params) ? params : []
      const fixed =
        USER_OP_METHODS.has(method) && isRecord(op) && op.factory === '0x7702'
          ? [{ ...op, factory: FACTORY_7702 }, ...rest]
          : params
      return transport.request({ method, params: fixed })
    }
    return { ...transport, request }
  }
}

const USER_OP_METHODS = new Set(['eth_estimateUserOperationGas', 'eth_sendUserOperation'])
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

let ops: WalletClient<Transport, typeof robinhoodChain, Account> | undefined

/** The server's hot wallet (OPS_PRIVATE_KEY); here it only ever calls EntryPoint.handleOps */
function opsWallet() {
  ops ??= createWalletClient({
    account: privateKeyToAccount(required('OPS_PRIVATE_KEY')),
    chain: robinhoodChain,
    transport: http(required('ROBINHOOD_RPC_URL')),
  })
  return ops
}

/** Failed before anything reached the chain: nothing was spent, the row can say so */
class NotSentError extends Error {
  constructor(cause: unknown) {
    super('not sent', { cause })
  }
}

// Enough for a few sends; below this we'd rather refuse up front than send and stall
const OPS_MIN_BALANCE = parseEther('0.0001')

/**
 * Sends one already-checked operation to the EntryPoint ourselves, with the ops wallet as the
 * bundle's beneficiary. Alchemy's bundler accepts operations on this chain but never included
 * one carrying a 7702 authorization (2026-10-09: valid op, handleOps simulated fine, never
 * mined), so we bundle our own. The EntryPoint pays the beneficiary from the paymaster's
 * deposit, so the wallet only floats each send's gas.
 */
async function selfBundle(
  signed: UserOperation<'0.8'>,
  userOpHash: Hex,
): Promise<{ txHash: Hex; success: boolean; logs: Log[] }> {
  const wallet = opsWallet()
  const packed = toPackedUserOperation({
    ...signed,
    // The EntryPoint reads the 7702 marker from the first 20 bytes of initCode
    factory: signed.factory === '0x7702' ? FACTORY_7702 : signed.factory,
  })
  const request = {
    to: ENTRY_POINT_V08,
    data: encodeFunctionData({
      abi: entryPoint08Abi,
      functionName: 'handleOps',
      args: [[packed], wallet.account.address],
    }),
    authorizationList: signed.authorization ? [signed.authorization] : undefined,
  }
  // Estimated here and passed in: when a wallet client estimates on its own, viem 2.57 leaves the
  // authorization out of the estimate, so a first-time send reverts with "sender has no code"
  let gas: bigint
  try {
    gas = await chain().estimateGas({ ...request, account: wallet.account.address })
  } catch (error) {
    throw new NotSentError(error)
  }
  const txHash = await wallet.sendTransaction({ ...request, gas: (gas * 120n) / 100n })
  const receipt = await chain().waitForTransactionReceipt({ hash: txHash, timeout: 60_000 })
  const [event] = parseEventLogs({
    abi: entryPoint08Abi,
    eventName: 'UserOperationEvent',
    logs: receipt.logs,
  }).filter((log) => log.args.userOpHash.toLowerCase() === userOpHash.toLowerCase())
  return {
    txHash,
    success: receipt.status === 'success' && event?.args.success === true,
    logs: receipt.logs,
  }
}

function bundlerClient(): BundlerClient {
  bundler ??= createBundlerClient({
    client: chain(),
    chain: robinhoodChain,
    transport: paddedFactoryTransport(required('BUNDLER_URL')),
    userOperation: {
      // Alchemy wants its own priority fee; the base fee gets 15% headroom for the next block
      async estimateFeesPerGas() {
        const [block, priority] = await Promise.all([chain().getBlock(), rundlerPriorityFee()])
        const maxPriorityFeePerGas = BigInt(priority)
        const baseFee = block.baseFeePerGas ?? 0n
        return {
          maxPriorityFeePerGas,
          maxFeePerGas: (baseFee * 115n) / 100n + maxPriorityFeePerGas,
        }
      },
    },
  })
  return bundler
}

/** Delegated to the one pinned implementation; anything else is not an account we sponsor */
export async function delegationOf(address: Address): Promise<'none' | 'ours' | 'other'> {
  const code = await chain().getCode({ address })
  if (!code || code === '0x') return 'none'
  if (code.toLowerCase() === concat([DELEGATION_PREFIX, SIMPLE_7702_ACCOUNT]).toLowerCase())
    return 'ours'
  return 'other'
}

/** The server never holds the person's key: this owner can only say who it is */
const cannotSign = async (): Promise<never> => {
  throw new Error('The server never signs for a person')
}

function accountFor(sender: Address) {
  return toSimple7702SmartAccount({
    client: chain(),
    owner: {
      ...toAccount({
        address: sender,
        signMessage: cannotSign,
        signTransaction: cannotSign,
        signTypedData: cannotSign,
      }),
      sign: cannotSign,
      signAuthorization: cannotSign,
      // viem's 7702 account wants a key-backed owner; this one has no key behind it
      source: 'privateKey' as const,
      publicKey: '0x',
    },
    implementation: SIMPLE_7702_ACCOUNT,
  })
}

/** The packed initCode the EntryPoint and our paymaster see: the 20-byte 7702 marker, or empty */
const packedInitCode = (op: Pick<UserOperation<'0.8'>, 'factory' | 'factoryData'>): Hex =>
  op.factory
    ? concat([op.factory === '0x7702' ? FACTORY_7702 : op.factory, op.factoryData ?? '0x'])
    : '0x'

const totalGas = (op: UserOperation<'0.8'>) =>
  op.verificationGasLimit +
  op.callGasLimit +
  op.preVerificationGas +
  (op.paymasterVerificationGasLimit ?? 0n) +
  (op.paymasterPostOpGasLimit ?? 0n)

/**
 * Builds, prices and signs the sponsorship for one operation, and records it as a draft.
 * `callsWithFee` returns the whole batch for a given fee (in raw cash units), so each flow decides
 * who pays it (AGENT.md "Who pays the fee"); it may throw to refuse before anything is signed.
 */
export async function buildOperation(input: {
  user: UserRow
  sender: Address
  kind: OperationKind
  callsWithFee: (feeRaw: bigint) => Promise<Call[]> | Call[]
  /** Ids of the flow's own rows, so `submit` can find them again */
  context?: Record<string, unknown>
}): Promise<SignRequest & { userOpHash: Hex }> {
  const { user, sender, kind } = input
  if (user.failed_ops >= MAX_FAILED_OPS)
    throw forbidden('We can’t send this for you right now. Contact support.', 'sponsor_paused')

  const delegation = await delegationOf(sender)
  if (delegation === 'other')
    throw forbidden('This account is set up in a way we can’t send from.', 'foreign_delegation')

  const paymaster = currentPaymaster()
  const validUntil = Math.floor(Date.now() / 1000) + SPONSORSHIP_TTL_SECONDS
  const account = await accountFor(sender)
  const client = bundlerClient()

  // First pass with a placeholder fee, to measure gas. Kept tiny ($0.01): flows refuse a fee
  // bigger than the cash on hand, and a $0.99 placeholder turned away anyone holding less than
  // that even though the real fee is a few cents. The amount doesn't change the transfer's gas.
  const placeholderCalls = await input.callsWithFee(10_000n)
  const prepared = (await client
    .prepareUserOperation({
      account,
      calls: placeholderCalls,
      paymaster: {
        async getPaymasterStubData() {
          return {
            paymaster,
            paymasterData: stubSponsorship(validUntil),
            paymasterVerificationGasLimit: PAYMASTER_VERIFICATION_GAS,
            paymasterPostOpGasLimit: PAYMASTER_POST_OP_GAS,
          }
        },
        async getPaymasterData() {
          return {
            paymaster,
            paymasterData: stubSponsorship(validUntil),
            paymasterVerificationGasLimit: PAYMASTER_VERIFICATION_GAS,
            paymasterPostOpGasLimit: PAYMASTER_POST_OP_GAS,
          }
        },
      },
    })
    // A revert while measuring means the batch would fail on-chain too: refuse before signing,
    // in words, instead of passing the library's calldata dump to the screen
    .catch((error: unknown) => {
      logError(`estimate failed (${kind})`, error)
      throw badRequest(
        'This can’t go through right now. Try a different amount, or try again later.',
        'estimate_failed',
      )
    })) as UserOperation<'0.8'>

  const caps = GAS_CAPS[kind]
  const execution = prepared.verificationGasLimit + prepared.callGasLimit
  if (execution > caps.execution || prepared.preVerificationGas > caps.preVerification)
    throw new HttpError(503, 'too_costly', 'This costs more to send than usual. Try again later.')

  const feeRaw = await gasFeeInCash({
    gasUnits: expectedGasUsed(totalGas(prepared)),
    // Today's price; the fee adds its own buffer (fees.ts)
    maxFeePerGas: await chain().getGasPrice(),
  })
  const calls = await input.callsWithFee(feeRaw)
  const callData = await account.encodeCalls(
    calls.map((call) => ({ ...call, value: call.value ?? 0n })),
  )

  const op: UserOperation<'0.8'> = { ...prepared, callData, signature: '0x' }
  const fields: SponsoredFields = {
    sender,
    nonce: op.nonce,
    initCode: packedInitCode(op),
    callData,
    verificationGasLimit: op.verificationGasLimit,
    callGasLimit: op.callGasLimit,
    preVerificationGas: op.preVerificationGas,
    maxPriorityFeePerGas: op.maxPriorityFeePerGas,
    maxFeePerGas: op.maxFeePerGas,
    paymasterVerificationGasLimit: PAYMASTER_VERIFICATION_GAS,
    paymasterPostOpGasLimit: PAYMASTER_POST_OP_GAS,
  }
  op.paymasterData = await signSponsorship(fields, paymaster, robinhoodChain.id, validUntil)

  // The authorization nonce is the account's transaction count; the signed one must match it
  const authorization =
    delegation === 'none'
      ? {
          contractAddress: SIMPLE_7702_ACCOUNT,
          chainId: robinhoodChain.id,
          nonce: await chain().getTransactionCount({ address: sender }),
        }
      : null

  const userOpHash = getUserOperationHash({
    userOperation: {
      ...op,
      authorization: authorization
        ? {
            address: SIMPLE_7702_ACCOUNT,
            chainId: authorization.chainId,
            nonce: authorization.nonce,
            r: '0x',
            s: '0x',
            yParity: 0,
          }
        : undefined,
    },
    entryPointAddress: ENTRY_POINT_V08,
    entryPointVersion: '0.8',
    chainId: robinhoodChain.id,
  })

  const { data, error } = await db()
    .from('operations')
    .insert({
      user_id: user.id,
      sender: sender.toLowerCase(),
      kind,
      calls: calls.map((call) => ({
        to: call.to,
        data: call.data,
        value: (call.value ?? 0n).toString(),
      })),
      fee_raw: feeRaw.toString(),
      user_op: { op: serializeUserOperation(op), authorization, context: input.context ?? {} },
      user_op_hash: userOpHash,
      valid_until: new Date(validUntil * 1000).toISOString(),
    })
    .select('id')
    .single()
    .overrideTypes<{ id: string }, { merge: false }>()
  if (error) throw error

  return {
    operationId: data.id,
    userOperation: serializeUserOperation(op),
    authorization,
    feeRaw: feeRaw.toString(),
    userOpHash,
  }
}

export type OperationRow = {
  id: string
  user_id: string
  sender: string
  kind: OperationKind
  fee_raw: string
  user_op: {
    op: Record<string, string>
    authorization: SignRequest['authorization']
    context: Record<string, unknown>
  }
  user_op_hash: Hex
  valid_until: string
  status: 'draft' | 'sent' | 'confirmed' | 'failed' | 'expired'
  tx_hash: string | null
}

export async function loadOperation(id: string, user: UserRow): Promise<OperationRow> {
  const { data, error } = await db()
    .from('operations')
    .select(
      'id, user_id, sender, kind, fee_raw, user_op, user_op_hash, valid_until, status, tx_hash',
    )
    .eq('id', id)
    .maybeSingle()
    .overrideTypes<OperationRow | null, { merge: false }>()
  if (error) throw error
  if (!data || data.user_id !== user.id) throw notFound()
  return data
}

export type Submitted = {
  txHash: Hex
  success: boolean
  logs: Log[]
}

/**
 * Sends a recorded draft once the browser has signed it. Refuses anything that isn't that exact
 * operation, signed by its sender, delegated to the pinned implementation, and still in its
 * sponsorship window; simulates first so a doomed operation never costs us gas.
 */
export async function submitOperation(input: {
  operation: OperationRow
  user: UserRow
  signature: Hex
  authorization?: SignedAuthorization
}): Promise<Submitted> {
  const { operation, user, signature } = input
  if (operation.status !== 'draft') throw conflict('This was already sent.', 'already_sent')
  if (new Date(operation.valid_until).getTime() < Date.now() + 10_000) {
    await db().from('operations').update({ status: 'expired' }).eq('id', operation.id)
    throw badRequest('This took too long. Try again.', 'expired')
  }

  const sender = getAddress(operation.sender)
  const op = deserializeUserOperation(operation.user_op.op)
  if (!isAddressEqual(op.sender, sender)) throw forbidden('Not yours.')

  // Delegation: either it's already the pinned implementation, or this op carries a signed
  // authorization for exactly that implementation, chain and nonce, by the sender
  let authorization: SignedAuthorization | undefined
  const expected = operation.user_op.authorization
  if (expected) {
    const signed = input.authorization
    if (
      !signed ||
      !isAddressEqual(signed.address, SIMPLE_7702_ACCOUNT) ||
      signed.chainId !== expected.chainId ||
      signed.nonce !== expected.nonce
    )
      throw badRequest('Something didn’t match. Try again.', 'bad_authorization')
    const signer = await recoverAuthorizationAddress({ authorization: signed })
    if (!isAddressEqual(signer, sender))
      throw badRequest('Something didn’t match. Try again.', 'bad_authorization')
    authorization = signed
  } else if ((await delegationOf(sender)) !== 'ours') {
    throw forbidden('This account is set up in a way we can’t send from.', 'foreign_delegation')
  }

  const typedData = getUserOperationTypedData({
    chainId: robinhoodChain.id,
    entryPointAddress: ENTRY_POINT_V08,
    userOperation: { ...op, authorization, signature: '0x' },
  })
  const recovered = await recoverTypedDataAddress({ ...typedData, signature })
  if (!isAddressEqual(recovered, sender))
    throw badRequest('Something didn’t match. Try again.', 'bad_signature')

  const signed: UserOperation<'0.8'> = { ...op, signature, authorization }
  const client = bundlerClient()

  // Simulate execution against the latest state: a revert here costs nothing; on-chain it costs us
  try {
    await client.estimateUserOperationGas({ ...signed, entryPointAddress: ENTRY_POINT_V08 })
  } catch (error) {
    console.error('simulation failed', operation.id, error instanceof Error ? error.message : error)
    await db()
      .from('operations')
      .update({ status: 'failed', error: 'simulation' })
      .eq('id', operation.id)
    throw badRequest(
      'This can’t go through right now. Check your balance and try again.',
      'simulation_failed',
    )
  }

  const float = await chain().getBalance({ address: opsWallet().account.address })
  if (float < OPS_MIN_BALANCE) {
    logError('ops wallet low', `${formatEther(float)} ETH`)
    throw new HttpError(503, 'ops_low', 'We can’t send this right now. Try again later.')
  }

  // Claim the row before sending, so a double tap can't send twice
  const { data: claimed, error: claimError } = await db()
    .from('operations')
    .update({ status: 'sent' })
    .eq('id', operation.id)
    .eq('status', 'draft')
    .select('id')
  if (claimError) throw claimError
  if (!claimed?.length) throw conflict('This was already sent.', 'already_sent')

  let result: Awaited<ReturnType<typeof selfBundle>>
  try {
    result = await selfBundle(signed, operation.user_op_hash)
  } catch (error) {
    if (!(error instanceof NotSentError)) throw error
    logError('send failed before broadcast', error.cause)
    await db()
      .from('operations')
      .update({ status: 'failed', error: 'not_sent' })
      .eq('id', operation.id)
    throw new HttpError(502, 'not_sent', 'This didn’t go through. Nothing left your account.')
  }

  await db()
    .from('operations')
    .update({
      status: result.success ? 'confirmed' : 'failed',
      tx_hash: result.txHash,
      error: result.success ? null : 'reverted',
    })
    .eq('id', operation.id)
  if (!result.success)
    await db()
      .from('users')
      .update({ failed_ops: user.failed_ops + 1 })
      .eq('id', user.id)

  return result
}
