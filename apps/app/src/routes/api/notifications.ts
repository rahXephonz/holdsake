import { createFileRoute } from '@tanstack/react-router'
import { syncDeposits } from '@/lib/server/deposits'
import { json, route } from '@/lib/server/http'
import { db } from '@/lib/server/supabase'
import { requireUser } from '@/lib/server/users'
import type { Notification } from '@/lib/types'

export const Route = createFileRoute('/api/notifications')({
  server: {
    handlers: {
      GET: route(async ({ request }) => {
        const user = await requireUser(request)
        // Before reading, so a deposit that just landed is in this response
        await syncDeposits(user)
        const { data, error } = await db()
          .from('notifications')
          .select('id, kind, title, body, href, read, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) throw error
        return json(
          data.map((row): Notification => ({
            id: row.id,
            kind: row.kind,
            title: row.title,
            body: row.body,
            href: row.href,
            read: row.read,
            createdAt: row.created_at,
          })),
        )
      }),

      // Marks everything read: opening the feed is reading it
      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        const { error } = await db()
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.id)
          .eq('read', false)
        if (error) throw error
        return json({ ok: true })
      }),
    },
  },
})
