import { z } from 'zod'
import { privateKeySchema } from '@/lib/hex'

// Server-only config, read once from process.env. Every key is optional at parse time so one
// missing service (say, email) doesn't take down routes that never touch it: optional features
// stay off when unset, and `required()` fails only the request that needs the key.
const schema = z.object({
  VITE_APP_URL: z.url().default('http://localhost:4321'),
  VITE_PRIVY_APP_ID: z.string().min(1).optional(),
  PRIVY_APP_SECRET: z.string().min(1).optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  ROBINHOOD_RPC_URL: z.url().optional(),
  BUNDLER_URL: z.url().optional(),
  PAYMASTER_SIGNER_KEY: privateKeySchema.optional(),
  OPS_PRIVATE_KEY: privateKeySchema.optional(),
  TREASURY_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
  CRON_SECRET: z.string().min(16).optional(),
  TRADE_FEE_BPS: z.coerce.number().int().min(0).max(100).optional(),
  VITE_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  // Sender for every email; its domain must be verified in Resend
  EMAIL_FROM: z.string().min(3).default('Holdsake <hello@holdsake.app>'),
  // Company descriptions and daily closes; unset leaves those sections off the stock page
  FMP_API_KEY: z.string().optional(),
  VITE_POSTHOG_PROJECT_TOKEN: z.string().optional(),
  VITE_POSTHOG_HOST: z.string().optional(),
})

export type Env = z.infer<typeof schema>

let cached: Env | undefined

/** Empty strings in .env mean "unset", not "set to nothing" */
export function env(): Env {
  if (cached) return cached
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
  )
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    // Names only: values may be secrets
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Server config is missing or invalid: ${missing}`)
  }
  cached = parsed.data
  return cached
}

/** A key the current request can't do without */
export function required<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key]
  if (value === undefined) throw new Error(`Server config is missing ${key}`)
  return value
}
