import { Link } from '@tanstack/react-router'
import { EarnArt } from '@/components/home-art'
import { CheckIcon, InfoIcon } from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'
import { AmountDisplay, Keypad } from '@/components/keypad'
import { Receipt } from '@/components/receipt'
import { ListRow } from '@/components/list-row'
import { Loading, Screen } from '@/components/screen'
import { StockLogo } from '@/components/stock-logo'
import { SuccessState } from '@/components/success-state'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cashRawFor } from '@/lib/amounts'
import { errorMessage } from '@/lib/client/api'
import {
  type EarnClaimRequest,
  type EarnDepositRequest,
  useConfirmMutation,
  useEarnQuery,
  usePrepareEarnMutation,
  useSetEarnTargetMutation,
  useStocksQuery,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd, rawToNumber } from '@/lib/format'
import type { EarnView, SignRequest } from '@/lib/types'
import { cn } from '@/lib/utils'

type Step = 'home' | 'deposit' | 'withdraw' | 'review' | 'done'
type Action = 'deposit' | 'withdraw' | 'claim'

const VERB: Record<Action, string> = {
  deposit: 'Add',
  withdraw: 'Take out',
  claim: 'Claim',
}

/**
 * Earn, after apys.co: cash goes into a lending vault and stays the person's; the interest it
 * makes is claimed as shares of a stock they pick. Every move is one signature, no background
 * spending. The page is the one place that explains lending, in plain words.
 */
export default function EarnScreen() {
  const session = useSession()
  const earn = useEarnQuery()
  const prepare = usePrepareEarnMutation()
  const confirm = useConfirmMutation()
  const setTarget = useSetEarnTargetMutation()
  const [step, setStep] = useState<Step>('home')
  const [action, setAction] = useState<Action>('deposit')
  const [dollars, setDollars] = useState('0')
  const [all, setAll] = useState(false)
  const [picking, setPicking] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const stocks = useStocksQuery()

  if (!session.ready || earn.isPending) return <Loading />
  if (!earn.data)
    return (
      <Screen back="/" title="Earn">
        <p className="py-16 text-center text-muted-foreground">
          {earn.error ? errorMessage(earn.error) : 'Earn didn’t load. Try again.'}
        </p>
      </Screen>
    )

  const data = earn.data
  const cash = (raw: string) => rawToNumber(raw, data.decimals)
  const value = cash(data.valueRaw)
  const interest = cash(data.interestRaw)
  const available = action === 'deposit' ? cash(data.cashRaw) : value

  const begin = (next: Action) => {
    setAction(next)
    setDollars('0')
    setAll(false)
    prepare.reset()
    confirm.reset()
    if (next === 'claim') {
      setStep('review')
      prepare.mutate({ kind: 'claim' })
    } else setStep(next)
  }

  if (step === 'done')
    return (
      <Screen
        footer={
          <Button size="xl" onClick={() => setStep('home')}>
            Done
          </Button>
        }
      >
        <SuccessState
          title={action === 'deposit' ? 'Earning' : action === 'withdraw' ? 'Taken out' : 'Claimed'}
        >
          {action === 'deposit'
            ? 'Your cash is lent out and earning now.'
            : action === 'withdraw'
              ? 'The cash is back in your account.'
              : `Your interest bought ${data.targetTicker}. The cash you put in keeps earning.`}
        </SuccessState>
      </Screen>
    )

  if (step === 'review')
    return (
      <ReviewStep
        action={action}
        data={data}
        dollars={all ? null : Number(dollars)}
        request={prepare.data}
        pending={prepare.isPending}
        error={prepare.error ?? confirm.error}
        sending={confirm.isPending}
        onBack={() => setStep(action === 'claim' ? 'home' : action)}
        onConfirm={() =>
          prepare.data && confirm.mutate(prepare.data, { onSuccess: () => setStep('done') })
        }
      />
    )

  if (step === 'deposit' || step === 'withdraw') {
    const over = Number(dollars) > available + 0.005
    const amountRaw = cashRawFor(dollars, data.decimals)
    return (
      <Screen
        back="/earn"
        title={step === 'deposit' ? 'Add to Earn' : 'Take out'}
        footer={
          <Button
            size="xl"
            disabled={(!all && amountRaw === 0n) || over || prepare.isPending}
            onClick={() => {
              prepare.mutate(
                step === 'deposit'
                  ? { kind: 'deposit', amountRaw: amountRaw.toString() }
                  : {
                      kind: 'withdraw',
                      amountRaw: all ? 'all' : amountRaw.toString(),
                    },
              )
              setStep('review')
            }}
          >
            Review
          </Button>
        }
      >
        <div className="flex flex-1 flex-col justify-center">
          <AmountDisplay
            value={dollars}
            hint={
              over
                ? `You have ${formatUsd(available)}`
                : step === 'deposit'
                  ? `${formatUsd(available)} cash available`
                  : `${formatUsd(available)} in Earn`
            }
          />
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setDollars((Math.floor(available * 100) / 100).toFixed(2))
                setAll(step === 'withdraw')
              }}
              className="h-8 rounded-full bg-secondary px-3 text-sm font-medium"
            >
              Max
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

  const ready = interest >= data.minClaimUsd
  const rate = data.apy === null ? null : `${(data.apy * 100).toFixed(1)}%`
  const target = stocks.data?.find((stock) => stock.ticker === data.targetTicker)
  const empty = value === 0

  return (
    <Screen
      back="/"
      title="Earn"
      footer={
        ready ? (
          <Button size="xl" onClick={() => begin('claim')}>
            Claim {formatUsd(interest)} as {data.targetTicker}
          </Button>
        ) : (
          <Button size="xl" onClick={() => begin('deposit')}>
            Add cash
          </Button>
        )
      }
    >
      {/* One number is the hero: the rate until there's money in, then the money */}
      <section className="pt-8 pb-2 text-center">
        {empty ? (
          <>
            <p className="font-number text-6xl font-bold tracking-tight tabular-nums">
              {rate ?? '—'}
            </p>
            <p className="mt-2 text-muted-foreground">a year on your cash, paid in shares</p>
          </>
        ) : (
          <>
            <p className="font-number text-5xl font-bold tracking-tight tabular-nums">
              {formatUsd(value)}
            </p>
            <p className="mt-2 font-number text-gain tabular-nums">
              +{formatUsd(interest)} interest
            </p>
          </>
        )}
      </section>

      {!empty && (
        // Cash App-style pair under the amount: the everyday moves, the footer keeps the main one
        <div className="mt-4 grid grid-cols-2 gap-3">
          <PillAction onClick={() => begin('deposit')}>Add</PillAction>
          <PillAction onClick={() => begin('withdraw')}>Take out</PillAction>
        </div>
      )}

      <div className="mt-8">
        <ListRow
          onClick={() => setPicking(true)}
          leading={<StockLogo ticker={data.targetTicker} logoUrl={target?.logoUrl} />}
          title={target?.name ?? data.targetTicker}
          subtitle="Your interest buys this"
          value={
            <span className="font-sans text-sm font-normal text-muted-foreground">Change</span>
          }
        />
        {empty ? (
          <Estimate apy={data.apy} ticker={data.targetTicker} />
        ) : (
          <>
            <Fact label="Rate" value={rate ? `${rate} a year` : 'Changes'} />
            {Number(data.claimedRaw) > 0 && (
              <Fact label="Claimed so far" value={formatUsd(cash(data.claimedRaw))} />
            )}
            {!ready && <Fact label="Claim from" value={formatUsd(data.minClaimUsd)} muted />}
          </>
        )}
        <ListRow
          onClick={() => setExplaining(true)}
          leading={<InfoBadge />}
          title="How Earn works"
          subtitle="Where the interest comes from, and the risks"
        />
      </div>

      <Sheet open={picking} onOpenChange={setPicking}>
        <SheetContent side="bottom" className={SHEET}>
          <SheetHeader className="px-0">
            <SheetTitle className="text-lg">Your interest buys</SheetTitle>
          </SheetHeader>
          <div className="max-h-[60dvh] overflow-y-auto">
            {data.tickers.map((ticker) => {
              const stock = stocks.data?.find((item) => item.ticker === ticker)
              return (
                <ListRow
                  key={ticker}
                  onClick={() => {
                    setTarget.mutate(ticker)
                    setPicking(false)
                  }}
                  leading={<StockLogo ticker={ticker} logoUrl={stock?.logoUrl} />}
                  title={stock?.name ?? ticker}
                  subtitle={ticker}
                  value={
                    ticker === data.targetTicker ? (
                      <CheckIcon className="size-5" weight="bold" />
                    ) : undefined
                  }
                />
              )
            })}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={explaining} onOpenChange={setExplaining}>
        <SheetContent side="bottom" className={SHEET}>
          <SheetHeader className="px-0">
            <SheetTitle className="text-lg">How Earn works</SheetTitle>
          </SheetHeader>
          <div className="flex max-h-[65dvh] flex-col gap-5 overflow-y-auto pb-2 leading-relaxed">
            <p className="text-muted-foreground">
              Your cash is lent, through NetNet Credit on Morpho, to people who borrow against
              shares like Apple and NVIDIA. They pay interest; it’s yours, and you claim it as
              shares. What you put in stays yours. The rate is after the manager’s 10% cut.
            </p>
            <Point title="Taking out can wait">
              Cash comes back as borrowers repay.
              {data.liquidityUsd !== null &&
                ` Right now ${formatUsd(Math.max(0, data.liquidityUsd))} can leave at once.`}
            </Point>
            <Point title="The rate moves">It follows how much people borrow, and can drop.</Point>
            <Point title="Lending can go wrong">
              If borrowers’ shares fall fast, lenders can lose part of what they put in.
            </Point>
            <Point title="Shares go up and down">
              What your interest buys can be worth less later.
            </Point>
          </div>
        </SheetContent>
      </Sheet>
    </Screen>
  )
}

const SHEET =
  'mx-auto max-w-md rounded-t-3xl border-0 px-5 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]'

function PillAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 rounded-full bg-secondary text-base font-medium transition-colors hover:bg-muted"
    >
      {children}
    </button>
  )
}

/** A plain label/value row, the receipt look without the receipt */
function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn('font-number font-medium tabular-nums', muted && 'text-muted-foreground')}
      >
        {value}
      </span>
    </div>
  )
}

function Point({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <p className="mt-0.5 text-muted-foreground">{children}</p>
    </div>
  )
}

function InfoBadge() {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
      <InfoIcon className="size-5" />
    </span>
  )
}

/** One sentence instead of a calculator card: tap an amount, read what it earns */
function Estimate({ apy, ticker }: { apy: number | null; ticker: string }) {
  const [amount, setAmount] = useState(1000)
  if (apy === null) return null
  return (
    <div className="py-4">
      <p className="text-muted-foreground">
        <span className="font-number text-foreground tabular-nums">{formatUsd(amount)}</span> earns
        about{' '}
        <span className="font-number font-medium text-gain tabular-nums">
          {formatUsd(amount * apy)}
        </span>{' '}
        of {ticker} a year
      </p>
      <div className="mt-3 flex gap-2">
        {[100, 1000, 5000].map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={amount === option}
            onClick={() => setAmount(option)}
            className={cn(
              'h-9 rounded-full px-4 font-number text-sm font-medium tabular-nums transition-colors',
              amount === option ? 'bg-foreground text-background' : 'bg-secondary',
            )}
          >
            {formatUsd(option).replace('.00', '')}
          </button>
        ))}
      </div>
    </div>
  )
}

function ReviewStep({
  action,
  data,
  dollars,
  request,
  pending,
  error,
  sending,
  onBack,
  onConfirm,
}: {
  action: Action
  data: EarnView
  /** null: everything */
  dollars: number | null
  request: SignRequest | EarnClaimRequest | EarnDepositRequest | undefined
  pending: boolean
  error: unknown
  sending: boolean
  onBack: () => void
  onConfirm: () => void
}) {
  const fee = request ? rawToNumber(request.feeRaw, data.decimals) : null
  const claim = request && 'claim' in request ? request.claim : null
  // What actually goes in, when the fee had to come out of the deposit
  const deposited =
    request && 'deposit' in request ? rawToNumber(request.deposit.depositRaw, data.decimals) : null
  const feeFromDeposit = deposited !== null && dollars !== null && deposited < dollars - 0.0005
  const amount =
    action === 'claim'
      ? claim
        ? rawToNumber(claim.interestRaw, data.decimals)
        : null
      : (dollars ?? rawToNumber(data.valueRaw, data.decimals))

  return (
    <Screen
      back="/earn"
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
                : action === 'claim'
                  ? `Claim as ${data.targetTicker}`
                  : `${VERB[action]} ${amount === null ? '' : formatUsd(amount)}`}
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
            <p className="pt-2 pb-4 text-center font-number text-5xl font-bold tracking-tight tabular-nums">
              {amount === null ? '—' : formatUsd(amount)}
            </p>
            <Receipt
              rows={[
                ...(action === 'claim' && claim
                  ? [
                      { label: 'Interest', value: formatUsd(amount ?? 0) },
                      {
                        label: 'Buys about',
                        value: `${formatShares(claim.expectedShares)} ${claim.ticker}`,
                      },
                    ]
                  : [
                      {
                        label: action === 'deposit' ? 'Into Earn' : 'Out of Earn',
                        value:
                          deposited !== null
                            ? formatUsd(deposited)
                            : dollars === null
                              ? 'Everything'
                              : formatUsd(dollars),
                      },
                    ]),
                ...(fee === null ? [] : [{ label: 'Fee', value: formatUsd(fee) }]),
              ]}
            />
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              {action === 'deposit'
                ? `${feeFromDeposit ? 'Your other cash doesn’t cover the fee, so it comes out of what goes in. ' : ''}Your cash is lent out and starts earning right away. You can take it back any time borrowers have repaid enough of it.`
                : action === 'withdraw'
                  ? 'The cash comes back to your account. The fee is taken from it.'
                  : 'Only the interest comes out; what you put in keeps earning. The price can move a little before this goes through.'}{' '}
              The fee covers what this costs us to send, at cost with a small buffer.
            </p>
          </>
        )
      )}
    </Screen>
  )
}

export function EarnHomeCard({ data }: { data: EarnView | undefined }) {
  if (!data) return <Skeleton className="mt-6 h-22 rounded-3xl" />
  const value = rawToNumber(data.valueRaw, data.decimals)
  const interest = rawToNumber(data.interestRaw, data.decimals)
  return (
    <Link
      to="/earn"
      className="mt-6 flex items-center justify-between gap-4 rounded-3xl bg-secondary p-4 pr-5"
    >
      <EarnArt />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Earn</p>
        <p className="text-sm text-muted-foreground">
          {value > 0
            ? `${formatUsd(interest)} of interest ready`
            : data.apy === null
              ? 'Your cash earns shares'
              : `Cash earns about ${(data.apy * 100).toFixed(0)}% a year, paid in shares`}
        </p>
      </div>
      <span
        className={cn('shrink-0 text-base tabular-nums', value > 0 ? 'font-number' : 'text-gain')}
      >
        {value > 0 ? formatUsd(value) : 'Start'}
      </span>
    </Link>
  )
}
