import { inspect } from 'node:util'
import type { z } from 'zod'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const badRequest = (message: string, code = 'bad_request') =>
  new HttpError(400, code, message)
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Sign in to continue.')
export const forbidden = (message: string, code = 'forbidden') => new HttpError(403, code, message)
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message)
export const conflict = (message: string, code = 'conflict') => new HttpError(409, code, message)
export const tooManyRequests = (message: string) => new HttpError(429, 'rate_limited', message)

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  headers.set('cache-control', 'no-store')
  return new Response(
    JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value)),
    { ...init, headers },
  )
}

// RPC and bundler URLs carry API keys, and viem puts the URL into its error text
const redactUrls = (text: string) => text.replaceAll(/https?:\/\/[^\s"'`<>]+/g, '[url]')

/** console.error for anything that may hold a library error: full detail, minus URLs */
export function logError(label: string, error: unknown) {
  console.error(label, redactUrls(inspect(error, { depth: 6 })))
}

type HandlerContext<P> = { request: Request; params: P }

/** Wraps a server route handler so thrown HttpErrors become JSON and anything else a logged 500 */
export function route<P = Record<string, string>>(
  handler: (context: HandlerContext<P>) => Promise<Response>,
) {
  return async (context: HandlerContext<P>): Promise<Response> => {
    try {
      return await handler(context)
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.code, message: error.message }, { status: error.status })
      }
      logError('route failed', error)
      return json(
        {
          error: 'internal',
          // Locally the real reason is worth more than a tidy message; in production it isn't ours to give
          message:
            import.meta.env.DEV && error instanceof Error
              ? redactUrls(error.message)
              : 'Something went wrong. Try again.',
        },
        { status: 500 },
      )
    }
  }
}

export async function readBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  const value = await request.json().catch(() => undefined)
  const result = schema.safeParse(value)
  if (!result.success) throw badRequest('Check the details and try again.')
  return result.data
}

/** Vercel sends CRON_SECRET as a bearer token; nothing else may run a cron */
export function requireCron(request: Request, secret: string | undefined): void {
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) throw unauthorized()
}
