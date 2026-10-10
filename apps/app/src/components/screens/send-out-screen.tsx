import { robinhoodChain } from '@holdsake/sdk'
import { USDG } from '@holdsake/sdk'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AmountDisplay, Keypad } from '@/components/keypad'
import { ListRow } from '@/components/list-row'
import { Receipt } from '@/components/receipt'
import { EmptyState, Loading, Screen } from '@/components/screen'
import { SuccessState } from '@/components/success-state'
import { Avatar, StockLogo } from '@/components/stock-logo'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cashRawFor, stockRawFor } from '@/lib/amounts'
import { errorMessage } from '@/lib/client/api'
import {
  useConfirmMutation,
  usePortfolioQuery,
  usePrepareSendMutation,
  useRecipientQuery,
} from '@/lib/client/queries'
import { HANDLE_PATTERN, normalizeHandle } from '@/lib/handles'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd } from '@/lib/format'

type Step = 'amount' | 'destination' | 'review' | 'done'

/**
 * Moves cash or shares out to another account: "Cash out" for cash, "Send out" for a stock. The
 * person pastes an address from wherever it's going; any account can receive these.
 */
export default function SendOutScreen({
  mode,
  ticker,
}: {
  mode: 'cash' | 'stock'
  ticker?: string
}) {
  const session = useSession()
  const portfolio = usePortfolioQuery()
  const prepare = usePrepareSendMutation()
  const confirm = useConfirmMutation()
  const [step, setStep] = useState<Step>('amount')
  const [dollars, setDollars] = useState('0')
  const [destination, setDestination] = useState('')
  const [picked, setPicked] = useState<string | undefined>(ticker)
  // When it landed, taken once on success for the receipt
  const [doneAt, setDoneAt] = useState<Date | null>(null)
  const lookup = destination.trim().startsWith('@') ? normalizeHandle(destination) : null
  const recipient = useRecipientQuery(
    lookup && HANDLE_PATTERN.test(lookup) ? { handle: lookup } : null,
  )

  if (!session.ready || portfolio.isPending) return <Loading />
  const back = mode === 'cash' ? '/profile' : '/'
  const title = mode === 'cash' ? 'Cash out' : 'Send shares'

  const holding = portfolio.data?.holdings.find((item) => item.stock.ticker === picked)
  const cash = portfolio.data?.cash
  // Either a Holdsake @username (looked up as it's typed) or a pasted address
  const typed = destination.trim()
  const isAddress = /^0x[0-9a-fA-F]{40}$/.test(typed)
  const handle = typed.startsWith('@') ? normalizeHandle(typed) : null
  const isHandle = handle !== null && HANDLE_PATTERN.test(handle)
  const destinationReady = isAddress || (isHandle && recipient.data?.found === true)
  // What arrives can be less than typed when the fee has to come out of the send itself
  const cashOf = (raw: string) => Number(raw) / 10 ** (cash?.decimals ?? 6)
  const sent = prepare.data ? cashOf(prepare.data.send.sentRaw) : null
  const cashFeeFromSend = mode === 'cash' && sent !== null && sent < Number(dollars) - 0.0005
  if (mode === 'stock' && !holding)
    return (
      <Screen back={back} title={title}>
        {portfolio.data?.holdings.length ? (
          <div className="pb-6">
            {portfolio.data.holdings.map((item) => (
              <ListRow
                key={item.stock.address}
                onClick={() => setPicked(item.stock.ticker)}
                leading={<StockLogo ticker={item.stock.ticker} logoUrl={item.stock.logoUrl} />}
                title={item.stock.name}
                subtitle={`${formatShares(item.shares)} shares`}
                value={item.usdValue === null ? '—' : formatUsd(item.usdValue)}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No shares to send" />
        )}
      </Screen>
    )

  const decimals = mode === 'cash' ? (cash?.decimals ?? 6) : holding!.stock.decimals
  const balanceRaw = BigInt(mode === 'cash' ? (cash?.amountRaw ?? '0') : holding!.amountRaw)
  const balanceUsd = mode === 'cash' ? (cash?.usdValue ?? 0) : (holding!.usdValue ?? 0)
  const amountRaw =
    mode === 'cash'
      ? cashRawFor(dollars, decimals)
      : stockRawFor(dollars, holding!.stock.pricePerToken ?? 0, decimals)
  const token = mode === 'cash' ? USDG : holding!.stock.address
  const over = amountRaw > balanceRaw
  const sharesOf = (raw: bigint) =>
    mode === 'stock' && balanceRaw > 0n ? (Number(raw) / Number(balanceRaw)) * holding!.shares : 0
  const shares = sharesOf(amountRaw)
  // Shares that actually arrive, when the fee came out of them
  const sentShares =
    mode === 'stock' && prepare.data && BigInt(prepare.data.send.sentRaw) < amountRaw
      ? sharesOf(BigInt(prepare.data.send.sentRaw))
      : null
  const feeFromSend = cashFeeFromSend || sentShares !== null

  if (step === 'done')
    return (
      <Screen
        footer={
          <Link to="/" className={buttonVariants({ size: 'xl' })}>
            Done
          </Link>
        }
      >
        <SuccessState
          title="Sent"
          details={
            <>
              <Receipt
                rows={[
                  mode === 'cash'
                    ? { label: 'Sent', value: formatUsd(sent ?? Number(dollars)) }
                    : {
                        label: 'Sent',
                        value: `${formatShares(sentShares ?? shares)} ${holding?.stock.ticker ?? ''}`,
                      },
                  {
                    label: 'To',
                    value: isAddress ? (
                      <span className="font-mono text-sm">{shortAddress(typed)}</span>
                    ) : (
                      (recipient.data?.profile?.name ?? typed)
                    ),
                  },
                  ...(prepare.data
                    ? [{ label: 'Fee', value: formatUsd(cashOf(prepare.data.send.feeRaw)) }]
                    : []),
                  ...(mode === 'cash'
                    ? [{ label: 'Left your account', value: formatUsd(Number(dollars)) }]
                    : []),
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
                ]}
              />
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
          }
        >
          {mode === 'cash'
            ? `${formatUsd(sent ?? Number(dollars))} is on its way. It usually arrives within a minute.`
            : 'The shares are on their way. They usually arrive within a minute.'}
        </SuccessState>
      </Screen>
    )

  if (step === 'amount')
    return (
      <Screen
        back={back}
        title={mode === 'cash' ? title : `Send ${holding!.stock.ticker}`}
        footer={
          <Button
            size="xl"
            disabled={amountRaw === 0n || over}
            onClick={() => setStep('destination')}
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
                <span className="text-destructive">You have {formatUsd(balanceUsd)}</span>
              ) : mode === 'stock' && amountRaw > 0n ? (
                `${formatShares(shares)} shares`
              ) : (
                `${formatUsd(balanceUsd)} available`
              )
            }
          />
          <div className="mb-4 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDollars((Math.floor(balanceUsd * 100) / 100).toFixed(2))}
            >
              Max
            </Button>
          </div>
        </div>
        <Keypad value={dollars} onChange={setDollars} />
      </Screen>
    )

  if (step === 'destination')
    return (
      <Screen
        back={back}
        title="Where to"
        footer={
          <>
            {prepare.error && (
              <p className="mb-3 text-center text-sm text-destructive">
                {errorMessage(prepare.error)}
              </p>
            )}
            <Button
              size="xl"
              disabled={!destinationReady || prepare.isPending}
              onClick={() =>
                prepare.mutate(
                  { token, destination: destination.trim(), amountRaw: amountRaw.toString() },
                  { onSuccess: () => setStep('review') },
                )
              }
            >
              {prepare.isPending ? 'Checking…' : 'Next'}
            </Button>
          </>
        }
      >
        <p className="pt-2 text-muted-foreground">
          Send to someone on Holdsake by their @username, or paste an address from an exchange or
          another account.
        </p>
        <Input
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder="@username or 0x…"
          aria-label="Who or where to send to"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cn(
            'mt-4 h-14 rounded-2xl border-0 bg-secondary px-4 text-base',
            isAddress && 'font-mono',
          )}
        />
        {isHandle && (
          <div className="mt-3">
            {recipient.isPending ? (
              <p className="px-1 text-sm text-muted-foreground">Looking…</p>
            ) : recipient.data?.found && recipient.data.profile ? (
              <ListRow
                leading={
                  <Avatar
                    name={recipient.data.profile.name ?? recipient.data.label}
                    url={recipient.data.profile.avatarUrl}
                  />
                }
                title={recipient.data.profile.name ?? recipient.data.label}
                subtitle={recipient.data.label}
              />
            ) : (
              <p className="px-1 text-sm text-destructive">No one on Holdsake has that username.</p>
            )}
          </div>
        )}
        {isAddress && (
          <p className="mt-4 text-sm text-muted-foreground">
            {mode === 'cash'
              ? 'This sends USDG on Robinhood Chain. Make sure the other side accepts it there.'
              : 'Double-check it: anything sent to the wrong address can’t be brought back.'}
          </p>
        )}
      </Screen>
    )

  return (
    <Screen
      back={back}
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
            disabled={confirm.isPending || !prepare.data}
            onClick={() =>
              prepare.data &&
              confirm.mutate(prepare.data, {
                onSuccess: () => {
                  setDoneAt(new Date())
                  setStep('done')
                },
              })
            }
          >
            {confirm.isPending ? 'Sending…' : `Send ${formatUsd(Number(dollars))}`}
          </Button>
        </>
      }
    >
      <p className="pt-2 pb-4 text-center font-number text-5xl font-bold tracking-tight tabular-nums">
        {formatUsd(Number(dollars))}
      </p>
      <Receipt
        rows={[
          {
            label: 'What',
            value: mode === 'cash' ? 'Cash' : `${formatShares(shares)} ${holding!.stock.ticker}`,
          },
          {
            label: 'To',
            value: isAddress ? (
              <span className="font-mono text-sm break-all">{typed}</span>
            ) : (
              (recipient.data?.profile?.name ?? typed)
            ),
          },
          ...(mode === 'cash' && sent !== null
            ? [{ label: 'They get', value: formatUsd(sent) }]
            : []),
          ...(sentShares !== null
            ? [{ label: 'They get', value: `${formatShares(sentShares)} ${holding!.stock.ticker}` }]
            : []),
          {
            label: 'Fee',
            value: prepare.data ? formatUsd(cashOf(prepare.data.send.feeRaw)) : '…',
          },
        ]}
      />
      <p className="mt-6 text-sm text-muted-foreground">
        The fee covers what sending costs us, at cost with a small buffer.{' '}
        {feeFromSend
          ? mode === 'cash'
            ? 'Your other cash doesn’t cover it, so it comes out of what you send.'
            : 'You don’t have enough left over to cover it, so it comes out of the shares you send.'
          : 'It comes from your cash, or from these shares if your cash is short.'}
      </p>
    </Screen>
  )
}

/** 0x1234…abcd: enough to recognise, short enough for one line; @usernames stay whole */
const shortAddress = (address: string) =>
  address.startsWith('0x') && address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address
