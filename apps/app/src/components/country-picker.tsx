import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type CountryOption = { code: string; name: string; blocked: boolean }

/** The flag emoji for an ISO 3166-1 alpha-2 code: two regional indicator letters */
export const flagOf = (code: string) => {
  const upper = code.toUpperCase()
  // Codes are two ASCII letters, so indexing by char is safe here
  return String.fromCodePoint(0x1f1a5 + upper.charCodeAt(0), 0x1f1a5 + upper.charCodeAt(1))
}

/**
 * A field that opens a bottom sheet of countries with flags and a search, in place of a native
 * select's long scroll. Countries we can't serve stay in the list, marked, so people find
 * theirs and learn why instead of thinking it's missing.
 */
export function CountryPicker({
  id,
  countries,
  value,
  onChange,
}: {
  id?: string
  countries: CountryOption[]
  value: string
  onChange: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = countries.find((country) => country.code === value)

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return countries
    return countries.filter(
      (country) =>
        country.name.toLowerCase().includes(needle) || country.code.toLowerCase() === needle,
    )
  }, [countries, query])

  return (
    <>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center gap-3 rounded-lg border border-input bg-transparent px-3 text-left text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {selected ? (
          <>
            <span className="text-xl leading-none" aria-hidden="true">
              {flagOf(selected.code)}
            </span>
            <span className="flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">Choose a country</span>
        )}
        <CaretDownIcon className="size-4 text-muted-foreground" />
      </button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery('')
        }}
      >
        <SheetContent
          side="bottom"
          // Same data-attribute selector as the sheet's own h-auto, so this height wins and the list
          // scrolls inside it instead of growing the sheet past the screen
          className="mx-auto max-w-md gap-0 rounded-t-3xl border-0 px-5 pt-2 pb-[env(safe-area-inset-bottom)] data-[side=bottom]:h-[70dvh]"
        >
          <SheetHeader className="px-0">
            <SheetTitle className="text-lg">Where you live</SheetTitle>
          </SheetHeader>
          <div className="relative mb-2">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search countries"
              autoCorrect="off"
              className="h-11 rounded-full border-0 bg-secondary pl-9 text-base"
            />
          </div>
          <ul
            className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4"
            aria-label="Countries"
          >
            {shown.map((country) => (
              <li key={country.code}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(country.code)
                    setOpen(false)
                    setQuery('')
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-muted/60',
                    country.code === value && 'bg-secondary',
                  )}
                >
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {flagOf(country.code)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{country.name}</span>
                    {country.blocked && (
                      <span className="block text-sm text-muted-foreground">
                        Not available here yet
                      </span>
                    )}
                  </span>
                  {country.code === value && <CheckIcon className="size-5" weight="bold" />}
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-2 py-8 text-center text-muted-foreground">No country matches.</li>
            )}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}
