import { USDG } from '@holdsake/sdk'
import { Link } from '@tanstack/react-router'
import { CheckIcon, PlusIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { AmountDisplay, Keypad } from '@/components/keypad'
import { ListRow } from '@/components/list-row'
import { Receipt } from '@/components/receipt'
import { EmptyState, Loading, Screen, RowsSkeleton } from '@/components/screen'
import { CardPicker, GiftCard } from '@/components/gift-card'
import { ShareGiftLink } from '@/components/share-gift-link'
import type { CardTheme } from '@/lib/gift-cards'
import { SuccessState } from '@/components/success-state'
import { Avatar, StockLogo } from '@/components/stock-logo'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cashRawFor, stockRawFor } from '@/lib/amounts'
import { errorMessage } from '@/lib/client/api'
import {
  type RecipientInput,
  useGiftQuoteQuery,
  usePortfolioQuery,
  useRecipientQuery,
  useSendGiftMutation,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd } from '@/lib/format'
import { HANDLE_PATTERN, normalizeHandle } from '@/lib/handles'
import { cn } from '@/lib/utils'

// Same limit as the gifts contract (MAX_GIFT_STOCKS); cash rides along as one more item
const MAX_GIFT_STOCKS = 3
// Same as the server's MAX_RECIPIENTS
const MAX_RECIPIENTS = 3

type Step = 'to' | 'what' | 'note' | 'review' | 'done'

type Asset =
  | {
      kind: 'cash'
      token: string
      decimals: number
      balanceRaw: bigint
      balanceUsd: number
    }
  | {
      kind: 'stock'
      token: string
      ticker: string
      name: string
      decimals: number
      pricePerToken: number
      balanceRaw: bigint
      balanceUsd: number
      shares: number
      logoUrl: string | null
    }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseRecipient(value: string): RecipientInput | null {
  const trimmed = value.trim()
  if (EMAIL.test(trimmed)) return { email: trimmed.toLowerCase() }
  const handle = normalizeHandle(trimmed)
  return HANDLE_PATTERN.test(handle) ? { handle } : null
}

export default function SendGiftScreen({ stock: preselected }: { stock?: string }) {
  const session = useSession()
  const portfolio = usePortfolioQuery()
  const send = useSendGiftMutation()

  const [step, setStep] = useState<Step>('to')
  const [to, setTo] = useState('')
  // Everyone it's going to; each gets the same gift, sent as one gift per person
  const [people, setPeople] = useState<Person[]>([])
  const [debouncedTo, setDebouncedTo] = useState('')
  // What's in the gift, by key ('cash' or a ticker), in the order picked; a stock passed in the
  // link starts picked and skips straight to its amount
  const [picked, setPicked] = useState<string[]>(preselected ? [preselected] : [])
  const [picking, setPicking] = useState(!preselected)
  const [amountIndex, setAmountIndex] = useState(0)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [cardTheme, setCardTheme] = useState<CardTheme>('birthday')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTo(to), 300)
    return () => window.clearTimeout(timer)
  }, [to])
  const recipientInput = parseRecipient(debouncedTo)
  const recipient = useRecipientQuery(recipientInput)

  const assets = useMemo<Asset[]>(() => {
    if (!portfolio.data) return []
    const { cash, holdings } = portfolio.data
    const list: Asset[] = []
    if (BigInt(cash.amountRaw) > 0n)
      list.push({
        kind: 'cash',
        token: '',
        decimals: cash.decimals,
        balanceRaw: BigInt(cash.amountRaw),
        balanceUsd: cash.usdValue,
      })
    for (const holding of holdings) {
      if (holding.stock.pricePerToken === null) continue
      list.push({
        kind: 'stock',
        token: holding.stock.address,
        ticker: holding.stock.ticker,
        name: holding.stock.name,
        decimals: holding.stock.decimals,
        pricePerToken: holding.stock.pricePerToken,
        balanceRaw: BigInt(holding.amountRaw),
        balanceUsd: holding.usdValue ?? 0,
        shares: holding.shares,
        logoUrl: holding.stock.logoUrl,
      })
    }
    return list
  }, [portfolio.data])

  const chosen = picked.flatMap((key) => assets.find((candidate) => keyOf(candidate) === key) ?? [])
  const recipientLabel = joinNames(people.map((person) => person.name))
  const count = Math.max(people.length, 1)
  const lines = chosen.map((asset) => {
    const dollars = amounts[keyOf(asset)] ?? '0'
    const amountRaw =
      asset.kind === 'cash'
        ? cashRawFor(dollars, asset.decimals)
        : stockRawFor(dollars, asset.pricePerToken, asset.decimals)
    // Each person gets this much, so the balance has to cover it once per person
    return {
      asset,
      dollars,
      amountRaw,
      over: amountRaw * BigInt(count) > asset.balanceRaw,
    }
  })
  const eachDollars = lines.reduce((sum, line) => sum + Number(line.dollars), 0)
  const totalDollars = eachDollars * count
  const items = lines
    .filter((line) => line.amountRaw > 0n)
    .map((line) => ({
      token: line.asset.kind === 'cash' ? USDG : line.asset.token,
      amountRaw: line.amountRaw.toString(),
    }))
  const quote = useGiftQuoteQuery(step === 'review' ? items : [], count)
  // The quote is per gift, and each person is one gift
  const feeEachUsd = quote.data ? Number(quote.data.feeRaw) / 10 ** quote.data.decimals : null

  if (!session.ready) return <Loading />

  if (step === 'done')
    return (
      <Screen
        footer={
          <Link to="/gifts" className={buttonVariants({ size: 'xl' })}>
            Done
          </Link>
        }
      >
        <SuccessState
          title="Gift sent"
          details={
            // One link per gift; several recipients each have theirs on the Gifts tab
            send.data?.length === 1 && send.data[0] ? (
              <ShareGiftLink
                giftId={send.data[0]}
                senderName={session.profile?.name ?? undefined}
              />
            ) : undefined
          }
        >
          {count > 1
            ? `${recipientLabel} each have 30 days to open theirs. You can take one back until it’s opened.`
            : `${recipientLabel} has 30 days to open it. You can take it back until they do.`}
        </SuccessState>
      </Screen>
    )

  if (step === 'to') {
    const lookupReady =
      recipientInput !== null && recipient.data?.found === true && debouncedTo === to
    const lookupKey = recipientInput ? personKey(recipientInput) : null
    const alreadyAdded = people.some((person) => person.key === lookupKey)
    const full = people.length >= MAX_RECIPIENTS
    const add = () => {
      if (!recipientInput || !recipient.data?.found || alreadyAdded || full) return
      setPeople((current) => [
        ...current,
        {
          key: personKey(recipientInput),
          input: recipientInput,
          name: recipient.data?.profile?.name ?? recipient.data?.label ?? to.trim(),
          avatarUrl: recipient.data?.profile?.avatarUrl ?? null,
          subtitle: recipient.data?.profile
            ? `@${recipient.data.profile.handle}`
            : 'They’ll sign in with this email to open it',
        },
      ])
      setTo('')
      setDebouncedTo('')
    }
    // Typed someone and went straight to Next: they count too
    const canAdd = lookupReady && !alreadyAdded && !full
    return (
      <Screen
        back="/"
        title="Send a gift"
        footer={
          <Button
            size="xl"
            disabled={people.length === 0 && !canAdd}
            onClick={() => {
              if (canAdd) add()
              setStep('what')
            }}
          >
            Next
          </Button>
        }
      >
        {!full && (
          <Input
            value={to}
            onChange={(event) => setTo(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canAdd) add()
            }}
            placeholder="@username or email"
            aria-label="Who is it for?"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="mt-2 h-14 rounded-2xl border-0 bg-secondary px-4 text-lg"
          />
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          {full
            ? `That’s everyone: a gift goes to ${MAX_RECIPIENTS} people at most.`
            : `Up to ${MAX_RECIPIENTS} people. Each gets the same gift.`}
        </p>
        <div className="mt-2">
          {recipientInput && recipient.data && debouncedTo === to && !alreadyAdded && !full && (
            <ListRow
              onClick={recipient.data.found ? add : undefined}
              leading={
                <Avatar
                  name={recipient.data.profile?.name ?? recipient.data.label}
                  url={recipient.data.profile?.avatarUrl}
                />
              }
              title={recipient.data.profile?.name ?? recipient.data.label}
              subtitle={
                recipient.data.found
                  ? recipient.data.profile
                    ? `@${recipient.data.profile.handle}`
                    : 'They’ll sign in with this email to open it'
                  : 'No one here by that name yet'
              }
              value={
                recipient.data.found ? <PlusIcon className="size-5" aria-label="Add" /> : undefined
              }
            />
          )}
          {people.map((person) => (
            <ListRow
              key={person.key}
              leading={<Avatar name={person.name} url={person.avatarUrl} />}
              title={person.name}
              subtitle={person.subtitle}
              value={
                <button
                  type="button"
                  onClick={() =>
                    setPeople((current) => current.filter((item) => item.key !== person.key))
                  }
                  aria-label={`Remove ${person.name}`}
                  className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
                >
                  <XIcon className="size-4" />
                </button>
              }
            />
          ))}
        </div>
      </Screen>
    )
  }

  if (step === 'what') {
    if (picking || chosen.length === 0) {
      const stocksPicked = chosen.filter((asset) => asset.kind === 'stock').length
      const toggle = (key: string) =>
        setPicked((current) =>
          current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
        )
      return (
        <Screen
          back="/"
          title="What to give"
          footer={
            assets.length > 0 && (
              <Button
                size="xl"
                disabled={chosen.length === 0}
                onClick={() => {
                  setPicking(false)
                  setAmountIndex(0)
                }}
              >
                Next
              </Button>
            )
          }
        >
          {portfolio.isPending ? (
            <RowsSkeleton rows={3} />
          ) : assets.length === 0 ? (
            <EmptyState
              title="Nothing to give yet"
              body="Add cash or buy a stock first."
              action={
                <Link
                  to="/add-cash"
                  className={buttonVariants({
                    variant: 'secondary',
                    size: 'lg',
                  })}
                >
                  Add cash
                </Link>
              }
            />
          ) : (
            <div className="pb-6">
              <p className="pt-2 pb-2 text-sm text-muted-foreground">
                Pick up to {MAX_GIFT_STOCKS} stocks, and cash if you like.
              </p>
              {assets.map((candidate) => {
                const key = keyOf(candidate)
                const selected = picked.includes(key)
                // The gift holds a few stocks at most; cash is always one more
                const full =
                  !selected && candidate.kind === 'stock' && stocksPicked >= MAX_GIFT_STOCKS
                return (
                  <label
                    key={key}
                    className={cn(
                      '-mx-2 flex cursor-pointer items-center gap-3 rounded-2xl px-2 py-3 hover:bg-muted/60 has-focus-visible:ring-2 has-focus-visible:ring-ring',
                      full && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={full}
                      onChange={() => toggle(key)}
                      className="sr-only"
                    />
                    {candidate.kind === 'cash' ? (
                      <StockLogo ticker="$" />
                    ) : (
                      <StockLogo ticker={candidate.ticker} logoUrl={candidate.logoUrl} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {candidate.kind === 'cash' ? 'Cash' : candidate.name}
                      </div>
                      <div className="truncate font-number text-sm text-muted-foreground">
                        {candidate.kind === 'cash'
                          ? `${formatUsd(candidate.balanceUsd)} · dollars they can spend or invest`
                          : `${formatShares(candidate.shares)} shares · ${formatUsd(candidate.balanceUsd)}`}
                      </div>
                    </div>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                        selected
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border',
                      )}
                    >
                      {selected && <CheckIcon weight="bold" className="size-3.5" />}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </Screen>
      )
    }

    const line = lines[Math.min(amountIndex, lines.length - 1)]!
    const { asset, dollars, amountRaw, over } = line
    const key = keyOf(asset)
    const setDollars = (value: string) => setAmounts((current) => ({ ...current, [key]: value }))
    const last = amountIndex >= lines.length - 1
    const maxDollars = Math.floor((asset.balanceUsd / count) * 100) / 100
    const name = asset.kind === 'cash' ? 'Cash' : asset.name
    return (
      <Screen
        back="/"
        title={lines.length > 1 ? `${name} · ${amountIndex + 1} of ${lines.length}` : name}
        footer={
          <Button
            size="xl"
            disabled={amountRaw === 0n || over}
            onClick={() => (last ? setStep('note') : setAmountIndex(amountIndex + 1))}
          >
            Next
          </Button>
        }
      >
        <div className="flex flex-1 flex-col justify-center">
          <AmountDisplay
            value={dollars}
            hint={
              over ? (
                <span className="text-destructive">
                  {count > 1
                    ? `You have ${formatUsd(asset.balanceUsd)}, ${formatUsd(maxDollars)} each`
                    : `You have ${formatUsd(asset.balanceUsd)}`}
                </span>
              ) : asset.kind === 'stock' && amountRaw > 0n ? (
                `${formatShares(sharesFor(asset, amountRaw))} shares of ${asset.ticker}${count > 1 ? ' each' : ''}`
              ) : count > 1 ? (
                `Each person · ${formatUsd(asset.balanceUsd)} available`
              ) : (
                `${formatUsd(asset.balanceUsd)} available`
              )
            }
          />
          <div className="mb-4 flex justify-center gap-2">
            {amountIndex > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => setAmountIndex(amountIndex - 1)}>
                Previous
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
                Change
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setDollars(maxDollars.toFixed(2))}>
              Max
            </Button>
          </div>
        </div>
        <Keypad value={dollars} onChange={setDollars} />
      </Screen>
    )
  }

  if (step === 'note')
    return (
      <Screen
        back="/"
        title="Card and note"
        footer={
          <Button size="xl" onClick={() => setStep('review')}>
            Next
          </Button>
        }
      >
        <p className="pt-2 pb-3 text-sm font-medium">Pick a card</p>
        <CardPicker value={cardTheme} onChange={setCardTheme} />
        <p className="pt-6 pb-1 text-sm font-medium">Add a note</p>
        <textarea
          value={message}
          maxLength={280}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={`Say something to ${recipientLabel}`}
          aria-label="Note"
          className="mt-2 min-h-40 w-full resize-none rounded-2xl bg-secondary p-4 text-lg outline-none"
        />
        <p className="mt-2 text-right text-sm text-muted-foreground">{message.length}/280</p>
      </Screen>
    )

  const submit = () =>
    send.mutate(
      {
        recipients: people.map((person) => person.input),
        items,
        message: message.trim() || null,
        cardTheme,
      },
      { onSuccess: () => setStep('done') },
    )

  return (
    <Screen
      back="/"
      title="Review"
      footer={
        <>
          {send.error && (
            <p className="mb-3 text-center text-sm text-destructive">{errorMessage(send.error)}</p>
          )}
          <Button size="xl" disabled={send.isPending || items.length === 0} onClick={submit}>
            {send.isPending ? 'Sending…' : `Send ${formatUsd(totalDollars)}`}
          </Button>
        </>
      }
    >
      <GiftCard
        theme={cardTheme}
        recipientName={people.length ? recipientLabel : null}
        senderName={session.profile?.name ?? 'You'}
        message={message.trim() || null}
        className="mt-2"
      />
      <p className="pt-5 pb-4 text-center font-number text-5xl font-bold tracking-tight tabular-nums">
        {formatUsd(totalDollars)}
      </p>
      <Receipt
        rows={[
          { label: 'To', value: recipientLabel },
          {
            label: count > 1 ? 'Each gets' : 'Gift',
            value: (
              <div className="flex flex-col gap-1">
                {lines.map(({ asset, dollars, amountRaw }) => (
                  <span key={keyOf(asset)}>
                    {asset.kind === 'stock'
                      ? `${formatShares(sharesFor(asset, amountRaw))} ${asset.ticker}`
                      : 'Cash'}
                    {lines.length > 1 && (
                      <span className="text-muted-foreground"> · {formatUsd(Number(dollars))}</span>
                    )}
                  </span>
                ))}
              </div>
            ),
          },
          ...(message.trim() ? [{ label: 'Note', value: message.trim() }] : []),
          {
            label: 'Fee',
            value:
              feeEachUsd === null
                ? '…'
                : count > 1
                  ? `about ${formatUsd(feeEachUsd * count)} (${formatUsd(feeEachUsd)} each)`
                  : `about ${formatUsd(feeEachUsd)}`,
          },
        ]}
      />
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        {count > 1
          ? `Each person gets their own gift, and only they can open it. Any they don’t open within 30 days come back to you, and you can take one back any time before it’s opened.`
          : `Only ${recipientLabel} can open it. If they don’t within 30 days, it comes back to you, and you can take it back any time before they open it.`}{' '}
        The fee covers what sending costs us, at cost with a small buffer. It comes from your cash
        first.
      </p>
    </Screen>
  )
}

type Person = {
  key: string
  input: RecipientInput
  name: string
  avatarUrl: string | null
  subtitle: string
}

const personKey = (input: RecipientInput) => ('handle' in input ? `@${input.handle}` : input.email)

/** "Maya", "Maya and Budi", "Maya, Budi and Sari" */
function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Stable key for a pickable asset: 'cash', or the stock's ticker (what links pass in) */
const keyOf = (asset: Asset) => (asset.kind === 'cash' ? 'cash' : asset.ticker)

/** Underlying shares for a raw amount, in proportion to what the holding reports */
function sharesFor(asset: Extract<Asset, { kind: 'stock' }>, amountRaw: bigint): number {
  return asset.balanceRaw === 0n ? 0 : (Number(amountRaw) / Number(asset.balanceRaw)) * asset.shares
}
