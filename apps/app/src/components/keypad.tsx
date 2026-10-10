import { BackspaceIcon } from '@phosphor-icons/react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const

/** Applies one key to a dollar string: at most two decimals, no leading zeros, capped length */
export function pressKey(value: string, key: (typeof KEYS)[number]): string {
  if (key === 'back') return value.length > 1 ? value.slice(0, -1) : '0'
  if (key === '.') return value.includes('.') ? value : `${value}.`
  const [, decimals] = value.split('.')
  if (decimals !== undefined && decimals.length >= 2) return value
  if (value.replace('.', '').length >= 9) return value
  return value === '0' ? key : value + key
}

/** Full-width number pad, the way amounts are typed everywhere (no form field) */
export function Keypad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-x-1 gap-y-3 select-none">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(pressKey(value, key))}
          aria-label={key === 'back' ? 'Delete' : key === '.' ? 'Decimal point' : key}
          className="flex h-16 items-center justify-center rounded-2xl font-number text-4xl font-semibold tabular-nums active:bg-muted"
        >
          {key === 'back' ? <BackspaceIcon className="size-6" /> : key}
        </button>
      ))}
    </div>
  )
}

/** The amount as the hero of the screen */
export function AmountDisplay({ value, hint }: { value: string; hint?: React.ReactNode }) {
  const length = value.length
  const size = length > 9 ? 'text-5xl' : length > 6 ? 'text-6xl' : 'text-7xl'
  return (
    <div className="flex flex-col items-center py-6">
      <p className={`${size} font-number font-bold tracking-tight tabular-nums`} aria-live="polite">
        ${value}
      </p>
      {hint && <p className="mt-2 font-number text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}
