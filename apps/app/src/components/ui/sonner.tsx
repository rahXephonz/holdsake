import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon } from '@phosphor-icons/react'
import { Spinner } from '@/components/ui/spinner'

// CSS variables aren't keys of CSSProperties; a plain record of them is still assignable
const TOASTER_STYLE: React.CSSProperties = Object.fromEntries([
  ['--normal-bg', 'var(--popover)'],
  ['--normal-text', 'var(--popover-foreground)'],
  ['--normal-border', 'var(--border)'],
  ['--border-radius', 'var(--radius)'],
])

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // Light only (AGENT.md "Design")
      theme="light"
      className="toaster group"
      icons={{
        success: <CheckCircleIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <WarningIcon className="size-4" />,
        error: <XCircleIcon className="size-4" />,
        loading: <Spinner size={16} />,
      }}
      style={TOASTER_STYLE}
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
