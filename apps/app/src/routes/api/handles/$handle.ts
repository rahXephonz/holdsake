import { createFileRoute } from '@tanstack/react-router'
import { normalizeHandle } from '@/lib/handles'
import { json, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { db } from '@/lib/server/supabase'
import { HANDLE_PATTERN, RESERVED_HANDLES, requireUser } from '@/lib/server/users'

export const Route = createFileRoute('/api/handles/$handle')({
  server: {
    handlers: {
      GET: route<{ handle: string }>(async ({ request, params }) => {
        const user = await requireUser(request)
        enforceRateLimit(user.id, 'recipients')
        const handle = normalizeHandle(params.handle)
        if (!HANDLE_PATTERN.test(handle) || RESERVED_HANDLES.has(handle))
          return json({ available: false })
        const { data, error } = await db()
          .from('users')
          .select('id')
          .eq('handle', handle)
          .maybeSingle()
        if (error) throw error
        return json({ available: !data || data.id === user.id })
      }),
    },
  },
})
