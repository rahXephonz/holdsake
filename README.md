<p align="center">
  <img src="apps/app/public/icons/logo.svg" width="96" alt="Holdsake" />
</p>

<h1 align="center">Holdsake</h1>

<p align="center">
  <b>Give real stocks, not gift cards.</b><br />
  Holdsake turns tokenized stocks into gifts anyone can open and goal funds that unlock on a date.
  No wallet, no gas to manage, no crypto know-how.
</p>

<p align="center">
  <a href="https://holdsake.vercel.app">holdsake.vercel.app</a>
</p>

---

## What it does

- **Gifts.** Send shares of a real company, cash, or both to an email, an @handle or an account.
  Only the recipient can open it. Unopened gifts go back to the sender after 30 days, and every gift
  comes wrapped in a greeting card (birthday, angpao, Lebaran, Christmas, graduation, wedding…).
- **Goal funds.** Start a fund for someone (a first car, a wedding, school), pick up to three
  stocks and an unlock date. Friends and family chip in; only the beneficiary can take it out, and
  only once the date arrives.
- **Buy and sell.** Trade stocks with cash at a price checked against the market.
- **Earn.** Put cash to work in a lending vault and claim the interest as shares.
- **Borrow.** Borrow cash against shares without selling them, with the price that would trigger a
  sale shown up front.

Signing in takes an email or Google account. There's no seed phrase, no extension and no ETH to
hold: the account is created for you, and the network fee is paid in cash at cost (quoted with a
small buffer) inside the same action.

## How it works

Holdsake runs on **Robinhood Chain** (an Arbitrum Orbit L2, chain id 4663). Stocks are Robinhood
Stock Tokens, cash is USDG.

- **Non-custodial.** Money only ever moves from the person's own embedded wallet (Privy), signed by
  them. Gifts and funds sit in our escrow contracts, never with a server-held key.
- **One signature per action.** Each wallet delegates through EIP-7702 to the audited
  `Simple7702Account`, so approve, action and fee go out as one batch. Our paymaster sponsors the
  gas and the server checks every call in the operation before sending it.
- **Escrow you can trust.** The contracts are small, non-upgradeable and have no admin that can
  move escrowed funds. A paused or blocked token never freezes the rest of a gift or fund.
- **Borrow and Earn on Morpho.** Loans use existing Morpho Blue markets with Chainlink oracles;
  Earn uses a Morpho USDG vault.
- **Not private.** Gift sender, recipient and amounts are visible on chain. "Only the recipient can
  open it" is true; "nobody can see it" is not.

### Contracts (v1, mainnet)

| Contract            | Address                                      |
| ------------------- | -------------------------------------------- |
| `HoldsakeTokenList` | `0xEe7c5B5a9eeAf667A6EFb217A8a77534C873f7a9` |
| `HoldsakeGifts`     | `0x4b96E74B963efa7Ab7D7497854Fc87220Bd092C4` |
| `HoldsakeFunds`     | `0x1515c22fDBa8CCa4B3610dEbCf8BEa8867055Bd7` |
| `HoldsakePaymaster` | `0x04CD74e77ac145B18d61c6C8D7939e3241DBB60A` |

## Stack

TanStack Start (React 19, SSR, PWA) · TanStack Query · Tailwind 4 + shadcn/ui on Base UI ·
Privy · Supabase · viem · Foundry + OpenZeppelin · moon + proto · pnpm · Oxlint + Oxfmt · Vitest ·
Vercel · Resend · PostHog

```
apps/app        the app: screens, server routes, crons
apps/video      launch video (Remotion)
contracts       Foundry: token list, gifts, funds, paymaster
packages/sdk    generated ABIs, deployments, call encoders
packages/ui     design tokens and fonts
supabase        SQL migrations
```

## Run it locally

Needs Node 24, pnpm 10 and Foundry 1.7.1 (`proto use` installs the pinned versions).

```sh
cp apps/app/.env.example apps/app/.env   # fill in; each key says where it comes from
pnpm dev                                 # installs, then the app on http://localhost:4321
```

Checks:

```sh
moon run root:lint          # oxlint + oxfmt
moon run :typecheck
moon run contracts:test     # unit, fuzz and invariant tests
moon run contracts:verify   # against a fork of mainnet with real tokens (needs .env)
```

`AGENT.md` has the full design, money rules and the decisions behind them.

## Not for everyone

Robinhood Stock Tokens aren't available to US persons and are restricted in Canada, the UK,
Switzerland, the UAE and sanctioned jurisdictions. Holdsake keeps that restriction in every flow.
