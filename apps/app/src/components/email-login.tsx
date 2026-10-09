import { useLoginWithEmail } from '@privy-io/react-auth'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const CODE_LENGTH = 6
const RESEND_SECONDS = 45

/** Email, then a 6-digit code. Privy treats sign-in and sign-up as the same flow */
export function EmailLogin() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)
  const { sendCode, loginWithCode, state } = useLoginWithEmail()

  useEffect(() => {
    if (resendIn <= 0) return undefined
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function requestCode(event?: { preventDefault(): void }) {
    event?.preventDefault()
    setError(null)
    try {
      await sendCode({ email: email.trim() })
      setStep('code')
      setResendIn(RESEND_SECONDS)
      setTimeout(() => codeInput.current?.focus(), 50)
    } catch {
      setError('We couldn’t send a code to that email. Check it and try again.')
    }
  }

  async function submitCode(value: string) {
    setError(null)
    try {
      await loginWithCode({ code: value })
    } catch {
      setError('That code didn’t work. Check the latest email and try again.')
      setCode('')
    }
  }

  if (step === 'email')
    return (
      <form onSubmit={requestCode} className="mt-2 flex flex-1 flex-col gap-7">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">What’s your email?</h1>
          <p className="text-muted-foreground">
            We’ll send you a 6-digit code. No password needed.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-12 text-base"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="mt-auto flex flex-col gap-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          <Button
            type="submit"
            size="xl"
            disabled={!email.includes('@') || state.status === 'sending-code'}
          >
            {state.status === 'sending-code' ? 'Sending…' : 'Send code'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            New here? We’ll create your account after you verify.
          </p>
        </div>
      </form>
    )

  const submitting = state.status === 'submitting-code'
  return (
    <div className="mt-2 flex flex-1 flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Enter the code</h1>
        <p className="text-muted-foreground">
          Sent to <span className="text-foreground">{email}</span> ·{' '}
          <button
            type="button"
            className="text-foreground underline"
            onClick={() => setStep('email')}
          >
            Change
          </button>
        </p>
      </div>

      <label className="group relative grid grid-cols-6 gap-2">
        <span className="sr-only">6-digit code</span>
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <span
            key={index}
            className={cn(
              'flex h-15 min-w-0 items-center justify-center rounded-2xl bg-secondary font-number text-2xl font-medium tabular-nums',
              index === code.length && !submitting && 'ring-2 ring-foreground',
            )}
          >
            {code[index] ?? ''}
          </span>
        ))}
        <input
          ref={codeInput}
          className="absolute inset-0 h-full w-full caret-transparent opacity-0"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          value={code}
          disabled={submitting}
          onChange={(event) => {
            const value = event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
            setCode(value)
            if (value.length === CODE_LENGTH) void submitCode(value)
          }}
        />
      </label>

      {error && <p className="-mt-3 text-sm text-destructive">{error}</p>}

      <p className="text-sm text-muted-foreground">
        {resendIn > 0 ? (
          `Didn’t get it? Resend in 0:${String(resendIn).padStart(2, '0')}`
        ) : (
          <button type="button" className="text-foreground underline" onClick={() => requestCode()}>
            Resend code
          </button>
        )}
      </p>

      <div className="mt-auto flex flex-col gap-3 pb-[max(20px,env(safe-area-inset-bottom))]">
        <Button
          size="xl"
          disabled={code.length < CODE_LENGTH || submitting}
          onClick={() => submitCode(code)}
        >
          {submitting ? 'Checking…' : 'Verify'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Check your spam folder if it’s not there.
        </p>
      </div>
    </div>
  )
}
