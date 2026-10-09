import { createFileRoute } from '@tanstack/react-router'
import { catalog } from '@/lib/server/catalog'
import { recordHourlyPrices } from '@/lib/server/charts'
import { env } from '@/lib/server/env'
import { json, requireCron, route } from '@/lib/server/http'

/** Hourly: our own record of every stock's price, for the short chart ranges */
export const Route = createFileRoute('/api/cron/prices')({
  server: {
    handlers: {
      GET: route(async ({ request }) => {
        requireCron(request, env().CRON_SECRET)
        return json({ recorded: await recordHourlyPrices(await catalog()) })
      }),
    },
  },
})
