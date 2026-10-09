import { robinhoodChain } from '@holdsake/sdk'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AmountDisplay, Keypad } from '@/components/keypad'
import { Receipt } from '@/components/receipt'
import { Loading, Screen } from '@/components/screen'
import { SuccessState } from '@/components/success-state'
import { buttonVariants, Button } from '@/components/ui/button'
import { cashRawFor, stockRawFor } from '@/lib/amounts'
import { errorMessage } from '@/lib/client/api'
import {
  useConfirmMutation,
  usePortfolioQuery,
  usePrepareTradeMutation,
  useStockQuery,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd, rawToNumber } from '@/lib/format'

export default function TradeScreen({ ticker, side }: { ticker: string; side: 'buy' | 'sell' }) {
  const session = useSession()
  const stock = useStockQuery(ticker)
  const portfolio = usePortfolioQuery()
  const prepare = usePrepareTradeMutation()
  const confirm = useConfirmMutation()
  const [dollars, setDollars] = useState('0')
  const [step, setStep] = useState<'amount' | 'review' | 'done'>('amount')
  // When it landed, taken once on success for the receipt
  const [doneAt, setDoneAt] = useState<Date | null>(null)

  if (!session.ready || stock.isPending || portfolio.isPending) return <Loading />
  const data = stock.data
  if (!data?.tradable || data.pricePerToken === null)
    return (
      <Screen back={`/stocks/${ticker}`} title="">
        <p className="py-16 text-center text-muted-foreground">
          {data
            ? `${data.name} can’t be bought or sold here right now.`
            : 'We don’t offer that stock.'}
        </p>
      </Screen>
    )

  const cash = portfolio.data?.cash
  const holding = portfolio.data?.holdings.find((item) => item.stock.ticker === ticker)
  const cashDecimals = cash?.decimals ?? 6
  const available = side === 'buy' ? (cash?.usdValue ?? 0) : (holding?.usdValue ?? 0)
  const amountRaw =
    side === 'buy'
      ? cashRawFor(dollars, cashDecimals)
      : (() => {
          const raw = stockRawFor(dollars, data.pricePerToken, data.decimals)
          const owned = BigInt(holding?.amountRaw ?? '0')
          // "Max" sells every share, not the dollar rounding of it
          return raw > owned || Number(dollars) >= Math.floor(available * 100) / 100 ? owned : raw
        })()
  const over = Number(dollars) > available + 0.005
  const sharesOf = (raw: bigint) =>
    rawToNumber(raw, data.decimals) * (Number(data.uiMultiplier) / 1e18)
  const cashOf = (raw: string) => rawToNumber(raw, cashDecimals)
  const verb = side === 'buy' ? 'Buy' : 'Sell'

  if (step === 'done') {
    const outcome = confirm.data?.trade
    const quote = prepare.data?.quote
    const fees = quote ? cashOf(quote.tradeFeeRaw) + cashOf(quote.gasFeeRaw) : null
    // Buy: cash in, shares out. Sell: shares in, cash out, and the fee leaves that cash.
    const shares = outcome
      ? sharesOf(BigInt(side === 'buy' ? outcome.receivedRaw : outcome.spentRaw))
      : null
    const cashMoved = outcome
      ? cashOf(side === 'buy' ? outcome.spentRaw : outcome.receivedRaw)
      : null
    const rows =
      outcome && shares && cashMoved !== null
        ? [
            {
              label: side === 'buy' ? 'Bought' : 'Sold',
              value: `${formatShares(shares)} ${data.ticker}`,
            },
            side === 'buy'
              ? { label: 'Paid', value: formatUsd(cashMoved) }
              : { label: 'You got', value: formatUsd(cashMoved - (fees ?? 0)) },
            { label: 'Price per share', value: formatUsd(cashMoved / shares) },
            ...(fees === null ? [] : [{ label: 'Fees', value: formatUsd(fees) }]),
            ...(doneAt
              ? [
                  {
                    label: 'Date',
                    value: doneAt.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }),
                  },
                ]
              : []),
          ]
        : null
    return (
      <Screen
        footer={
          <Link to="/" className={buttonVariants({ size: 'xl' })}>
            Done
          </Link>
        }
      >
        <SuccessState
          title={side === 'buy' ? 'Bought' : 'Sold'}
          details={
            rows && (
              <>
                <Receipt rows={rows} />
                {confirm.data?.txHash && (
                  <a
                    href={`${robinhoodChain.blockExplorers.default.url}/tx/${confirm.data.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 block text-center text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
                  >
                    View full receipt
                  </a>
                )}
              </>
            )
          }
        >
          {side === 'buy'
            ? `${data.ticker} shares are in your account.`
            : 'The cash is in your account.'}
        </SuccessState>
      </Screen>
    )
  }

  if (step === 'review' && prepare.data) {
    const { quote } = prepare.data
    const fees = cashOf(quote.tradeFeeRaw) + cashOf(quote.gasFeeRaw)
    // What the market itself keeps; it's already in the amounts above, shown so it's never a surprise
    const marketFeeRow = {
      label: 'Market fee',
      value: `${(quote.poolFee / 10_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}%, included`,
    }
    return (
      <Screen
        back={`/stocks/${ticker}`}
        title="Review"
        footer={
          <>
            {confirm.error && (
              <p className="mb-3 text-center text-sm text-destructive">
                {errorMessage(confirm.error)}
              </p>
            )}
            <Button
              size="xl"
              disabled={confirm.isPending}
              onClick={() =>
                confirm.mutate(prepare.data, {
                  onSuccess: () => {
                    setDoneAt(new Date())
                    setStep('done')
                  },
                })
              }
            >
              {confirm.isPending ? `${verb}ing…` : `${verb} ${data.ticker}`}
            </Button>
          </>
        }
      >
        <p className="pt-2 pb-4 text-center font-number text-5xl font-bold tracking-tight tabular-nums">
          {formatUsd(Number(dollars))}
        </p>
        <Receipt
          rows={
            side === 'buy'
              ? [
                  { label: 'You pay', value: formatUsd(cashOf(quote.spendRaw)) },
                  {
                    label: 'You get about',
                    value: `${formatShares(sharesOf(BigInt(quote.receiveRaw)))} ${data.ticker}`,
                  },
                  {
                    label: 'At least',
                    value: `${formatShares(sharesOf(BigInt(quote.minReceiveRaw)))} ${data.ticker}`,
                  },
                  { label: 'Fees', value: formatUsd(fees) },
                  marketFeeRow,
                ]
              : [
                  {
                    label: 'You sell',
                    value: `${formatShares(sharesOf(BigInt(quote.spendRaw)))} ${data.ticker}`,
                  },
                  { label: 'You get about', value: formatUsd(cashOf(quote.receiveRaw) - fees) },
                  { label: 'At least', value: formatUsd(cashOf(quote.minReceiveRaw) - fees) },
                  { label: 'Fees', value: formatUsd(fees) },
                  marketFeeRow,
                ]
          }
        />
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          The price can move a little before this goes through; you’ll never get less than the
          amount shown as “at least”. Fees cover what the trade costs us to send, at cost with a
          small buffer{Number(quote.tradeFeeRaw) > 0 ? ', plus a small trading fee' : ''}. The
          market fee goes to the people who provide this market, not to us.
          {data.priceSource === 'market'
            ? ' This stock is priced by its market here, which can differ from where it trades elsewhere.'
            : ''}
        </p>
      </Screen>
    )
  }

  return (
    <Screen
      back={`/stocks/${ticker}`}
      title={`${verb} ${data.ticker}`}
      footer={
        <>
          {prepare.error && (
            <p className="mb-3 text-center text-sm text-destructive">
              {errorMessage(prepare.error)}
            </p>
          )}
          <Button
            size="xl"
            disabled={amountRaw === 0n || over || prepare.isPending}
            onClick={() =>
              prepare.mutate(
                { ticker, side, amountRaw: amountRaw.toString() },
                { onSuccess: () => setStep('review') },
              )
            }
          >
            {prepare.isPending ? 'Getting a price…' : 'Review'}
          </Button>
        </>
      }
    >
      <div className="flex flex-1 flex-col justify-center">
        <AmountDisplay
          value={dollars}
          hint={
            over ? (
              <span className="text-destructive">You have {formatUsd(available)}</span>
            ) : amountRaw > 0n ? (
              side === 'buy' ? (
                `About ${formatShares(Number(dollars) / (data.pricePerShare ?? data.pricePerToken))} shares`
              ) : (
                `${formatShares(sharesOf(amountRaw))} shares`
              )
            ) : (
              `${formatUsd(available)} ${side === 'buy' ? 'cash' : `of ${data.ticker}`} available`
            )
          }
        />
        <div className="mb-4 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDollars((Math.floor(available * 100) / 100).toFixed(2))}
          >
            Max
          </Button>
        </div>
      </div>
      <Keypad value={dollars} onChange={setDollars} />
    </Screen>
  )
}
