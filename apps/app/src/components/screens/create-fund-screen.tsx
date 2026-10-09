import { useNavigate } from '@tanstack/react-router'
import { CheckIcon } from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'
import { ListRow } from '@/components/list-row'
import { Receipt } from '@/components/receipt'
import { PURPOSE_KEYS, PURPOSES, unlockLabel } from '@/components/screens/funds-screen'
import { Loading, Screen, RowsSkeleton } from '@/components/screen'
import { StockLogo } from '@/components/stock-logo'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { errorMessage } from '@/lib/client/api'
import { type CreateFundInput, useCreateFundMutation, useStocksQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { cn } from '@/lib/utils'

const MAX_STOCKS = 3

/** Splits 100 as evenly as whole percents allow, the remainder going to the first picks */
function evenSplit(count: number): number[] {
  const base = Math.floor(100 / count)
  return Array.from({ length: count }, (_, index) => base + (index < 100 - base * count ? 1 : 0))
}

export default function CreateFundScreen() {
  const session = useSession()
  const stocks = useStocksQuery()
  const create = useCreateFundMutation()
  const navigate = useNavigate()

  const [step, setStep] = useState<'details' | 'mix' | 'review'>('details')
  const [name, setName] = useState('')
  const [forWhom, setForWhom] = useState<'me' | 'someone'>('me')
  const [handle, setHandle] = useState('')
  const [purpose, setPurpose] = useState<CreateFundInput['purpose']>('college')
  const [unlockDate, setUnlockDate] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [customDate, setCustomDate] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Read the clock once: the earliest and latest dates the contract takes (a day out, 25 years
  // at most) and the quick picks between them
  const [{ tomorrow, latest, presets }] = useState(() => {
    const now = new Date()
    const day = toDay
    const yearsOut = (years: number) => {
      const date = new Date(now)
      date.setFullYear(date.getFullYear() + years)
      return day(date)
    }
    return {
      tomorrow: day(new Date(now.getTime() + 2 * 24 * 3600 * 1000)),
      latest: yearsOut(25),
      presets: [1, 5, 10, 18].map((years) => ({ years, date: yearsOut(years) })),
    }
  })

  if (!session.ready) return <Loading />

  const detailsReady =
    name.trim() !== '' &&
    unlockDate >= tomorrow &&
    unlockDate <= latest &&
    (forWhom === 'me' || handle.trim().length >= 3)
  const split = evenSplit(Math.max(picked.length, 1))
  const allocations = picked.map((ticker, index) => ({ ticker, percent: split[index]! }))

  const toggle = (ticker: string) =>
    setPicked((current) =>
      current.includes(ticker)
        ? current.filter((value) => value !== ticker)
        : current.length < MAX_STOCKS
          ? [...current, ticker]
          : current,
    )

  if (step === 'details')
    return (
      <Screen
        back="/funds"
        title="New fund"
        footer={
          <Button size="xl" disabled={!detailsReady} onClick={() => setStep('mix')}>
            Next
          </Button>
        }
      >
        <div className="flex flex-col gap-8 pt-2 pb-6">
          <Field label="Name it" htmlFor="fund-name">
            <Input
              id="fund-name"
              value={name}
              maxLength={60}
              placeholder="Aisyah’s college fund"
              onChange={(event) => setName(event.target.value)}
              className={FIELD}
            />
          </Field>

          <Field
            label="Who it’s for"
            hint={
              forWhom === 'me'
                ? 'Only you can take it out, once it unlocks.'
                : 'Only they can take it out, once it unlocks.'
            }
          >
            <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
              {(['me', 'someone'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={forWhom === value}
                  onClick={() => setForWhom(value)}
                  className={cn(
                    'h-11 rounded-full text-sm font-medium transition-colors',
                    forWhom === value
                      ? 'bg-background shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {value === 'me' ? 'Me' : 'Someone else'}
                </button>
              ))}
            </div>
            {forWhom === 'someone' && (
              <Input
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder="@username on Holdsake"
                aria-label="Their username"
                autoCapitalize="none"
                autoCorrect="off"
                className={cn(FIELD, 'mt-2')}
              />
            )}
          </Field>

          <Field label="What it’s for">
            <div className="flex flex-wrap gap-2">
              {PURPOSE_KEYS.map((key) => (
                <Chip key={key} selected={purpose === key} onClick={() => setPurpose(key)}>
                  {PURPOSES[key]}
                </Chip>
              ))}
            </div>
          </Field>

          <Field
            label="Unlocks"
            hint="Nobody can take anything out before this date, not even you. It can’t be changed."
          >
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Chip
                  key={preset.years}
                  selected={!customDate && unlockDate === preset.date}
                  onClick={() => {
                    setCustomDate(false)
                    setUnlockDate(preset.date)
                  }}
                >
                  {preset.years === 1 ? 'In 1 year' : `${preset.years} years`}
                </Chip>
              ))}
              <Chip selected={customDate} onClick={() => setPickerOpen(true)}>
                {customDate ? 'Another date' : 'Pick a date'}
              </Chip>
            </div>
            <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
              <SheetContent
                side="bottom"
                className="mx-auto max-w-md rounded-t-3xl border-0 px-5 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]"
              >
                <SheetHeader className="px-0">
                  <SheetTitle className="text-lg">When should it unlock?</SheetTitle>
                </SheetHeader>
                <Calendar
                  mode="single"
                  captionLayout="dropdown"
                  // Opens on the chosen date, or a year out: where most funds land
                  defaultMonth={fromDay(unlockDate || presets[0]!.date)}
                  startMonth={fromDay(tomorrow)}
                  endMonth={fromDay(latest)}
                  disabled={{ before: fromDay(tomorrow), after: fromDay(latest) }}
                  selected={unlockDate ? fromDay(unlockDate) : undefined}
                  onSelect={(date) => {
                    if (!date) return
                    setUnlockDate(toDay(date))
                    setCustomDate(true)
                    setPickerOpen(false)
                  }}
                />
              </SheetContent>
            </Sheet>
            {unlockDate && (
              <p className="mt-3 font-medium">Unlocks {unlockLabel(`${unlockDate}T00:00:00`)}</p>
            )}
          </Field>
        </div>
      </Screen>
    )

  if (step === 'mix')
    return (
      <Screen
        back="/funds"
        title="Pick up to 3 stocks"
        footer={
          <Button size="xl" disabled={picked.length === 0} onClick={() => setStep('review')}>
            Next
          </Button>
        }
      >
        <p className="pt-2 text-muted-foreground">
          The fund holds these. People add shares of them; the mix can’t change later.
        </p>
        <div className="mt-2 pb-6">
          {stocks.isPending && <RowsSkeleton rows={6} />}
          {stocks.data?.map((stock) => {
            const index = picked.indexOf(stock.ticker)
            return (
              <ListRow
                key={stock.address}
                onClick={() => toggle(stock.ticker)}
                leading={<StockLogo ticker={stock.ticker} logoUrl={stock.logoUrl} />}
                title={stock.name}
                subtitle={stock.ticker}
                value={
                  index >= 0 ? (
                    <span className="flex items-center gap-1">
                      {split[index]}% <CheckIcon className="size-4" />
                    </span>
                  ) : undefined
                }
              />
            )
          })}
        </div>
      </Screen>
    )

  const unlockAt = new Date(`${unlockDate}T12:00:00Z`).toISOString()
  const submit = () =>
    create.mutate(
      {
        name: name.trim(),
        purpose,
        goalUsd: null,
        unlockAt,
        beneficiaryHandle: forWhom === 'someone' ? handle.trim().replace(/^@/, '') : null,
        allocations,
      },
      {
        onSuccess: (fundId) =>
          void navigate({ to: '/fund/$id', params: { id: fundId }, replace: true }),
      },
    )

  return (
    <Screen
      back="/funds"
      title="Review"
      footer={
        <>
          {create.error && (
            <p className="mb-3 text-center text-sm text-destructive">
              {errorMessage(create.error)}
            </p>
          )}
          <Button size="xl" disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Creating…' : 'Create fund'}
          </Button>
        </>
      }
    >
      <h1 className="pt-2 pb-4 text-3xl font-bold tracking-tight">{name}</h1>
      <Receipt
        rows={[
          { label: 'For', value: forWhom === 'me' ? 'You' : `@${handle.trim().replace(/^@/, '')}` },
          { label: 'Purpose', value: PURPOSES[purpose] },
          { label: 'Unlocks', value: unlockLabel(unlockAt) },
          {
            label: 'Mix',
            value: allocations.map((item) => `${item.ticker} ${item.percent}%`).join(', '),
          },
        ]}
      />
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        None of this can change once it’s created. Creating it costs a small fee, at cost with a
        small buffer, from your cash.
      </p>
    </Screen>
  )
}

// Dates move as plain YYYY-MM-DD in the person's own calendar; going through toISOString would
// shift them a day for anyone east or west of UTC
const fromDay = (day: string) => {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}
const toDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// One look for every text field here: tall, flat, no border
const FIELD = 'h-14 rounded-2xl border-0 bg-secondary px-4 text-base shadow-none'

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={htmlFor} className="text-base font-medium">
        {label}
      </Label>
      <div>{children}</div>
      {hint && <p className="text-sm leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'h-10 rounded-full px-4 text-sm font-medium transition-colors',
        selected ? 'bg-foreground text-background' : 'bg-secondary hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}
