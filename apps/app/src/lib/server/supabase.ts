import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { required } from '@/lib/server/env'

let client: SupabaseClient | undefined

/** Service-role client. Server only: every table has RLS with no public policies */
export function db(): SupabaseClient {
  client ??= createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

export const AVATAR_BUCKET = 'avatars'

export function avatarUrl(path: string | null): string | null {
  return path ? db().storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl : null
}

/** Postgres unique_violation */
export const UNIQUE_VIOLATION = '23505'
