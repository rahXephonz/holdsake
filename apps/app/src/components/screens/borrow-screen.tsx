import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AmountDisplay, Keypad } from '@/components/keypad'
import { ListRow } from '@/components/list-row'
import { Receipt } from '@/components/receipt'
import { Loading, Screen, SectionTitle } from '@/components/screen'
import { StockLogo } from '@/components/stock-logo'
import { SuccessState } from '@/components/success-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cashRawFor } from '@/lib/amounts'
import { errorMessage } from '@/lib/client/api'
import {
  type LoanRequest,
  useBorrowQuery,
  useConfirmMutation,
  usePrepareBorrowMutation,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd } from '@/lib/format'
import type { BorrowMarketView, BorrowView, LoanView, SignRequest } from '@/lib/types'
import { cn } from '@/lib/utils'

type Step =
  | { name: 'home' }
  | { name: 'amount'; ticker: string }
  | { name: 'loan'; ticker: string }
  | { name: 'repay'; ticker: string }
  | { name: 'review'; ticker: string; action: 'open' | 'repay' | 'take-back' }
  | { name: 'done'; action: 'open' | 'repay' | 'take-back'; ticker: string }

const rate = (apy: number | null) =>
  apy === null ? 'Changes' : `${(apy * 100).toFixed(apy < 0.1 ? 2 : 1)}% a year`

/**
 * Borrow cash against shares, on Morpho (AGENT.md "Borrow on Morpho"). Every loan shows, in plain
 * words, how far the stock can fall before its shares are sold, the price that does it, and the
 * penalty; never a loan without those.
 */
export default function BorrowScreen() {
  const session = useSession()
  const borrow = useBorrowQuery()
  const prepare = usePrepareBorrowMutation()
  const confirm = useConfirmMutation()
  const [step, setStep] = useState<Step>({ name: 'home' })
  const [dollars, setDollars] = useState('0')
  const [all, setAll] = useState(false)

  if (!session.ready || borrow.isPending) return <Loading />
  if (!borrow.data)
    return (
      <Screen back="/" title="Borrow">
        <p className="py-16 text-center text-muted-foreground">{errorMessage(borrow.error)}</p>
      </Screen>
    )
  const data = borrow.data
  const loanFor = (ticker: string) => data.loans.find((loan) => loan.ticker === ticker)
  const marketFor = (ticker: string) => data.markets.find((market) => market.ticker === ticker)

  const go = (next: Step) => {
    prepare.reset()
    confirm.reset()
    setDollars('0')
    setAll(false)
    setStep(next)
  }

  const review = (ticker: string, action: 'open' | 'repay' | 'take-back', amountRaw: string) => {
    prepare.mutate(
      action === 'open'
        ? { kind: 'open', ticker, borrowRaw: amountRaw }
        : { kind: action, ticker, amountRaw },
    )
    setStep({ name: 'review', ticker, action })
  }

  if (step.name === 'done')
    return (
      <Screen
        footer={
          <Button size="xl" onClick={() => go({ name: 'home' })}>
            Done
          </Button>
        }
      >
        <SuccessState
          title={
            step.action === 'open'
              ? 'Borrowed'
              : step.action === 'repay'
                ? 'Paid back'
                : 'Shares back'
          }
        >
          {step.action === 'open'
            ? 'The cash is in your account. Keep an eye on the stock: if it falls far, the shares are sold.'
            : step.action === 'repay'
              ? 'Thanks. What you owe is lower now.'
              : `Your ${step.ticker} is back in your account.`}
        </SuccessState>
      </Screen>
    )

  if (step.name === 'review')
    return (
      <ReviewStep
        step={step}
        data={data}
        dollars={all ? null : Number(dollars)}
        request={prepare.data}
        pending={prepare.isPending}
        error={prepare.error ?? confirm.error}
        sending={confirm.isPending}
        onBack={() =>
          setStep(
            step.action === 'open'
              ? { name: 'amount', ticker: step.ticker }
              : { name: 'loan', ticker: step.ticker },
          )
        }
        onConfirm={() =>
          prepare.data &&
          confirm.mutate(prepare.data, {
            onSuccess: () => setStep({ name: 'done', action: step.action, ticker: step.ticker }),
          })
        }
      />
    )

  if (step.name === 'amount' || step.name === 'repay') {
    const market = marketFor(step.ticker)
    const loan = loanFor(step.ticker)
    const limit = step.name === 'amount' ? (market?.canBorrowUsd ?? 0) : (loan?.borrowedUsd ?? 0)
    const over = Number(dollars) > limit + 0.005
    const amountRaw = cashRawFor(dollars, data.decimals)
    return (
      <Screen
        back="/borrow"
        title={step.name === 'amount' ? `Borrow against ${step.ticker}` : 'Pay back'}
        footer={
          <Button
            size="xl"
            disabled={(!all && amountRaw === 0n) || over}
            onClick={() =>
              review(
                step.ticker,
                step.name === 'amount' ? 'open' : 'repay',
                all ? 'all' : amountRaw.toString(),
              )
            }
          >
            Review
          </Button>
        }
      >
        <div className="flex flex-1 flex-col justify-center">
          <AmountDisplay
            value={dollars}
            hint={
              over ? (
                <span className="text-destructive">
                  {step.name === 'amount' ? 'Up to' : 'You owe'} {formatUsd(limit)}
                </span>
              ) : step.name === 'amount' ? (
                `Up to ${formatUsd(limit)} · ${rate(market?.apy ?? null)}`
              ) : (
                `You owe ${formatUsd(limit)}`
              )
            }
          />
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setDollars((Math.floor(limit * 100) / 100).toFixed(2))
                setAll(step.name === 'repay')
              }}
              className="h-8 rounded-full bg-secondary px-3 text-sm font-medium"
            >
              {step.name === 'repay' ? 'All of it' : 'Max'}
            </button>
          </div>
        </div>
        <Keypad
          value={dollars}
          onChange={(next) => {
            setDollars(next)
            setAll(false)
          }}
        />
      </Screen>
    )
  }

  if (step.name === 'loan') {
    const loan = loanFor(step.ticker)
    if (!loan)
      return (
        <Screen back="/borrow" title="">
          <p className="py-16 text-center text-muted-foreground">This loan is closed.</p>
        </Screen>
      )
    const owes = loan.borrowedUsd > 0
    return (
      <Screen
        back="/borrow"
        title={`${loan.ticker} loan`}
        footer={
          owes ? (
            <Button size="xl" onClick={() => go({ name: 'repay', ticker: loan.ticker })}>
              Pay back
            </Button>
          ) : (
            <Button size="xl" onClick={() => review(loan.ticker, 'take-back', 'all')}>
              Take back {formatShares(loan.lockedShares)} {loan.ticker}
            </Button>
          )
        }
      >
        <section className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">You owe</p>
          <p className="mt-1 font-number text-5xl font-bold tracking-tight tabular-nums">
            {formatUsd(loan.borrowedUsd)}
          </p>
          {loan.fallPct !== null && <SafetyLine ticker={loan.ticker} fallPct={loan.fallPct} />}
        </section>
        <div className="mt-6">
          <Receipt
            rows={[
              {
                label: 'Locked',
                value: `${formatShares(loan.lockedShares)} ${loan.ticker} · ${formatUsd(loan.lockedUsd)}`,
              },
              ...(loan.liquidationPricePerShare !== null
                ? [
                    {
                      label: 'Sold if a share falls below',
                      value: formatUsd(loan.liquidationPricePerShare),
                    },
                  ]
                : []),
              { label: 'Rate', value: rate(loan.apy) },
            ]}
          />
        </div>
        {owes && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <PillAction onClick={() => go({ name: 'amount', ticker: loan.ticker })}>
              Borrow more
            </PillAction>
            <PillAction disabled>Take back shares</PillAction>
          </div>
        )}
        <p className="mt-6 pb-6 text-sm leading-relaxed text-muted-foreground">
          {owes
            ? 'Your shares come back once the loan is paid off. Interest adds up every second, at a rate that changes.'
            : 'This loan is paid off. Take your shares back whenever you like.'}
        </p>
      </Screen>
    )
  }

  const held = data.markets.filter((market) => market.heldShares > 0)
  const totalOwed = data.loans.reduce((sum, loan) => sum + loan.borrowedUsd, 0)
  return (
    <Screen back="/" title="Borrow">
      <section className="pt-6 pb-2 text-center">
        {data.loans.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">You owe</p>
            <p className="mt-1 font-number text-5xl font-bold tracking-tight tabular-nums">
              {formatUsd(totalOwed)}
            </p>
          </>
        ) : (
          <>
            <p className="text-3xl font-bold tracking-tight text-balance">
              Cash now, keep your shares
            </p>
            <p className="mt-2 text-balance text-muted-foreground">
              Borrow against stock you own instead of selling it. Pay back any time.
            </p>
          </>
        )}
      </section>

      {data.loans.length > 0 && (
        <>
          <SectionTitle>Your loans</SectionTitle>
          {data.loans.map((loan) => (
            <ListRow
              key={loan.ticker}
              onClick={() => go({ name: 'loan', ticker: loan.ticker })}
              leading={<StockLogo ticker={loan.ticker} logoUrl={loan.logoUrl} />}
              title={loan.name}
              subtitle={
                loan.fallPct === null
                  ? `${formatShares(loan.lockedShares)} locked · paid off`
                  : `Safe until it falls ${loan.fallPct.toFixed(0)}%`
              }
              value={formatUsd(loan.borrowedUsd)}
            />
          ))}
        </>
      )}

      <SectionTitle>Borrow against</SectionTitle>
      {held.length === 0 ? (
        <p className="text-muted-foreground">
          Hold {data.markets.map((market) => market.ticker).join(', ')} to borrow against them.{' '}
          <Link
            to="/stocks"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Browse stocks
          </Link>
        </p>
      ) : (
        held.map((market) => (
          <ListRow
            key={market.ticker}
            onClick={() => go({ name: 'amount', ticker: market.ticker })}
            leading={<StockLogo ticker={market.ticker} logoUrl={market.logoUrl} />}
            title={market.name}
            subtitle={`Up to ${formatUsd(market.canBorrowUsd)} · ${rate(market.apy)}`}
          />
        ))
      )}

      <SectionTitle>How it works</SectionTitle>
      <ul className="flex flex-col gap-3 pb-8 leading-relaxed text-muted-foreground">
        <li>
          Your shares are locked as security on Morpho, a lending market, and the cash comes to your
          account. You can borrow up to half of what they’re worth.
        </li>
        <li>
          <span className="font-medium text-foreground">If the stock falls far,</span> your shares
          are sold to pay the loan, with a {(data.markets[0]?.penaltyPct ?? 12.7).toFixed(1)}%
          penalty taken from them. Each loan shows how far it can fall.
        </li>
        <li>
          <span className="font-medium text-foreground">Prices don’t move over the weekend,</span>{' '}
          but a stock can open Monday far from Friday’s close.
        </li>
        <li>The rate changes with how much people borrow.</li>
      </ul>
    </Screen>
  )
}

/** The one number that matters on a loan: how far the stock can fall */
function SafetyLine({ ticker, fallPct }: { ticker: string; fallPct: number }) {
  return (
    <p
      className={cn(
        'mt-2 font-medium',
        // Close to the line is the one time this screen gets loud
        fallPct < 10 ? 'text-loss' : 'text-muted-foreground',
      )}
    >
      Safe until {ticker} falls {fallPct.toFixed(0)}%
    </p>
  )
}

function PillAction({
  onClick,
  disabled,
  children,
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-12 rounded-full bg-secondary text-base font-medium transition-colors hover:bg-muted disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function ReviewStep({
  step,
  data,
  dollars,
  request,
  pending,
  error,
  sending,
  onBack,
  onConfirm,
}: {
  step: { ticker: string; action: 'open' | 'repay' | 'take-back' }
  data: BorrowView
  /** null: everything */
  dollars: number | null
  request: SignRequest | LoanRequest | undefined
  pending: boolean
  error: unknown
  sending: boolean
  onBack: () => void
  onConfirm: () => void
}) {
  const fee = request ? Number(request.feeRaw) / 10 ** data.decimals : null
  const loan = request && 'loan' in request ? request.loan : null
  const current = data.loans.find((item) => item.ticker === step.ticker)
  const amount = step.action === 'take-back' ? null : (dollars ?? current?.borrowedUsd ?? null)

  return (
    <Screen
      back="/borrow"
      title="Review"
      footer={
        <>
          {Boolean(error) && (
            <p className="mb-3 text-center text-sm text-destructive">{errorMessage(error)}</p>
          )}
          {error ? (
            <Button size="xl" variant="secondary" onClick={onBack}>
              Back
            </Button>
          ) : (
            <Button size="xl" disabled={!request || sending} onClick={onConfirm}>
              {sending
                ? 'Sending…'
                : step.action === 'open'
                  ? `Borrow ${amount === null ? '' : formatUsd(amount)}`
                  : step.action === 'repay'
                    ? `Pay back ${amount === null ? '' : formatUsd(amount)}`
                    : `Take back ${step.ticker}`}
            </Button>
          )}
        </>
      }
    >
      {pending || (!request && !error) ? (
        <div className="flex flex-col items-center gap-4 pt-6" aria-hidden="true">
          <Skeleton className="h-12 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : (
        request && (
          <>
            {amount !== null && (
              <p className="pt-2 text-center font-number text-5xl font-bold tracking-tight tabular-nums">
                {formatUsd(amount)}
              </p>
            )}
            {loan?.fallPct != null && (
              <div className="mt-2 text-center">
                <SafetyLine ticker={loan.ticker} fallPct={loan.fallPct} />
              </div>
            )}
            <div className="mt-6">
              <Receipt
                rows={
                  step.action === 'open' && loan
                    ? [
                        { label: 'You get', value: formatUsd(amount ?? 0) },
                        ...(loan.lockShares > 0
                          ? [
                              {
                                label: 'Locks',
                                value: `${formatShares(loan.lockShares)} ${loan.ticker} · ${formatUsd(loan.lockUsd)}`,
                              },
                            ]
                          : []),
                        ...(loan.liquidationPricePerShare !== null
                          ? [
                              {
                                label: 'Sold if a share falls below',
                                value: formatUsd(loan.liquidationPricePerShare),
                              },
                            ]
                          : []),
                        { label: 'Rate', value: `${rate(loan.apy)}, changes` },
                        { label: 'If it’s sold', value: `${loan.penaltyPct.toFixed(1)}% penalty` },
                        ...(fee === null ? [] : [{ label: 'Fee', value: formatUsd(fee) }]),
                      ]
                    : [
                        step.action === 'repay'
                          ? {
                              label: 'Pays back',
                              value: dollars === null ? 'All of it' : formatUsd(dollars),
                            }
                          : {
                              label: 'Comes back',
                              value: current
                                ? `${formatShares(current.lockedShares)} ${current.ticker}`
                                : step.ticker,
                            },
                        ...(fee === null ? [] : [{ label: 'Fee', value: formatUsd(fee) }]),
                      ]
                }
              />
            </div>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              {step.action === 'open'
                ? 'Your shares are locked on Morpho, a lending market, until you pay this back. If the stock falls past the line above, they’re sold to cover the loan and the penalty comes out of them. Prices pause over the weekend, but a stock can open Monday far from Friday. '
                : ''}
              The fee covers what this costs us to send, at cost with a small buffer.
            </p>
          </>
        )
      )}
    </Screen>
  )
}

export function BorrowHomeCard({ data }: { data: BorrowView | undefined }) {
  if (!data) return null
  const owed = data.loans.reduce((sum, loan) => sum + loan.borrowedUsd, 0)
  const closest = data.loans
    .filter((loan): loan is LoanView & { fallPct: number } => loan.fallPct !== null)
    .reduce<(LoanView & { fallPct: number }) | null>(
      (min, loan) => (min === null || loan.fallPct < min.fallPct ? loan : min),
      null,
    )
  const can = data.markets.reduce((sum, market: BorrowMarketView) => sum + market.canBorrowUsd, 0)
  // Always there, so the feature can be found before someone holds a stock it takes
  const tickers = data.markets.map((market) => market.ticker)
  const list = `${tickers.slice(0, -1).join(', ')} or ${tickers.at(-1) ?? ''}`
  return (
    <Link
      to="/borrow"
      className="mt-3 flex items-center justify-between gap-4 rounded-3xl bg-secondary p-5"
    >
      <div className="min-w-0">
        <p className="font-medium">Borrow</p>
        <p
          className={cn(
            'text-sm',
            closest && closest.fallPct < 10 ? 'text-loss' : 'text-muted-foreground',
          )}
        >
          {closest
            ? `Safe until ${closest.ticker} falls ${closest.fallPct.toFixed(0)}%`
            : can > 0
              ? 'Cash against your shares, without selling'
              : `Borrow cash against ${list}`}
        </p>
      </div>
      <span className="shrink-0 font-number text-lg font-semibold tabular-nums">
        {owed > 0 ? formatUsd(owed) : can > 0 ? `Up to ${formatUsd(can)}` : ''}
      </span>
    </Link>
  )
}
