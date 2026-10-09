import { usePrivy } from '@privy-io/react-auth'
import { useCallback } from 'react'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export type ApiFetch = <T>(
  path: string,
  init?: Omit<RequestInit, 'body'> & { body?: unknown },
) => Promise<T>

/** Calls our server routes with the Privy access token attached */
export function useApi(): ApiFetch {
  const { getAccessToken } = usePrivy()

  return useCallback<ApiFetch>(
    async (path, { body, ...init } = {}) => {
      const headers = new Headers(init.headers)
      const token = await getAccessToken()
      if (token) headers.set('authorization', `Bearer ${token}`)

      let payload: BodyInit | undefined
      if (body instanceof FormData) {
        payload = body
      } else if (body !== undefined) {
        headers.set('content-type', 'application/json')
        payload = JSON.stringify(body)
      }

      const response = await fetch(path, { ...init, headers, body: payload })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new ApiError(
          response.status,
          data?.error ?? 'error',
          data?.message ?? 'Something went wrong. Try again.',
        )
      }
      return data
    },
    [getAccessToken],
  )
}

/** A message we wrote for people, safe to show as is (unlike errors from libraries) */
export class UserFacingError extends Error {}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof UserFacingError) return error.message
  // People get the plain line; while developing, the library's real reason is in the console
  if (import.meta.env.DEV) console.error('[holdsake]', error)
  return 'Something went wrong. Try again.'
}
