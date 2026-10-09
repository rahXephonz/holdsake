import { USDG } from '@holdsake/sdk'
import { Link } from '@tanstack/react-router'
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

type Step = 'to' | 'what' | 'note' | 'review' | 'done'

type Asset =
  | { kind: 'cash'; token: string; decimals: number; balanceRaw: bigint; balanceUsd: number }
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
  const [debouncedTo, setDebouncedTo] = useState('')
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [dollars, setDollars] = useState('0')
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

  // Until they pick, a stock passed in the link counts as picked
  const chosen =
    token === undefined
      ? (assets.find((candidate) => candidate.kind === 'stock' && candidate.ticker === preselected)
          ?.token ?? null)
      : token
  const asset = assets.find((candidate) =>
    candidate.kind === 'cash' ? chosen === 'cash' : candidate.token === chosen,
  )
  const amountRaw = !asset
    ? 0n
    : asset.kind === 'cash'
      ? cashRawFor(dollars, asset.decimals)
      : stockRawFor(dollars, asset.pricePerToken, asset.decimals)
  const overBalance = asset ? amountRaw > asset.balanceRaw : false
  const items =
    asset && amountRaw > 0n
      ? [{ token: asset.kind === 'cash' ? USDG : asset.token, amountRaw: amountRaw.toString() }]
      : []
  const quote = useGiftQuoteQuery(step === 'review' ? items : [], 1)
  const feeUsd = quote.data ? Number(quote.data.feeRaw) / 10 ** quote.data.decimals : null

  if (!session.ready) return <Loading />

  const recipientLabel = recipient.data?.profile?.name ?? recipient.data?.label ?? to

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
          {recipientLabel} has 30 days to open it. You can take it back until they do.
        </SuccessState>
      </Screen>
    )

  if (step === 'to') {
    const ready = recipientInput !== null && recipient.data?.found === true && debouncedTo === to
    return (
      <Screen
        back="/"
        title="Send a gift"
        footer={
          <Button size="xl" disabled={!ready} onClick={() => setStep('what')}>
            Next
          </Button>
        }
      >
        <Input
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="@username or email"
          aria-label="Who is it for?"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="mt-2 h-14 rounded-2xl border-0 bg-secondary px-4 text-lg"
        />
        <div className="mt-4">
          {recipientInput && recipient.data && (
            <ListRow
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
            />
          )}
        </div>
      </Screen>
    )
  }

  if (step === 'what') {
    if (!asset)
      return (
        <Screen back="/" title="What to give">
          {portfolio.isPending ? (
            <RowsSkeleton rows={3} />
          ) : assets.length === 0 ? (
            <EmptyState
              title="Nothing to give yet"
              body="Add cash or buy a stock first."
              action={
                <Link
                  to="/add-cash"
                  className={buttonVariants({ variant: 'secondary', size: 'lg' })}
                >
                  Add cash
                </Link>
              }
            />
          ) : (
            <div className="pb-6">
              {assets.map((candidate) => (
                <ListRow
                  key={candidate.kind === 'cash' ? 'cash' : candidate.token}
                  onClick={() => setToken(candidate.kind === 'cash' ? 'cash' : candidate.token)}
                  leading={
                    candidate.kind === 'cash' ? (
                      <StockLogo ticker="$" />
                    ) : (
                      <StockLogo ticker={candidate.ticker} logoUrl={candidate.logoUrl} />
                    )
                  }
                  title={candidate.kind === 'cash' ? 'Cash' : candidate.name}
                  subtitle={
                    candidate.kind === 'cash'
                      ? 'Dollars they can spend or invest'
                      : `${formatShares(candidate.shares)} shares`
                  }
                  value={formatUsd(candidate.balanceUsd)}
                />
              ))}
            </div>
          )}
        </Screen>
      )

    const maxDollars = Math.floor(asset.balanceUsd * 100) / 100
    return (
      <Screen
        back="/"
        title={asset.kind === 'cash' ? 'Cash' : asset.name}
        footer={
          <Button
            size="xl"
            disabled={amountRaw === 0n || overBalance}
            onClick={() => setStep('note')}
          >
            Next
          </Button>
        }
      >
        <div className="flex flex-1 flex-col justify-center">
          <AmountDisplay
            value={dollars}
            hint={
              overBalance ? (
                <span className="text-destructive">You have {formatUsd(asset.balanceUsd)}</span>
              ) : asset.kind === 'stock' && amountRaw > 0n ? (
                `${formatShares(sharesFor(asset, amountRaw))} shares of ${asset.ticker}`
              ) : (
                `${formatUsd(asset.balanceUsd)} available`
              )
            }
          />
          <div className="mb-4 flex justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setToken(null)}>
              Change
            </Button>
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
    recipientInput &&
    send.mutate(
      { recipients: [recipientInput], items, message: message.trim() || null, cardTheme },
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
            {send.isPending ? 'Sending…' : `Send ${formatUsd(Number(dollars))}`}
          </Button>
        </>
      }
    >
      <GiftCard
        theme={cardTheme}
        recipientName={recipient.data?.profile?.name ?? null}
        senderName={session.profile?.name ?? 'You'}
        message={message.trim() || null}
        className="mt-2"
      />
      <p className="pt-5 pb-4 text-center font-number text-5xl font-bold tracking-tight tabular-nums">
        {formatUsd(Number(dollars))}
      </p>
      <Receipt
        rows={[
          { label: 'To', value: recipientLabel },
          {
            label: 'Gift',
            value:
              asset?.kind === 'stock'
                ? `${formatShares(sharesFor(asset, amountRaw))} ${asset.ticker}`
                : 'Cash',
          },
          ...(message.trim() ? [{ label: 'Note', value: message.trim() }] : []),
          {
            label: 'Fee',
            value: feeUsd === null ? '…' : `about ${formatUsd(feeUsd)}`,
          },
        ]}
      />
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        Only {recipientLabel} can open it. If they don’t within 30 days, it comes back to you, and
        you can take it back any time before they open it. The fee covers what sending costs us, at
        cost with a small buffer. It comes from your cash first.
      </p>
    </Screen>
  )
}

/** Underlying shares for a raw amount, in proportion to what the holding reports */
function sharesFor(asset: Extract<Asset, { kind: 'stock' }>, amountRaw: bigint): number {
  return asset.balanceRaw === 0n ? 0 : (Number(amountRaw) / Number(asset.balanceRaw)) * asset.shares
}
