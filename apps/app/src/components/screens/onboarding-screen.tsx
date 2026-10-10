import { usePrivy } from '@privy-io/react-auth'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AvatarPicker } from '@/components/avatar-picker'
import { Loading, Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CountryPicker } from '@/components/country-picker'
import { errorMessage } from '@/lib/client/api'
import { safeNext } from '@/lib/client/next'
import { useHandleAvailableQuery, useOnboardMutation } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { countryOptions } from '@/lib/countries'
import { HANDLE_PATTERN, normalizeHandle } from '@/lib/handles'

export default function OnboardingScreen({ next }: { next?: string }) {
  const { authenticated, ready } = usePrivy()
  const session = useSession({ required: false })
  const navigate = useNavigate()
  const destination = safeNext(next)
  const onboard = useOnboardMutation()
  const countries = useMemo(() => countryOptions(), [])

  // Untouched, it shows the name we already have (from Google, say)
  const [nameInput, setName] = useState<string | null>(null)
  const [handle, setHandle] = useState('')
  const [country, setCountry] = useState('')
  const [notUsPerson, setNotUsPerson] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)

  const normalized = normalizeHandle(handle)
  const handleValid = HANDLE_PATTERN.test(normalized)
  const available = useHandleAvailableQuery(normalized)
  const blocked = countries.find((option) => option.code === country)?.blocked ?? false

  useEffect(() => {
    if (ready && !authenticated) void navigate({ to: '/login', replace: true })
    if (session.profile?.onboarded) void navigate({ to: destination, replace: true })
  }, [ready, authenticated, session.profile, destination, navigate])

  if (!session.profile || session.profile.onboarded) return <Loading />
  const name = nameInput ?? session.profile.name ?? ''

  const canSubmit =
    name.trim().length > 0 &&
    handleValid &&
    available.data?.available === true &&
    country !== '' &&
    !blocked &&
    notUsPerson &&
    acceptTerms

  const submit = () =>
    onboard.mutate(
      { name: name.trim(), handle: normalized, country, notUsPerson, acceptTerms },
      { onSuccess: () => void navigate({ to: destination, replace: true }) },
    )

  return (
    <Screen
      title=""
      footer={
        <>
          {onboard.error && (
            <p className="mb-3 text-center text-sm text-destructive">
              {errorMessage(onboard.error)}
            </p>
          )}
          <Button size="xl" disabled={!canSubmit || onboard.isPending} onClick={submit}>
            {onboard.isPending ? 'Setting up…' : 'Continue'}
          </Button>
        </>
      }
    >
      <h1 className="pt-2 text-3xl font-bold tracking-tight">Set up your account</h1>
      <p className="mt-2 text-muted-foreground">People find you by your @name to send you gifts.</p>

      <div className="mt-8 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-1">
          <AvatarPicker name={name} url={session.profile.avatarUrl} size={88} removable />
          <p className="text-sm text-muted-foreground">
            {session.profile.avatarUrl
              ? 'This shows on gifts you send.'
              : 'Add a photo, if you like. It shows on gifts you send.'}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            value={name}
            maxLength={60}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="handle">Username</Label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
              @
            </span>
            <Input
              id="handle"
              value={handle}
              maxLength={21}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setHandle(event.target.value)}
              className="h-12 pl-7 text-base"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {handle === ''
              ? 'Letters, numbers and underscores, 3 to 20 long.'
              : !handleValid
                ? 'Use 3 to 20 letters, numbers or underscores.'
                : available.isPending
                  ? 'Checking…'
                  : available.data?.available
                    ? `@${normalized} is yours if you want it.`
                    : `@${normalized} is taken.`}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country">Where you live</Label>
          <CountryPicker id="country" countries={countries} value={country} onChange={setCountry} />
          {blocked && (
            <p className="text-sm text-destructive">
              Holdsake isn’t available in this country yet.
            </p>
          )}
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="not-us-person"
            checked={notUsPerson}
            onCheckedChange={(checked) => setNotUsPerson(checked)}
            className="mt-0.5"
          />
          <Label htmlFor="not-us-person" className="leading-snug font-normal">
            I’m not a US citizen or resident, and I don’t live in the US.
          </Label>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="accept-terms"
            checked={acceptTerms}
            onCheckedChange={(checked) => setAcceptTerms(checked)}
            className="mt-0.5"
          />
          <Label htmlFor="accept-terms" className="leading-snug font-normal">
            I agree to the terms. Shares here track real stocks but aren’t the stocks themselves,
            and their value can go down as well as up.
          </Label>
        </div>
      </div>
    </Screen>
  )
}
