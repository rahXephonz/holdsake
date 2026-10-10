import { usePrivy } from '@privy-io/react-auth'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi, UserFacingError } from '@/lib/client/api'
import { avatarFrom } from '@/lib/client/avatar'
import type { CardTheme } from '@/lib/gift-cards'
import { getGiftPreview } from '@/lib/gift-preview'
import { useSignAndSubmit } from '@/lib/client/sign'
import type {
  ChartRange,
  BorrowView,
  CompanyProfile,
  EarnView,
  FundView,
  GiftView,
  Notification,
  Portfolio,
  PriceChart,
  Profile,
  PublicProfile,
  SignRequest,
  Stock,
} from '@/lib/types'

// Every browser fetch goes through a hook here, so cache keys and refetch rules live in one place.

export const keys = {
  me: ['me'] as const,
  stocks: ['stocks'] as const,
  stock: (ticker: string) => ['stocks', ticker] as const,
  portfolio: ['portfolio'] as const,
  notifications: ['notifications'] as const,
  handle: (handle: string) => ['handles', handle] as const,
  gifts: ['gifts'] as const,
  gift: (id: string) => ['gifts', id] as const,
  recipient: (value: string) => ['recipients', value] as const,
  giftQuote: (items: string, recipients: number) => ['gift-quote', items, recipients] as const,
  profile: (ticker: string) => ['stocks', ticker, 'profile'] as const,
  chart: (ticker: string, range: ChartRange) => ['stocks', ticker, 'chart', range] as const,
  funds: ['funds'] as const,
  earn: ['earn'] as const,
  borrow: ['borrow'] as const,
  fund: (id: string) => ['funds', id] as const,
}

/** Keyed by the account address too, so the profile refetches once a new account exists */
export function useProfileQuery(address: string | null, { enabled }: { enabled: boolean }) {
  const api = useApi()
  return useQuery({
    queryKey: [...keys.me, address],
    queryFn: () => api<Profile>('/api/me'),
    enabled,
  })
}

export function useStocksQuery() {
  return useQuery({
    queryKey: keys.stocks,
    queryFn: async () => {
      const response = await fetch('/api/stocks')
      if (!response.ok) throw new UserFacingError('Prices didn’t load. Try again.')
      const stocks: Stock[] = await response.json()
      return stocks
    },
    staleTime: 60_000,
  })
}

export function useStockQuery(ticker: string) {
  const stocks = useStocksQuery()
  return { ...stocks, data: stocks.data?.find((stock) => stock.ticker === ticker) ?? null }
}

export function usePortfolioQuery() {
  const api = useApi()
  const { authenticated } = usePrivy()
  return useQuery({
    queryKey: keys.portfolio,
    queryFn: () => api<Portfolio>('/api/portfolio'),
    enabled: authenticated,
    refetchInterval: 30_000,
  })
}

// Kinds that mean balances or gifts changed, so those screens refetch when one arrives
const MONEY_KINDS = new Set([
  'gift_received',
  'gift_opened',
  'gift_returned',
  'fund_contribution',
  'cash_received',
  'stock_received',
])

export function useNotificationsQuery() {
  const api = useApi()
  const queryClient = useQueryClient()
  const { authenticated } = usePrivy()
  return useQuery({
    queryKey: keys.notifications,
    queryFn: async () => {
      const previous = queryClient.getQueryData<Notification[]>(keys.notifications)
      const next = await api<Notification[]>('/api/notifications')
      // Skip the first load: nothing is new to someone who just opened the app
      if (previous) {
        const seen = new Set(previous.map((item) => item.id))
        const arrived = next.filter((item) => !seen.has(item.id) && MONEY_KINDS.has(item.kind))
        if (arrived.length) {
          void queryClient.invalidateQueries({ queryKey: keys.portfolio })
          void queryClient.invalidateQueries({ queryKey: keys.gifts })
          void queryClient.invalidateQueries({ queryKey: keys.funds })
        }
      }
      return next
    },
    enabled: authenticated,
    // New gifts and deposits show up without a reload while the app is open
    refetchInterval: 30_000,
  })
}

export function useMarkNotificationsRead() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/api/notifications', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.notifications }),
  })
}

export function useHandleAvailableQuery(handle: string) {
  const api = useApi()
  return useQuery({
    queryKey: keys.handle(handle),
    queryFn: () => api<{ available: boolean }>(`/api/handles/${encodeURIComponent(handle)}`),
    enabled: /^[a-z0-9_]{3,20}$/.test(handle),
    staleTime: 10_000,
  })
}

export type OnboardInput = {
  name: string
  handle: string
  country: string
  notUsPerson: boolean
  acceptTerms: boolean
}

export function useOnboardMutation() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OnboardInput) => api<Profile>('/api/me', { method: 'PATCH', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  })
}

export function useUpdateProfileMutation() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name?: string }) =>
      api<Profile>('/api/me', { method: 'PATCH', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  })
}

/** Crops and shrinks in the browser, then uploads; `null` removes the photo */
export function useAvatarMutation() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return api<Profile>('/api/avatar', { method: 'DELETE' })
      const form = new FormData()
      form.append('file', await avatarFrom(file))
      return api<Profile>('/api/avatar', { method: 'POST', body: form })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  })
}

export function useGiftsQuery() {
  const api = useApi()
  const { authenticated } = usePrivy()
  return useQuery({
    queryKey: keys.gifts,
    queryFn: () => api<GiftView[]>('/api/gifts'),
    enabled: authenticated,
  })
}

export function useGiftQuery(id: string) {
  const api = useApi()
  const { authenticated } = usePrivy()
  return useQuery({
    queryKey: keys.gift(id),
    queryFn: () => api<GiftView>(`/api/gifts/${id}`),
    enabled: authenticated,
  })
}

export type RecipientInput = { handle: string } | { email: string }

const recipientKey = (input: RecipientInput | null) =>
  input ? ('handle' in input ? `@${input.handle}` : input.email) : ''

/** Read-only lookup while typing; never creates anything on the server */
export function useRecipientQuery(input: RecipientInput | null) {
  const api = useApi()
  return useQuery({
    queryKey: keys.recipient(recipientKey(input)),
    queryFn: () =>
      api<{ found: boolean; profile: PublicProfile | null; label: string }>('/api/recipients', {
        method: 'POST',
        body: input,
      }),
    enabled: input !== null,
    staleTime: 30_000,
  })
}

export type GiftItemInput = { token: string; amountRaw: string }

export function useGiftQuoteQuery(items: GiftItemInput[], recipients: number) {
  const api = useApi()
  const key = JSON.stringify(items)
  return useQuery({
    queryKey: keys.giftQuote(key, recipients),
    queryFn: () =>
      api<{ feeRaw: string; decimals: number }>('/api/gifts/quote', {
        method: 'POST',
        body: { items, recipients },
      }),
    enabled: items.length > 0 && items.every((item) => item.amountRaw !== '0'),
    staleTime: 20_000,
  })
}

/**
 * One gift per recipient, built, signed and sent one after another: each operation needs the
 * account's next nonce (and, on a first send, the one-time setup), which only exists once the
 * previous one has landed. Stops at the first failure and says how many went through.
 */
export function useSendGiftMutation() {
  const api = useApi()
  const signAndSubmit = useSignAndSubmit()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      recipients: RecipientInput[]
      items: GiftItemInput[]
      message: string | null
      cardTheme: CardTheme
    }) => {
      const sent: string[] = []
      const stopped = (error?: unknown) => {
        if (sent.length === 0) {
          if (error instanceof UserFacingError) return error
          return new UserFacingError('This gift didn’t go through. Nothing left your account.')
        }
        return new UserFacingError(
          `${sent.length} of ${input.recipients.length} gifts went through. The rest didn’t, and nothing more left your account. Check your Gifts tab.`,
        )
      }
      for (const recipient of input.recipients) {
        let gift: SignRequest & { giftId: string }
        try {
          const { gifts } = await api<{ gifts: (SignRequest & { giftId: string })[] }>(
            '/api/gifts',
            { method: 'POST', body: { ...input, recipients: [recipient] } },
          )
          if (!gifts[0]) throw stopped()
          gift = gifts[0]
        } catch (error) {
          throw stopped(error)
        }
        const result = await signAndSubmit(gift).catch((error: unknown) => {
          throw stopped(error)
        })
        if (!result.ok) throw stopped()
        sent.push(gift.giftId)
      }
      return sent
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.gifts })
      void queryClient.invalidateQueries({ queryKey: keys.portfolio })
    },
  })
}

export function useSettleGiftMutation(id: string) {
  const api = useApi()
  const signAndSubmit = useSignAndSubmit()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (action: 'claim' | 'refund') => {
      const request = await api<SignRequest>(`/api/gifts/${id}/${action}`, { method: 'POST' })
      const result = await signAndSubmit(request)
      if (!result.ok) throw new UserFacingError('That didn’t go through. Try again.')
      return result
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.gifts })
      void queryClient.invalidateQueries({ queryKey: keys.portfolio })
    },
  })
}

/** Send shares or cash out, step one: the server builds it and fixes the exact fee */
/** A built send; `sentRaw` is what arrives, less than typed when the fee comes out of it */
export type SendRequest = SignRequest & { send: { sentRaw: string; feeRaw: string } }

export function usePrepareSendMutation() {
  const api = useApi()
  return useMutation({
    mutationFn: (input: { token: string; destination: string; amountRaw: string }) =>
      api<SendRequest>('/api/sends', { method: 'POST', body: input }),
  })
}

/** Step two for anything prepared: sign with no UI and submit */
export function useConfirmMutation() {
  const signAndSubmit = useSignAndSubmit()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (request: SignRequest) => {
      const result = await signAndSubmit(request)
      if (!result.ok)
        throw new UserFacingError('That didn’t go through. Nothing left your account.')
      return result
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.portfolio })
      void queryClient.invalidateQueries({ queryKey: keys.earn })
      void queryClient.invalidateQueries({ queryKey: keys.borrow })
    },
  })
}

export function useFundsQuery() {
  const api = useApi()
  const { authenticated } = usePrivy()
  return useQuery({
    queryKey: keys.funds,
    queryFn: () => api<FundView[]>('/api/funds'),
    enabled: authenticated,
  })
}

export function useFundQuery(id: string) {
  const api = useApi()
  const { ready } = usePrivy()
  return useQuery({
    queryKey: keys.fund(id),
    queryFn: () => api<FundView>(`/api/funds/${id}`),
    enabled: ready,
  })
}

export type CreateFundInput = {
  name: string
  purpose: 'college' | 'first_home' | 'wedding' | 'retirement' | 'other'
  goalUsd: number | null
  unlockAt: string
  beneficiaryHandle: string | null
  allocations: { ticker: string; percent: number }[]
}

/** Builds and signs in one go: creating a fund costs only the fee shown on the review step */
export function useCreateFundMutation() {
  const api = useApi()
  const signAndSubmit = useSignAndSubmit()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateFundInput) => {
      const request = await api<SignRequest & { fundId: string }>('/api/funds', {
        method: 'POST',
        body: input,
      })
      const result = await signAndSubmit(request)
      if (!result.ok)
        throw new UserFacingError('The fund wasn’t created. Nothing left your account.')
      return request.fundId
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.funds }),
  })
}

/** Cash into a fund: what was spent, the fee, and what each part bought */
export type FundCashRequest = SignRequest & {
  contribution: {
    /** Shares sold for the cash first, when they came from outside the mix */
    sold: { ticker: string; shares: number; cashRaw: string } | null
    spentRaw: string
    feeRaw: string
    buys: { ticker: string; cashRaw: string; shares: number }[]
  }
}

export function useFundActionMutation(id: string) {
  const api = useApi()
  const signAndSubmit = useSignAndSubmit()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      input:
        | { action: 'withdraw' }
        | {
            action: 'contribute'
            amounts: { token: string; amountRaw: string }[]
            note: string | null
          }
        | { action: 'contribute-cash'; cashRaw: string; note: string | null }
        | {
            action: 'contribute-sell'
            sell: { token: string; amountRaw: string }
            note: string | null
          },
    ) => {
      if (input.action === 'contribute-cash' || input.action === 'contribute-sell') {
        const request = await api<FundCashRequest>(`/api/funds/${id}/contribute-cash`, {
          method: 'POST',
          body:
            input.action === 'contribute-cash'
              ? { cashRaw: input.cashRaw, note: input.note }
              : { sell: input.sell, note: input.note },
        })
        const result = await signAndSubmit(request)
        if (!result.ok)
          throw new UserFacingError('That didn’t go through. Nothing left your account.')
        // What the cash bought, for the success screen
        return { ...result, contribution: request.contribution }
      }
      const request =
        input.action === 'withdraw'
          ? await api<SignRequest>(`/api/funds/${id}/withdraw`, { method: 'POST' })
          : await api<SignRequest>(`/api/funds/${id}/contribute`, {
              method: 'POST',
              body: { amounts: input.amounts, note: input.note },
            })
      const result = await signAndSubmit(request)
      if (!result.ok)
        throw new UserFacingError('That didn’t go through. Nothing left your account.')
      return { ...result, contribution: null }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.fund(id) })
      void queryClient.invalidateQueries({ queryKey: keys.funds })
      void queryClient.invalidateQueries({ queryKey: keys.portfolio })
    },
  })
}

export type TradeRequest = SignRequest & {
  quote: {
    side: 'buy' | 'sell'
    spendRaw: string
    receiveRaw: string
    minReceiveRaw: string
    tradeFeeRaw: string
    gasFeeRaw: string
    /** The market's own fee, Uniswap units (10_000 = 1%), already inside the amounts */
    poolFee: number
  }
}

/** Buy or sell, step one: the server quotes it and fixes the fees; step two is useConfirmMutation */
export function usePrepareTradeMutation() {
  const api = useApi()
  return useMutation({
    mutationFn: (input: { ticker: string; side: 'buy' | 'sell'; amountRaw: string }) =>
      api<TradeRequest>('/api/trades', { method: 'POST', body: input }),
  })
}

/** Public data: plain fetch, no account needed */
async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) throw new UserFacingError('Couldn’t load this. Try again.')
  const data: T = await response.json()
  return data
}

export function useStockProfileQuery(ticker: string) {
  return useQuery({
    queryKey: keys.profile(ticker),
    queryFn: () =>
      getJson<CompanyProfile | null>(`/api/stocks/${encodeURIComponent(ticker)}/profile`),
    staleTime: 60 * 60_000,
  })
}

export function usePriceChartQuery(ticker: string, range: ChartRange) {
  return useQuery({
    queryKey: keys.chart(ticker, range),
    queryFn: () =>
      getJson<PriceChart>(`/api/stocks/${encodeURIComponent(ticker)}/chart?range=${range}`),
    staleTime: range === '1D' ? 60_000 : 10 * 60_000,
    placeholderData: (previous) => previous,
  })
}

export function useEarnQuery() {
  const api = useApi()
  const { authenticated } = usePrivy()
  return useQuery({
    queryKey: keys.earn,
    queryFn: () => api<EarnView>('/api/earn'),
    enabled: authenticated,
    // Interest grows every block; a minute is plenty for a number shown to the cent
    refetchInterval: 60_000,
  })
}

export function useSetEarnTargetMutation() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ticker: string) =>
      api<{ ok: boolean }>('/api/earn', { method: 'PUT', body: { ticker } }),
    onMutate: (ticker) => {
      // The chip moves at once; the server only records the choice
      queryClient.setQueryData<EarnView>(keys.earn, (current) =>
        current ? { ...current, targetTicker: ticker } : current,
      )
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.earn }),
  })
}

/** `depositRaw` is what goes in: less than typed when the fee comes out of it */
export type EarnDepositRequest = SignRequest & { deposit: { depositRaw: string; feeRaw: string } }

export type EarnClaimRequest = SignRequest & {
  claim: { ticker: string; interestRaw: string; expectedShares: number }
}

/** Builds an Earn deposit, withdrawal or claim; the screen reviews it, then signs */
export function usePrepareEarnMutation() {
  const api = useApi()
  return useMutation({
    mutationFn: (
      input:
        | { kind: 'deposit'; amountRaw: string }
        // amountRaw: raw cash units, or 'all' to take everything out
        | { kind: 'withdraw'; amountRaw: string }
        | { kind: 'claim' },
    ) =>
      input.kind === 'claim'
        ? api<EarnClaimRequest>('/api/earn/claim', { method: 'POST' })
        : api<SignRequest | EarnDepositRequest>(`/api/earn/${input.kind}`, {
            method: 'POST',
            body: { amountRaw: input.amountRaw },
          }),
  })
}

/** A gift's public preview, for the sign-in screen when someone arrives through its link */
export function useGiftPreviewQuery(id: string | null) {
  return useQuery({
    queryKey: ['gift-preview', id],
    queryFn: () => (id ? getGiftPreview({ data: id }) : null),
    enabled: id !== null,
    staleTime: 60_000,
  })
}

export function useBorrowQuery() {
  const api = useApi()
  const { authenticated } = usePrivy()
  return useQuery({
    queryKey: keys.borrow,
    queryFn: () => api<BorrowView>('/api/borrow'),
    enabled: authenticated,
    // Prices move the safety numbers; a minute keeps them honest without hammering the chain
    refetchInterval: 60_000,
  })
}

export type LoanRequest = SignRequest & {
  loan: {
    ticker: string
    borrowRaw: string
    lockShares: number
    lockUsd: number
    fallPct: number | null
    liquidationPricePerShare: number | null
    penaltyPct: number
    apy: number | null
  }
}

/** Builds opening/adding to a loan, paying back, or taking shares back */
export function usePrepareBorrowMutation() {
  const api = useApi()
  return useMutation({
    mutationFn: (
      input:
        | { kind: 'open'; ticker: string; borrowRaw: string }
        // amountRaw: raw units, or 'all'
        | { kind: 'repay' | 'take-back'; ticker: string; amountRaw: string },
    ) =>
      input.kind === 'open'
        ? api<LoanRequest>('/api/borrow/open', {
            method: 'POST',
            body: { ticker: input.ticker, borrowRaw: input.borrowRaw },
          })
        : api<SignRequest>(`/api/borrow/${input.kind}`, {
            method: 'POST',
            body: { ticker: input.ticker, amountRaw: input.amountRaw },
          }),
  })
}
