import { usePrivy } from '@privy-io/react-auth'
import { Link } from '@tanstack/react-router'
import { CheckIcon, LinkIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { AmountDisplay, Keypad } from '@/components/keypad'
import { ListRow } from '@/components/list-row'
import { purposeLabel, unlockLabel } from '@/components/screens/funds-screen'
import { Loading, Screen, SectionTitle } from '@/components/screen'
import { Receipt } from '@/components/receipt'
import { StockLogo } from '@/components/stock-logo'
import { SuccessState } from '@/components/success-state'
import { Button, buttonVariants } from '@/components/ui/button'
import { cashRawFor, stockRawFor } from '@/lib/amounts'
import { errorMessage } from '@/lib/client/api'
import { useFundActionMutation, useFundQuery, usePortfolioQuery } from '@/lib/client/queries'
import { formatShares, formatUsd } from '@/lib/format'

export default function FundScreen({ id }: { id: string }) {
  const { authenticated } = usePrivy()
  const fund = useFundQuery(id)
  const portfolio = usePortfolioQuery()
  const action = useFundActionMutation(id)
  const [adding, setAdding] = useState<string | null>(null)
  const [dollars, setDollars] = useState('0')
  const [copied, setCopied] = useState(false)
  // 'cash': typing how much cash to add; 'added': the success screen after it
  const [cashStep, setCashStep] = useState<'cash' | 'added' | null>(null)

  if (fund.isPending) return <Loading />
  if (!fund.data)
    return (
      <Screen back="/funds" title="">
        <p className="py-16 text-center text-muted-foreground">{errorMessage(fund.error)}</p>
      </Screen>
    )
  const data = fund.data

  if (cashStep === 'added') {
    const added = action.data?.contribution
    const cashOf = (raw: string) => Number(raw) / 10 ** (portfolio.data?.cash.decimals ?? 6)
    return (
      <Screen
        footer={
          <Button
            size="xl"
            onClick={() => {
              setCashStep(null)
              setDollars('0')
              action.reset()
            }}
          >
            Done
          </Button>
        }
      >
        <SuccessState
          title="Added"
          details={
            added && (
              <Receipt
                rows={[
                  ...added.buys.map((buy) => ({
                    label: buy.ticker,
                    value: `${formatShares(buy.shares)} shares · ${formatUsd(cashOf(buy.cashRaw))}`,
                  })),
                  { label: 'Fee', value: formatUsd(cashOf(added.feeRaw)) },
                ]}
              />
            )
          }
        >
          {added
            ? `${formatUsd(cashOf(added.spentRaw))} bought the mix and went into ${data.name}.`
            : `Your cash went into ${data.name}.`}
        </SuccessState>
      </Screen>
    )
  }

  // Adding cash: it buys the fund's mix in one go
  if (cashStep === 'cash') {
    const cash = portfolio.data?.cash
    const available = cash?.usdValue ?? 0
    const cashRaw = cashRawFor(dollars, cash?.decimals ?? 6)
    const over = Number(dollars) > available + 0.005
    return (
      <Screen
        back={`/fund/${id}`}
        title={`Add to ${data.name}`}
        footer={
          <>
            {action.error && (
              <p className="mb-3 text-center text-sm text-destructive">
                {errorMessage(action.error)}
              </p>
            )}
            <Button
              size="xl"
              disabled={cashRaw === 0n || over || action.isPending}
              onClick={() =>
                action.mutate(
                  { action: 'contribute-cash', cashRaw: cashRaw.toString(), note: null },
                  { onSuccess: () => setCashStep('added') },
                )
              }
            >
              {action.isPending ? 'Adding…' : `Add ${formatUsd(Number(dollars))}`}
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
              ) : (
                `${formatUsd(available)} cash available`
              )
            }
          />
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Buys {data.mix.map((entry) => `${entry.ticker} ${entry.percent}%`).join(', ')}
          </p>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setDollars((Math.floor(available * 100) / 100).toFixed(2))}
              className="h-8 rounded-full bg-secondary px-3 text-sm font-medium"
            >
              Max
            </button>
          </div>
        </div>
        <Keypad value={dollars} onChange={setDollars} />
      </Screen>
    )
  }

  // Adding shares: pick one of the fund's stocks you hold, then an amount
  if (adding) {
    const holding = portfolio.data?.holdings.find(
      (item) => item.stock.address.toLowerCase() === adding.toLowerCase(),
    )
    const entry = data.mix.find((item) => item.token.toLowerCase() === adding.toLowerCase())
    if (!holding || !entry || holding.stock.pricePerToken === null) return <Loading />
    const amountRaw = stockRawFor(dollars, holding.stock.pricePerToken, holding.stock.decimals)
    const over = amountRaw > BigInt(holding.amountRaw)
    const under = amountRaw > 0n && amountRaw < BigInt(entry.minRaw)
    return (
      <Screen
        back={`/fund/${id}`}
        title={`Add ${entry.ticker}`}
        footer={
          <>
            {action.error && (
              <p className="mb-3 text-center text-sm text-destructive">
                {errorMessage(action.error)}
              </p>
            )}
            <Button
              size="xl"
              disabled={amountRaw === 0n || over || under || action.isPending}
              onClick={() =>
                action.mutate(
                  {
                    action: 'contribute',
                    amounts: [{ token: entry.token, amountRaw: amountRaw.toString() }],
                    note: null,
                  },
                  {
                    onSuccess: () => {
                      setAdding(null)
                      setDollars('0')
                    },
                  },
                )
              }
            >
              {action.isPending ? 'Adding…' : `Add ${formatUsd(Number(dollars))}`}
            </Button>
          </>
        }
      >
        <div className="flex flex-1 flex-col justify-center">
          <AmountDisplay
            value={dollars}
            hint={
              over ? (
                <span className="text-destructive">
                  You have {formatUsd(holding.usdValue ?? 0)}
                </span>
              ) : under ? (
                <span className="text-destructive">Add at least about $1</span>
              ) : (
                `${formatUsd(holding.usdValue ?? 0)} of ${entry.ticker} available`
              )
            }
          />
        </div>
        <Keypad value={dollars} onChange={setDollars} />
      </Screen>
    )
  }

  const heldMix = data.mix.filter((entry) =>
    portfolio.data?.holdings.some(
      (item) => item.stock.address.toLowerCase() === entry.token.toLowerCase(),
    ),
  )
  const share = async () => {
    await navigator.clipboard.writeText(`${location.origin}/fund/${id}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Screen
      back="/funds"
      title=""
      footer={
        data.canWithdraw ? (
          <>
            {action.error && (
              <p className="mb-3 text-center text-sm text-destructive">
                {errorMessage(action.error)}
              </p>
            )}
            <Button
              size="xl"
              disabled={action.isPending}
              onClick={() => action.mutate({ action: 'withdraw' })}
            >
              {action.isPending ? 'Taking it out…' : 'Take it out'}
            </Button>
          </>
        ) : !authenticated ? (
          <Link
            to="/login"
            search={{ next: `/fund/${id}` }}
            className={buttonVariants({ size: 'xl' })}
          >
            Sign in to add to it
          </Link>
        ) : (
          <Button
            size="xl"
            onClick={() => {
              setDollars('0')
              action.reset()
              setCashStep('cash')
            }}
          >
            Add cash
          </Button>
        )
      }
    >
      <p className="pt-2 text-muted-foreground">
        {purposeLabel(data.purpose)} for {data.beneficiaryName}
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{data.name}</h1>
      <p className="mt-6 font-number text-5xl font-bold tracking-tight tabular-nums">
        {formatUsd(data.totalUsd)}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {data.unlocked ? 'Unlocked' : `Locked until ${unlockLabel(data.unlockAt)}`}
      </p>
      {/* Anyone with the link can add to it: the quiet second action under the total */}
      <button
        type="button"
        onClick={share}
        className="mt-4 inline-flex h-9 items-center gap-1.5 self-start rounded-full bg-secondary px-4 text-sm font-medium"
      >
        {copied ? <CheckIcon className="size-4" weight="bold" /> : <LinkIcon className="size-4" />}
        {copied ? 'Link copied' : 'Copy fund link'}
      </button>

      <SectionTitle>In the fund</SectionTitle>
      {data.mix.map((entry) => (
        <ListRow
          key={entry.token}
          leading={<StockLogo ticker={entry.ticker} />}
          title={entry.name}
          subtitle={`${formatShares(entry.shares)} shares · ${entry.percent}% of the mix`}
          value={entry.usdValue === null ? '—' : formatUsd(entry.usdValue)}
        />
      ))}

      {authenticated && (
        <>
          <SectionTitle>Add to it</SectionTitle>
          {heldMix.length === 0 ? (
            <p className="pb-8 text-sm text-muted-foreground">
              Add cash and it buys the mix for you. Shares of{' '}
              {data.mix.map((entry) => entry.ticker).join(', ')} you already hold can go in too.
            </p>
          ) : (
            <div className="pb-8">
              {heldMix.map((entry) => (
                <ListRow
                  key={entry.token}
                  onClick={() => setAdding(entry.token)}
                  leading={<StockLogo ticker={entry.ticker} />}
                  title={`Add ${entry.name}`}
                  subtitle="From the shares you hold"
                />
              ))}
            </div>
          )}
        </>
      )}
    </Screen>
  )
}
