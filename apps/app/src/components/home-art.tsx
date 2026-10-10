// Small flat drawings for the Home cards, in the gift cards' paper-cut style but held to the
// app's palette: ink and paper, with green only where it means growth.

const tile = 'flex size-14 shrink-0 items-center justify-center rounded-2xl bg-background'

/** A stack of coins with a sprout growing out of it */
export function EarnArt() {
  return (
    <span className={tile} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="size-11">
        <rect x="14" y="46" width="32" height="9" rx="4.5" className="fill-foreground" />
        <rect x="11" y="36" width="32" height="9" rx="4.5" className="fill-foreground" />
        <rect x="16" y="26" width="32" height="9" rx="4.5" className="fill-foreground" />
        <rect x="21" y="29.5" width="10" height="2" rx="1" className="fill-background" />
        <rect x="16" y="39.5" width="10" height="2" rx="1" className="fill-background" />
        <rect x="19" y="49.5" width="10" height="2" rx="1" className="fill-background" />
        <rect x="31" y="12" width="3" height="15" rx="1.5" className="fill-gain" />
        <path d="M32.5 17 C26 17 21 13 20 6 C27 6 32 10 32.5 17Z" className="fill-gain" />
        <path d="M32.5 14 C38 14 43 10.5 44 4.5 C38 4.5 33 8 32.5 14Z" className="fill-gain" />
      </svg>
    </span>
  )
}

/** Shares standing as bars, with cash lifting out of them while they stay put */
export function BorrowArt() {
  return (
    <span className={tile} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="size-11">
        <rect x="8" y="38" width="10" height="18" rx="2.5" className="fill-foreground" />
        <rect x="21" y="28" width="10" height="28" rx="2.5" className="fill-foreground" />
        <rect x="34" y="34" width="10" height="22" rx="2.5" className="fill-foreground" />
        <rect x="6" y="55" width="40" height="3" rx="1.5" className="fill-foreground" />
        <path
          d="M30 20 C34 12 40 9 45 10"
          className="fill-none stroke-foreground"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="1 5"
        />
        <circle cx="50" cy="13" r="10" className="fill-foreground" />
        <path
          d="M53.5 9.5 C52.5 8 46.5 7.5 46.5 11 C46.5 14.5 53.5 11.8 53.5 15.2 C53.5 18.5 47.5 18 46.5 16.5 M50 6 V20"
          className="fill-none stroke-background"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
