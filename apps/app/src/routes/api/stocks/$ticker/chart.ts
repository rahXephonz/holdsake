import { createFileRoute } from '@tanstack/react-router'
import { findStock } from '@/lib/server/catalog'
import { getChart } from '@/lib/server/charts'
import { badRequest, json, notFound, route } from '@/lib/server/http'
import { CHART_RANGES, type ChartRange } from '@/lib/types'

const isRange = (value: string): value is ChartRange =>
  CHART_RANGES.some((range) => range === value)

export const Route = createFileRoute('/api/stocks/$ticker/chart')({
  server: {
    handlers: {
      GET: route<{ ticker: string }>(async ({ request, params }) => {
        const range = new URL(request.url).searchParams.get('range')?.toUpperCase() ?? '1M'
        if (!isRange(range)) throw badRequest('Pick a chart range.')
        const stock = await findStock(params.ticker)
        if (!stock) throw notFound('We don’t offer that stock.')
        return json(await getChart(stock, range))
      }),
    },
  },
})
