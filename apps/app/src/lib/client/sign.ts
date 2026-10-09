import { ENTRY_POINT_V08, SIMPLE_7702_ACCOUNT, robinhoodChain } from '@holdsake/sdk'
import { toViemAccount, useWallets } from '@privy-io/react-auth'
import { useCallback } from 'react'
import { getUserOperationTypedData } from 'viem/account-abstraction'
import { useApi, UserFacingError } from '@/lib/client/api'
import { useEnsureWallet } from '@/lib/client/wallet'
import type { SignRequest, SubmitResult } from '@/lib/types'
import { deserializeUserOperation } from '@/lib/user-operation'

/**
 * Signs a server-built operation with the person's embedded account (no Privy UI) and hands it
 * back to `submit`. The first time, it also signs the one-off delegation to the pinned account
 * implementation; the server refuses any other target.
 *
 * Signing goes through the embedded wallet's own viem account, not Privy's signing hooks: those
 * wait for `useWallets().ready`, which never turns true while external wallets are disabled
 * (Privy 3.47–3.48 only marks it after an external connector initialises, and with them off
 * there are none). The account signs through the same embedded provider either way.
 */
export function useSignAndSubmit() {
  const api = useApi()
  const wallet = useEnsureWallet()
  const { wallets } = useWallets()

  return useCallback(
    async (request: SignRequest) => {
      const address = wallet.address
      const embedded =
        address &&
        wallets.find(
          (item) =>
            item.walletClientType === 'privy' &&
            item.address.toLowerCase() === address.toLowerCase(),
        )
      if (!address || !embedded)
        throw new UserFacingError('Your account is still loading. Try again in a moment.')
      if (request.authorization && request.authorization.contractAddress !== SIMPLE_7702_ACCOUNT)
        throw new UserFacingError('Something didn’t match. Try again.')

      const account = await toViemAccount({ wallet: embedded })

      const authorization = request.authorization
        ? await account.signAuthorization?.({
            contractAddress: SIMPLE_7702_ACCOUNT,
            chainId: request.authorization.chainId,
            nonce: request.authorization.nonce,
          })
        : undefined
      if (request.authorization && !authorization)
        throw new UserFacingError('Your account can’t do this yet. Try again in a moment.')

      const op = deserializeUserOperation(request.userOperation)
      const typedData = getUserOperationTypedData({
        chainId: robinhoodChain.id,
        entryPointAddress: ENTRY_POINT_V08,
        userOperation: {
          ...op,
          signature: '0x',
          authorization: authorization
            ? { ...authorization, address: SIMPLE_7702_ACCOUNT }
            : undefined,
        },
      })
      // Privy's provider JSON-encodes the request, and JSON has no bigint: uint fields go as
      // decimal strings, which EIP-712 encodes to the same bytes
      const signature = await account.signTypedData({
        ...typedData,
        message: withoutBigints(typedData.message),
      })

      return api<SubmitResult>(`/api/operations/${request.operationId}/submit`, {
        method: 'POST',
        body: {
          signature,
          authorization: authorization && {
            address: authorization.address,
            chainId: authorization.chainId,
            nonce: authorization.nonce,
            r: authorization.r,
            s: authorization.s,
            yParity: authorization.yParity,
          },
        },
      })
    },
    [api, wallet.address, wallets],
  )
}

/** Same shape with every bigint as a decimal string */
function withoutBigints<T>(value: T): T {
  // oxlint-disable-next-line typescript/no-unsafe-return
  return JSON.parse(
    JSON.stringify(value, (_, item: unknown) =>
      typeof item === 'bigint' ? item.toString() : item,
    ),
  )
}
