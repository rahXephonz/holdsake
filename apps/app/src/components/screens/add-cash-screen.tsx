import { CheckIcon, CopyIcon, ExportIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { QRCodeSVG } from 'qrcode.react'
import { Fragment, useState, useSyncExternalStore } from 'react'
import { Loading, Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/client/session'
import { cn } from '@/lib/utils'

/**
 * The one screen allowed to name the network and the asset (AGENT.md rules): exchanges need the
 * exact details, and a deposit on the wrong network is lost.
 */
export default function AddCashScreen() {
  const session = useSession()
  const [copied, setCopied] = useState(false)
  // navigator.share only exists in the browser, and mostly on phones; false on the server
  const canShare = useSyncExternalStore(
    noop,
    () => typeof navigator.share === 'function',
    () => false,
  )

  if (!session.ready || !session.profile?.address) return <Loading />
  const address = session.profile.address

  const copy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const share = async () => {
    try {
      await navigator.share({ text: address })
    } catch {
      // Closing the share sheet rejects; nothing to do
    }
  }

  return (
    <Screen
      back="/"
      title="Add cash"
      footer={
        <div className="flex gap-3">
          {canShare && (
            <Button size="xl" variant="secondary" className="w-auto px-6" onClick={share}>
              <ExportIcon />
              Share
            </Button>
          )}
          <Button size="xl" className="flex-1" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? 'Copied' : 'Copy address'}
          </Button>
        </div>
      }
    >
      <p className="pt-2 text-center text-muted-foreground">
        Scan or copy this address on an exchange or another account. Cash shows up here in about a
        minute.
      </p>

      <section className="mt-6 flex flex-col items-center rounded-3xl bg-secondary px-6 pt-6 pb-5">
        <div className="rounded-2xl bg-white p-4">
          {/* Plain address: what exchanges' scanners expect. The logo covers the middle, so the
              code carries the highest error correction to stay readable around it */}
          <QRCodeSVG
            value={address}
            size={192}
            level="H"
            marginSize={0}
            bgColor="#ffffff"
            fgColor="#111111"
            title="Deposit address"
            imageSettings={{ src: '/icons/logo.svg', width: 44, height: 44, excavate: true }}
          />
        </div>
        <span className="mt-4 flex items-center gap-2 rounded-full bg-background py-1 pr-3 pl-1 text-xs font-medium">
          <span className="flex -space-x-1.5">
            <Logo src={USDG_LOGO} size={20} />
            <Logo src={CHAIN_LOGO} size={20} className="ring-2 ring-background" />
          </span>
          USDG on Robinhood Chain
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy deposit address"
          className="mt-4 rounded-xl px-2 py-1 text-center font-mono text-[15px] leading-relaxed text-balance hover:bg-background/60"
        >
          <AddressChunks address={address} />
        </button>
      </section>

      <dl className="mt-6">
        <Detail label="Asset" value="USDG (Global Dollar)" logo={USDG_LOGO} />
        <Detail label="Network" value="Robinhood Chain" logo={CHAIN_LOGO} />
      </dl>

      <p className="mt-4 mb-6 flex gap-3 rounded-2xl bg-secondary p-4 text-sm leading-relaxed">
        <WarningCircleIcon className="mt-0.5 size-5 shrink-0" />
        <span>
          Only send USDG on Robinhood Chain. Anything else, or the same coin on another network,
          can’t be recovered.
        </span>
      </p>
    </Screen>
  )
}

const noop = () => () => {}

// Self-hosted copies: USDG from CoinGecko, the chain's from Safe's chain list
const USDG_LOGO = '/logos/usdg.png'
const CHAIN_LOGO = '/logos/robinhood-chain.png'

/** Groups of four with the ends in full strength, so people can check it against the sender */
function AddressChunks({ address }: { address: string }) {
  const groups = address.slice(2).match(/.{1,4}/g) ?? []
  // Spaces sit between groups, never inside one, so a line only wraps at a group boundary
  return groups.map((group, index) => (
    <Fragment
      // Same group text can repeat; position is the identity
      // oxlint-disable-next-line react/no-array-index-key
      key={index}
    >
      {index > 0 && ' '}
      <span
        className={cn(
          'whitespace-nowrap',
          index !== 0 && index !== groups.length - 1 && 'text-muted-foreground',
        )}
      >
        {index === 0 ? `0x${group}` : group}
      </span>
    </Fragment>
  ))
}

function Detail({ label, value, logo }: { label: string; value: string; logo: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2 text-right font-medium">
        <Logo src={logo} size={20} />
        {value}
      </dd>
    </div>
  )
}

function Logo({ src, size, className }: { src: string; size: number; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 rounded-full', className)}
    />
  )
}
