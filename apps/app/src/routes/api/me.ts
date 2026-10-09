import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { BLOCKED_COUNTRY_CODES } from '@/lib/restrictions'
import { badRequest, conflict, forbidden, json, readBody, route } from '@/lib/server/http'
import { db, UNIQUE_VIOLATION } from '@/lib/server/supabase'
import {
  HANDLE_PATTERN,
  RESERVED_HANDLES,
  requireUser,
  toProfile,
  USER_COLUMNS,
  type UserRow,
} from '@/lib/server/users'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  handle: z.string().trim().toLowerCase().optional(),
  country: z.string().length(2).toUpperCase().optional(),
  notUsPerson: z.boolean().optional(),
  acceptTerms: z.boolean().optional(),
})

export const Route = createFileRoute('/api/me')({
  server: {
    handlers: {
      GET: route(async ({ request }) => json(toProfile(await requireUser(request)))),

      PATCH: route(async ({ request }) => {
        const user = await requireUser(request)
        const body = await readBody(request, patchSchema)
        const patch: Partial<UserRow> = {}

        if (body.name !== undefined) patch.name = body.name
        if (body.handle !== undefined && body.handle !== user.handle) {
          // A handle is how people find you to send a gift; once set it doesn't move
          if (user.handle) throw badRequest('Your username can’t be changed.')
          if (!HANDLE_PATTERN.test(body.handle) || RESERVED_HANDLES.has(body.handle))
            throw badRequest('That username isn’t available.', 'handle_invalid')
          patch.handle = body.handle
        }
        if (body.country !== undefined) {
          if (BLOCKED_COUNTRY_CODES.has(body.country))
            throw forbidden('Holdsake isn’t available in this country yet.', 'restricted')
          patch.country = body.country
        }
        if (body.notUsPerson === true) patch.not_us_person = true
        if (body.acceptTerms === true && !user.terms_accepted_at)
          patch.terms_accepted_at = new Date().toISOString()

        if (Object.keys(patch).length === 0) return json(toProfile(user))
        const { data, error } = await db()
          .from('users')
          .update(patch)
          .eq('id', user.id)
          .select(USER_COLUMNS)
          .single()
          .overrideTypes<UserRow, { merge: false }>()
        if (error?.code === UNIQUE_VIOLATION)
          throw conflict('That username is taken.', 'handle_taken')
        if (error) throw error
        return json(toProfile(data))
      }),
    },
  },
})
