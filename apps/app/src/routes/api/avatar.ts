import { createFileRoute } from '@tanstack/react-router'
import { badRequest, json, logError, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { AVATAR_BUCKET, db } from '@/lib/server/supabase'
import { requireUser, toProfile, USER_COLUMNS, type UserRow } from '@/lib/server/users'

// The browser crops and shrinks the photo to 512px before sending (lib/client/avatar.ts), so a
// real upload is tens of kilobytes; the cap only stops someone posting straight at the route
const MAX_BYTES = 1_000_000

/** What the file's first bytes say it is; the declared type alone is the client's word */
function sniff(bytes: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  const at = (index: number) => bytes[index]
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpg'
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'png'
  const ascii = (start: number) => String.fromCharCode(...bytes.slice(start, start + 4))
  if (ascii(0) === 'RIFF' && ascii(8) === 'WEBP') return 'webp'
  return null
}

const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const

async function setAvatarPath(user: UserRow, path: string | null) {
  const { data, error } = await db()
    .from('users')
    .update({ avatar_path: path })
    .eq('id', user.id)
    .select(USER_COLUMNS)
    .single()
    .overrideTypes<UserRow, { merge: false }>()
  if (error) throw error
  // The old photo goes once nothing points at it; a leftover file is harmless, so don't fail
  if (user.avatar_path && user.avatar_path !== path) {
    const { error: removeError } = await db().storage.from(AVATAR_BUCKET).remove([user.avatar_path])
    if (removeError) logError('old avatar not removed', removeError)
  }
  return data
}

/** The signed-in person's profile photo. Public once uploaded: it shows on gift links */
export const Route = createFileRoute('/api/avatar')({
  server: {
    handlers: {
      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        enforceRateLimit(user.id, 'avatar')
        const form = await request.formData().catch(() => null)
        const file = form?.get('file')
        if (!(file instanceof Blob) || file.size === 0) throw badRequest('Pick a photo to use.')
        if (file.size > MAX_BYTES) throw badRequest('That photo is too big. Try another one.')
        const bytes = new Uint8Array(await file.arrayBuffer())
        const kind = sniff(bytes)
        if (!kind) throw badRequest('That photo can’t be used. Try a JPEG or PNG.', 'bad_image')

        // A new name each time, so a cached old photo never shows in place of the new one
        const path = `${user.id}/${crypto.randomUUID()}.${kind}`
        const { error } = await db().storage.from(AVATAR_BUCKET).upload(path, bytes, {
          contentType: CONTENT_TYPES[kind],
          cacheControl: '31536000',
          upsert: false,
        })
        if (error) throw error
        return json(toProfile(await setAvatarPath(user, path)))
      }),

      DELETE: route(async ({ request }) => {
        const user = await requireUser(request)
        enforceRateLimit(user.id, 'avatar')
        if (!user.avatar_path) return json(toProfile(user))
        return json(toProfile(await setAvatarPath(user, null)))
      }),
    },
  },
})
