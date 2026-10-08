# Agent guide — Holdsake on Robinhood Chain (EVM)

Holdsake lets people give real ownership: tokenized stocks and cash, sent as personal gifts,
pooled into goal funds, and borrowed against without selling. This file is what you need to change
the code safely. It follows the shape of Morrow (`playriglabs/trymorrow`, the same product on
Solana): read its `AGENT.md` when a flow here says "like Morrow". https://holdsake.app

## Product in one paragraph

Holdsake is a mobile-first PWA for gifting tokenized stocks. A gift is locked to one recipient
(wallet, email or Telegram name) and only they can open it; unopened gifts go back to the sender
after 30 days. People also buy and sell stocks with cash, send shares out, build goal funds that
unlock on a date, and borrow cash against the shares they hold. The stocks are
**Robinhood Stock Tokens** and cash is **USDG**. Built to survive as a real product, so nothing
should quietly cost us money.

## Rules that aren't negotiable

- **No crypto words in the UI.** Cash, not USDG. Shares, not tokens. Receipt, not transaction hash.
  Account, not wallet. Gas, chain, bridge, approve, sign: none of them on screen, in error messages
  or in emails. The deposit screen is the only exception, because exchanges need the details.
- **Non-custodial, no KYC.** Money only moves from the user's own Privy embedded wallet, signed by
  them. The server builds calls and sponsors gas; it never holds user funds. Escrow lives in our
  contracts, never in a server-held key.
- **Never print secrets.** Read `apps/app/.env` programmatically if you must
  (`node --env-file=apps/app/.env`), print derived facts only (a hostname, an address, whether a
  value is empty). Don't echo keys, RPC URLs with API keys, or `CRON_SECRET`.
- **Anything that spends ETH or touches mainnet state needs the user's go-ahead**: contract
  deploys, transfers, funding the paymaster, scripts that write. The app doing it in response to
  the user clicking is fine.
- **Nothing should quietly cost us money.** Every on-chain flow decides who pays gas and charges
  what we pay at cost (see "Money rules").
- **Don't promise privacy the chain doesn't give.** Plain escrow makes sender, recipient address,
  tokens and amounts public through calldata, storage and events. "Only the recipient can open it"
  is true; "nobody can see it" is not.
- **Code conventions**: kebab-case component files, `@/` imports in `apps/app` (never `../`), all
  browser fetching through TanStack Query hooks in `@/lib/client/queries`. Match the surrounding
  comment style: comments explain why, not what.

## Stack

| Layer           | Choice                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Monorepo        | **moon v2** (tasks, project graph, `moon ci`) + **proto** (pinned tool versions)                        |
| Package manager | pnpm workspaces (`pnpm-workspace.yaml`, `engineStrict`), same as Morrow                                 |
| Runtime         | Node 24                                                                                                 |
| App             | TanStack Start (React 19, SSR, file routes, server routes), PWA                                         |
| Landing         | Not decided. `apps/landing/` is an empty placeholder (see below)                                        |
| Data fetching   | TanStack Query                                                                                          |
| Styling         | Tailwind 4 + shadcn/ui on Base UI, per app; tokens and fonts in `packages/ui`                           |
| Fonts           | Google Sans for everything, Valley Sans for headings only (see "Design")                                |
| Auth / wallets  | Privy (`@privy-io/react-auth`, `@privy-io/node`), embedded EVM wallets                                  |
| DB              | Supabase Postgres; service role on the server only                                                      |
| Chain           | viem; typed ABIs generated from Foundry output with `@wagmi/cli`                                        |
| Contracts       | Foundry (forge, anvil, cast), Solidity, OpenZeppelin                                                    |
| Validation      | zod                                                                                                     |
| Lint / format   | Oxlint (type-aware) + Oxfmt (VoidZero), incl. md/yaml/css; `forge fmt` for Solidity; lefthook git hooks |
| Tests (TS)      | Vitest                                                                                                  |
| Hosting         | Vercel (app + crons), one Vercel project per app                                                        |
| Email / push    | Resend, web push (VAPID), Telegram bot; all inert when their keys are unset                             |
| Analytics       | PostHog, server-side money events only                                                                  |

## Repo layout

```
holdsake/
  .moon/
    workspace.yml          # projects, vcs
    toolchains.yml         # javascript (pnpm), node, typescript
  .prototools              # node, pnpm, moon versions
  moon.yml                 # root project: lint, format (oxlint + oxfmt over the repo)
  apps/
    app/                   # TanStack Start: screens, server routes, crons
      src/routes/          # pages, and api/ server routes
      src/components/      # ui/ (shadcn), screens/, hand-written components
      src/lib/server/      # server-only modules (see "How the app is put together")
      src/lib/client/      # queries, browser-only helpers
      vercel.json          # crons
      .env.example
    landing/               # empty placeholder (.gitkeep only); stack and design undecided
  contracts/               # Foundry: HoldsakeGifts, HoldsakeFunds, HoldsakeLending, paymaster
  packages/
    sdk/                   # generated ABIs, deployments per chain and version, call builders, tests
    ui/                    # styles.css (tokens, @font-face) and fonts/ only; no components
  supabase/migrations/     # timestamped SQL, applied by the user
  scripts/
    deploy.sh              # Vercel deploy (only when asked)
    verify/                # "Verify first" fork scripts
  .oxlintrc.json  .oxfmtrc.json  lefthook.yml  tsconfig.base.json  pnpm-workspace.yaml
  AGENT.md  CLAUDE.md      # CLAUDE.md is just `@AGENT.md`
```

Dependency direction: `apps/app` → `packages/sdk` → `contracts` (build output only);
`apps/app` → `packages/ui`. `packages/ui` depends on nothing of ours.

`apps/landing/` stays empty (only a `.gitkeep`; it isn't listed in `.moon/workspace.yml`) until the user decides its stack and design. Don't scaffold it, add pages, tasks or a
deploy target for it, or design anything for it on your own.
`packages/sdk` is safe to import from the browser (ABIs, encoders, pure math); anything that holds
a key or the service role lives in `apps/app/src/lib/server` and is imported only from server
routes.

### moon

The config files are the source of truth; this is what they do.

- `.prototools` pins Node 24.19.0, pnpm 10.6.1 and moon 2.6.0. moon is also a root devDependency
  (`@moonrepo/cli`), so `pnpm exec moon ...` works without proto.
- `.moon/workspace.yml` lists projects explicitly (`root`, `app`, `contracts`, `sdk`, `ui`), never
  by glob, so an empty folder like `apps/landing` never becomes a project.
- moon needs at least one git commit to run (it diffs against `HEAD`).
- Tasks with shell syntax (`&&`, `if`, pipes) use `script:`, not `command:`; moon refuses shell
  syntax in `command`.
- `envFile` paths are workspace-relative with a leading slash (`/apps/app/.env`); `..` is refused.
- `contracts` (no `package.json`, system Foundry): `install` (Soldeer), `build`, `test`, `gas`,
  `lint` (`forge fmt --check`), `verify` (fork checks in `test/verify/`), `fork` (anvil).
  `test` and `gas` skip `test/verify/`, which needs an RPC.
- `sdk`: `generate` (`wagmi generate` from `contracts/out`, after `contracts:build`), `typecheck`,
  `test` (Vitest). Until the first `Holdsake*.sol` contract exists, `generate` writes an empty
  `src/generated/abis.ts` instead; remove that branch once `HoldsakeGifts` lands.
- `app`: `dev`, `build`, `typecheck`; all depend on `sdk:generate`, so a
  contract change regenerates ABIs before the app sees it.
- `src/routeTree.gen.ts` is committed and regenerated by the Vite plugin on `dev`/`build`. Don't
  use the `tsr` CLI: its output drops TanStack Start's `Register` block.
- `root`: `lint` and `format` over the whole repo.
- Lint and format are VoidZero's Oxc tools only (no Biome, ESLint or Prettier):
  - Oxfmt formats JS/TS/JSON and also md, yaml and css, and sorts Tailwind classes
    (`sortTailwindcss`, reading `apps/app/src/styles.css`). Nothing else formats those files.
  - **Oxfmt is still 0.x**: exact version pin. An upgrade is its own commit that only reformats.
  - Oxlint runs type-aware (`oxlint-tsgolint`) with `--deny-warnings` in `root:lint`.
  - Solidity is outside Oxc: `forge fmt`.
  - No Vite+: moon is the task runner and cache.
- Foundry isn't a proto tool: forge/anvil 1.7.1 locally, pinned to the same in CI. Dependencies
  come through **Soldeer** (`[dependencies]` in `foundry.toml`, installed into the gitignored
  `contracts/dependencies`), not git submodules, so the monorepo has no nested git repos.
  `forge init` creates a nested `.git`; never run it inside this repo.
- Deploy scripts (`forge script ... --broadcast`, `scripts/deploy.sh`) are **never** moon tasks
  and never in CI.

### Commands

| Command                          | What                                                    |
| -------------------------------- | ------------------------------------------------------- |
| `moon run app:dev`               | App dev server on port 4321                             |
| `moon run :typecheck`            | Typecheck every project                                 |
| `moon run root:lint`             | `oxlint --type-aware --deny-warnings`, `oxfmt --check`  |
| `moon run root:format`           | `oxfmt` and `oxlint --fix`                              |
| `moon run contracts:test`        | Foundry unit, fuzz and invariant tests                  |
| `moon run contracts:gas`         | Gas report ("Verify first" step 5, "Limits you'll hit") |
| `moon run contracts:fork`        | Local anvil fork of Robinhood Chain                     |
| `moon run contracts:verify`      | "Verify first" checks on a fork (needs `.env`)          |
| `moon run contracts:lint`        | `forge fmt --check`                                     |
| `moon run sdk:generate`          | Rebuild contracts, regenerate typed ABIs                |
| `moon run sdk:test`              | Flow tests against an anvil fork                        |
| `moon ci`                        | Everything affected since `main` (what CI runs)         |
| `scripts/deploy.sh app [--prod]` | Vercel deploy (not written yet). Only when asked.       |

### Git hooks and CI

- `lefthook.yml`, like Morrow: pre-commit runs `oxfmt` and `oxlint --fix` on staged files and
  re-stages fixes; pre-push runs `moon run :typecheck`. Installed by the root `prepare` script.
- CI (`.github/workflows/ci.yml`): checkout with full history, `moonrepo/setup-toolchain`
  (reads `.prototools`), `foundry-toolchain` at 1.7.1, `pnpm install --frozen-lockfile`, then
  `moon ci`. That covers lint, typecheck, `contracts:test`
  and `sdk:test` for affected projects.
- CI also fails if generated ABIs are stale: after `moon run sdk:generate`, `git diff --exit-code
  packages/sdk/src/generated`.
- CI never holds a funded key, never broadcasts, and never runs a deploy.

## Design

**References: Cash App and Zing (HSBC's money app).** Clean minimalism, always light mode. Borrow their patterns,
not their brands: no logos, brand colours, `$cashtag` styling or copy from either. What to take:

- One job per screen and one primary action, full width at the bottom within thumb reach.
- The amount is the hero: big, bold, centered, typed on a full-screen keypad, not in a form field.
- Flat surfaces, generous spacing, almost no borders or shadows; colour is for the one action and
  for gain/loss, nothing else.
- Bottom tab bar for the top-level places (Home, Stocks, Gifts, Profile); everything else is a
  pushed screen or a bottom sheet.
- Lists are plain rows: avatar or logo, name, one line under it, value on the right.
- Activity reads like sentences ("Maya sent you $25 of Apple"), never like a ledger.
- Confirmation screens are a short receipt of labelled rows, then one button.
- When in doubt, remove: fewer elements, fewer colours, fewer words. White space over dividers.

**Logo and favicon: skipped for now**

- Don't design, generate or add a Holdsake logo, wordmark, favicon, apple-touch-icon or PWA
  manifest icons. Where the brand would sit, use the name "Holdsake" set in Valley Sans as plain
  text. Don't add placeholder icon files either.
- Stock logos (`stock-logo` component) are not affected; they stay.
- Without manifest icons, Chrome won't offer the install prompt. That's accepted until the logo
  exists; don't work around it.

**Light mode only**

- One theme, light. No `dark:` variants, no `prefers-color-scheme` queries, no theme toggle.
- Set `color-scheme: light` on `:root` and `<meta name="color-scheme" content="light">` so
  browsers and the Telegram webview don't auto-darken form controls or scrollbars.
- The PWA manifest `theme_color` / `background_color` and the Telegram header colour use the same
  light background token.
- Emails and share cards are light too.

**Type**

- **Google Sans** for everything: body, labels, buttons, numbers. Use tabular figures
  (`font-variant-numeric: tabular-nums`) wherever amounts can change in place.
- **Valley Sans** for headings only (screen titles, share-card heroes). Never
  for body text, numbers or buttons.
- Both are self-hosted as woff2 in `packages/ui/src/fonts` and declared once in
  `packages/ui/src/styles.css` (`@font-face`, `font-display: swap`) as Tailwind theme tokens
  (`--font-sans`, `--font-heading`). Apps preload the two weights they use above the fold. No
  font CDN at runtime.
- Confirm the licence of both fonts allows web embedding in a commercial app before shipping; if
  either doesn't, stop and ask rather than swapping in a lookalike.

**Components: shadcn on Base UI, no shared component package**

- Components come from shadcn/ui set up with **Base UI** primitives (not Radix), styled with
  Tailwind. `apps/app` runs the shadcn CLI and owns its copies in `src/components/ui`
  (`components.json` in `apps/app`).
- `components.json`: style `base-nova`, base colour neutral, Lucide icons. Generated components
  import `cn` from shadcn's `cn` package (re-exported by `@/lib/utils`); that's expected.
- Add a component with the shadcn CLI, then restyle it to the design above (fonts, light only,
  flat, one accent). Edit the generated file in place; don't wrap it in another layer.
- Before writing a component by hand, check whether shadcn has it. Hand-written components
  (keypad, amount display, stock logo, receipt) go in `src/components`, composed from the `ui`
  ones and Tailwind.
- Screens stay in `apps/app/src/components/screens`.
- `packages/ui` holds only `styles.css` (Tailwind theme tokens, `@font-face`) and `fonts/`, so a
  future landing can reuse the same look.
- Kebab-case files, and no crypto words in any default text or `aria-label`, generated
  components included.

## Environment gotchas

- The shell defaults to Node 20; the repo needs Node 24. Use proto (`proto use`) or run through
  `moon`, which picks up the pinned version.
- Foundry: local is forge/anvil 1.7.1. Pin the same version in CI.
- solc is pinned to 0.8.28 (`foundry.toml`) because that's the version already installed here;
  downloading another solc failed from this machine. Moving to a newer 0.8.x is fine once it can be
  fetched. `evm_version = "cancun"` must be confirmed against the chain's ArbOS ("Verify first"
  step 8) before the first deploy.
- macOS zsh: no `timeout`; unquoted `$VAR` doesn't word-split.
- TanStack Start runs on Vite: browser-visible env vars need the `VITE_` prefix. Anything without
  it is server-only; never rename a secret to `VITE_*`.
- Supabase migrations are applied by the user in the SQL editor, not `supabase db push`. Write new
  migrations as new files that are safe to re-run (`if not exists`), end them with
  `notify pgrst, 'reload schema';`, and check they landed through the service-role REST API.
- Blockscout sits behind Cloudflare, so scripts read chain state over RPC, not the explorer API.

## Env vars

`apps/app/.env.example` lists every key with a comment on where it comes from. `.env` is never
committed; `.vercelignore` keeps it out of deploys and production values live on the Vercel
project.

| Var                                                           | Side        | What                                                                                 |
| ------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `VITE_APP_URL`                                                | both        | Public origin, used for links and OG images                                          |
| `VITE_PRIVY_APP_ID`, `VITE_PRIVY_CLIENT_ID`                   | both        | Privy app; email, Google, Apple, Telegram login; EVM embedded wallets                |
| `PRIVY_APP_SECRET`                                            | server      | Privy server auth, wallet lookup and pregeneration                                   |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                   | server      | DB; the service role key never reaches the browser                                   |
| `ROBINHOOD_RPC_URL`                                           | server      | Chain 4663 RPC (may embed an API key: never log it)                                  |
| `BUNDLER_URL`                                                 | server      | ERC-4337 bundler for chain 4663                                                      |
| `PAYMASTER_SIGNER_KEY`                                        | server      | Signs sponsorships only. Holds no funds; its address is the paymaster's `signer`     |
| `OPS_PRIVATE_KEY`                                             | server      | Hot wallet that is the treasury and tops up the paymaster. Keep only a little in it  |
| `TREASURY_ADDRESS`                                            | server      | Receives fees. Defaults to the ops wallet; the top-up cron only runs when they match |
| `CRON_SECRET`                                                 | server      | Vercel sends it as `Authorization: Bearer` to `/api/cron/*`                          |
| `TRADE_FEE_BPS`                                               | server      | Integrator fee on trades; unset means no fee                                         |
| `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | both/server | Web push; unset keeps notifications in the feed only                                 |
| `RESEND_API_KEY`                                              | server      | Email; unset sends nothing                                                           |
| `TELEGRAM_BOT_TOKEN`                                          | server      | Bot messages for Mini App users; unset sends nothing                                 |
| `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST`             | both        | Analytics; unset turns it off                                                        |

Contract addresses are not env vars: they live in `packages/sdk/src/deployments.ts`, per chain
and per contract version.

Keys, in order of what they can lose:

- `OPS_PRIVATE_KEY` holds real money. Balance capped at a few days of fees plus top-up float; the
  cron sweeps anything above that to a multisig.
- `PAYMASTER_SIGNER_KEY` can't move funds but can make the paymaster pay gas for anything. The
  paymaster's `setSigner` is owned by the multisig. Rotate: new key in Vercel, `setSigner` from
  the multisig, redeploy, old key deleted. Rotate at once if it may have leaked.
- Never reuse a key across roles, and never put either in a moon task, CI or a script's argv.

## Verify every change

```sh
moon run root:lint        # oxlint + oxfmt --check
moon run :typecheck       # 0 errors expected
moon run app:build        # must complete
```

Contract changes: `moon run contracts:test`, then `moon run sdk:generate` and commit the
regenerated ABIs together with the contract.

## Chain facts

| What       | Value                                                                         |
| ---------- | ----------------------------------------------------------------------------- |
| Chain      | Robinhood Chain, Arbitrum Orbit L2, chain id `4663`, mainnet since 2026-07-01 |
| Gas token  | ETH. Robinhood's gas subsidy ended 2026-09-29, so we pay our own.             |
| Explorer   | Blockscout (`robinhoodchain.blockscout.com`, behind Cloudflare for scripts)   |
| Cash       | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (Paxos)                     |
| WETH       | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`                                  |
| Stock list | Robinhood's on-chain asset registry (see docs.robinhood.com/chain/contracts)  |
| Prices     | Chainlink feeds per Stock Token                                               |
| Main DEX   | Uniswap v3/v4 (~99% of stock token liquidity), pairs mostly against USDG      |

Addresses above came from Robinhood's docs on 2026-10-05. Re-read them from the docs before
deploying anything.

Not yet confirmed (fill in from "Verify first" before relying on them):

| What                     | Why it matters                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Chainlink feed per token | Address, decimals, heartbeat, deviation threshold, behaviour outside US market hours. Lending depends on all five. |
| ArbOS version            | EIP-7702 needs a recent ArbOS. If unsupported, use ERC-4337 smart accounts only.                                   |
| ERC-4337 EntryPoint      | Which version (v0.7 / v0.8) is deployed, and which bundlers serve chain 4663.                                      |
| Uniswap depth per token  | Size of a sale at 2% / 5% / 10% price impact. Caps how much collateral can be liquidated safely.                   |
| Lending market           | Whether an existing isolated market (e.g. Morpho) takes Stock Tokens on 4663. Decides if we write our own.         |

## Stock Tokens: what to know

- **ERC-20, 18 decimals.** Never hard-code decimals for any token, USDG included: read
  `decimals()` once and cache it.
- **Corporate actions use a multiplier, not a rebase** (ERC-8056). `uiMultiplier()` is 18-decimal
  fixed point; underlying shares = raw amount × `uiMultiplier` ÷ 1e18. Balances never change.
- **Chainlink prices already include the multiplier.** Don't apply it again to a Chainlink price.
  Anything that works in raw amounts (fair-price checks, fund values, share-paid fees, collateral)
  needs price per raw unit, so convert explicitly and name variables so it's obvious which one you
  have (`pricePerShare` vs `pricePerRaw`, like Morrow's `usdPrice` vs `tokenPriceUsd`). Confirm
  this per feed during "Verify first": read the feed and `uiMultiplier` across a past multiplier
  change, don't take it on trust.
- **Canonical addresses only.** Plenty of fake tokens reuse the tickers (DexScreener shows
  "AAPL/WETH" pools with $7B of fake liquidity and zero volume). The catalog accepts only
  addresses from Robinhood's asset registry, and pools are chosen by token address, never by
  symbol.
- **Transfers are permissionless with a blocklist**, per one source: transfers, approvals and
  permits work for any address not blocked in Robinhood's `AccessControlsRegistry`. There is no
  on-chain allowlist or KYC. An older claim of a whitelist was contradicted by fork testing.
  Uniswap pools hold these tokens, so contracts can too. **Still unverified by us — see
  "Verify first".**
- **A blocklist can strand escrow.** If a sender, recipient, beneficiary or borrower is blocked
  after funds enter our contracts, a payout to that address reverts. Our contracts are
  non-upgradeable with no admin, so the design must leave a way out (see the contract sections).
- **Not for US persons**, and restricted in Canada, the UK, Switzerland, the UAE and sanctioned
  jurisdictions. The sequencer drops transactions from sanctioned addresses. With no KYC, the
  app-level geo restriction is the only control on our side; keep it in place for every flow,
  borrow included.

## Verify first (before writing product code)

Nothing below has been tested yet. Do these in order, on a fork, spending nothing. Scripts go in
`scripts/verify/`, results go back into this file.

1. `moon run contracts:fork`; impersonate a large holder of a canonical Stock Token (e.g. TSLA)
   and of USDG.
2. Deploy a minimal escrow, run create → claim, create → refund, create → expire → refund by
   anyone. Confirm a contract can receive, hold and release the token.
3. Read the token's source: is there `pause`, a transfer hook, a check on contract recipients,
   `permit` (EIP-2612)? Record the answers here.
4. Read USDG's `decimals()` on this chain.
5. Measure gas for each flow (`moon run contracts:gas`, `cast estimate`) and price it with the
   live `eth_gasPrice` plus the L1 data fee. Write the numbers in "Limits you'll hit".
6. Blocklist behaviour: on the fork, block an address in `AccessControlsRegistry` (impersonate its
   admin) and record what reverts — sending to it, sending from it, approving it, or all three.
7. Chainlink: for each Stock Token you plan to support, find the feed, read `decimals()`,
   `latestRoundData()`, heartbeat and deviation threshold. Walk rounds back over a weekend and an
   overnight session and record whether the feed stops updating, keeps updating from off-hours
   trading, or goes stale. Write which one per feed.
8. Account abstraction: confirm the EntryPoint address and version, at least one working bundler,
   and whether EIP-7702 transactions are accepted (ArbOS version).
9. Liquidity: for each collateral token, quote USDG out for sales of increasing size on Uniswap
   and record the size at 2%, 5% and 10% impact. This sets lending caps.
10. Lending venue: look for an existing isolated lending market on 4663 that takes canonical Stock
    Tokens with Chainlink pricing. If one exists, borrow runs on it the way Morrow's runs on
    Kamino (we only build what the person signs, the market is the book) and `HoldsakeLending` is
    not written.

If step 2 fails because of a transfer restriction, stop: gifts, funds and share sends don't work
on this chain, and the design needs rethinking. If step 7 shows no feed for a token, that token
cannot be borrowed against, full stop.

## How the app is put together

`apps/app` is TanStack Start with SSR. Pages in `src/routes`, server routes in `src/routes/api`,
screens in `src/components/screens`. Every server route goes through `route()` (auth, errors,
rate limits, zod body).

Server modules in `src/lib/server`:

| Module                               | Owns                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `http.ts`                            | `route()` wrapper, `HttpError`, `badRequest`/`forbidden`/`notFound`, `readBody` (zod)                 |
| `privy.ts`                           | Access-token auth, wallet lookup, `walletForEmail` (creates) vs `findWalletForEmail` (read-only)      |
| `users.ts`                           | Profile rows, `requireUser`, onboarding state                                                         |
| `recipients.ts`                      | `@handle`/email/Telegram-name resolution, `resolveGiftRecipients`                                     |
| `rate-limit.ts`                      | Per-user and per-IP windows on recipient lookup, gift routes and sponsored operations                 |
| `chain.ts`                           | viem clients, bundler, `buildUserOp`, simulate, submit with retries, receipt and event parsing        |
| `paymaster.ts`                       | Sponsorship signatures (`userOpHash`, chain, expiry), per-flow gas caps, failed-op counter            |
| `submit.ts`                          | Decodes a signed user operation and checks it against the draft row (see "Submit checks")             |
| `tokens.ts`                          | ERC-20 reads, `decimals`, `uiMultiplier`, multicall balances                                          |
| `catalog.ts`                         | Robinhood asset registry, cached; `findStock`, `findGiftAsset` (USDG resolves like a stock)           |
| `prices.ts`                          | Chainlink `pricePerShare` and `pricePerRaw`; Uniswap quote fallback for display and trade checks only |
| `charts.ts`                          | Candles from an indexer or pool events, outlier filtering, cached in `price_candles`                  |
| `trades.ts`                          | Uniswap routing (USDG pairs first), 3% fair-price check against Chainlink, integrator fee             |
| `fees.ts`                            | Gas-at-cost fee math in USDG, fee payment plan (see "Money rules")                                    |
| `gifts.ts`                           | Gift rows (`gift_items` embedded) to `GiftView`, keyed by `(contract, onchain id)`                    |
| `funds.ts`                           | Fund rows, balances read from `HoldsakeFunds`, `toFundView`                                           |
| `borrow.ts`                          | Positions, health and "falls X% before sale"; same math as the contract or market, tested against it  |
| `events.ts`                          | Reads our contracts' logs (every deployed version) and reconciles rows                                |
| `notify.ts`                          | The only way into the feed: settings filter, insert, then push, Telegram and email                    |
| `push.ts`, `telegram.ts`, `email.ts` | Phone and inbox delivery; each inert with no key set                                                  |
| `posthog.ts`                         | Money events from submit routes only; amounts as bands, people only by Privy id                       |

`packages/sdk` holds the generated ABIs, `deployments.ts`, and the encoders for every call the
server builds (`encodeCreateGift`, `encodeClaimGift`, …). No hand-encoded selectors.

### Signing and gas

- Privy embedded wallets, upgraded to smart accounts (ERC-4337) or delegated with EIP-7702, so one
  user signature covers a batch (approve + action + fee) and a paymaster pays gas.
- Every on-chain action has the same three steps, like Morrow: the server builds the batch and
  records a draft row, the browser signs it with no UI, the server's `submit` verifies and sends.
- Use `permit` instead of `approve` where the token supports it (check in "Verify first").
- With EIP-7702, the delegation target is code that controls the user's whole account. Delegate
  only to one audited, pinned implementation address; never to a contract we wrote for this app,
  and never to an address taken from user input. Record the address here.

### Gift flow

1. `POST /api/gifts/quote` shows the fee before sending (never pregenerates wallets).
2. `POST /api/gifts` resolves recipients (pregenerating Privy wallets for new emails), checks
   balances, plans the fee, inserts one `gifts` row per recipient with its `gift_items`, and
   returns one user operation per recipient: `approve`/`permit` per item, `createGift`, at most
   one fee transfer, plus the paymaster signature.
3. The browser signs (Privy, no UI) and calls `POST /api/gifts/[id]/submit`.
4. `submit` runs "Submit checks", sends, waits for the receipt, and stores the on-chain gift id
   from the `GiftCreated` event.
5. Claim and take-back are the same shape: `POST /api/gifts/[id]/claim` or `/refund` builds,
   `submit` verifies and sends.
6. `GET /api/cron/refund-gifts` (daily) refunds expired gifts (anyone may, after expiry) and
   deletes stale drafts. Rows that disagree with the chain are fixed from events (`events.ts`).
7. Cash gifts ride the same flow: `findGiftAsset` resolves USDG the way `findStock` resolves a
   stock, so a cash item is a `gift_items` row with the USDG address, nothing more.

### Fund flow

1. `POST /api/funds` records the fund (beneficiary, unlock date and mix fixed there, never
   changeable) and returns `createFund` plus the creator's fee.
2. `POST /api/funds/[id]/buy` splits cash by the mix and returns the trades.
3. `POST /api/funds/[id]/contribute` records draft rows and returns `contribute` per stock plus the
   fee; `submit` checks token and amount against those rows.
4. `POST /api/funds/[id]/withdraw` returns `withdraw` (or `withdrawToken` per stock, if one is
   paused or blocked) after the unlock date.
5. `GET /api/cron/funds` (daily) flags funds that reached their unlock date and tells the
   beneficiary.

### Send stocks, cash out

Plain ERC-20 transfers, built and checked like everything else: a draft row records token,
destination and amount; `submit` only sends a transfer of exactly that from the user's own account
plus the recorded fee. The destination must be a valid address that isn't one of our contracts or
a known token contract. Any address can receive any ERC-20, so there is nothing to open.

### Crons (`apps/app/vercel.json`)

All behind `Authorization: Bearer CRON_SECRET`.

| Route                     | Schedule | What                                                                                                                                                      |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/cron/refund-gifts`  | daily    | Refund expired gifts, delete stale drafts                                                                                                                 |
| `/api/cron/funds`         | daily    | Unlock notifications                                                                                                                                      |
| `/api/cron/sync-events`   | hourly   | Read logs since the last stored block for every contract version; backstop for `submit`                                                                   |
| `/api/cron/paymaster-eth` | daily    | When the paymaster deposit is under its floor, swap treasury USDG to ETH and top up; capped per run; only runs while `TREASURY_ADDRESS` is the ops wallet |

## Contracts (`contracts/`, Foundry, Solidity)

Small, **non-upgradeable** contracts. A bug fix ships as a new version; existing gifts, funds and
loans finish on the version that created them. Users trust escrow more when nobody, including us,
can change it.

- `HoldsakeGifts`: `createGift(recipient, items[])`, `claimGift(id, to)` (recipient only),
  `refundGift(id)` (sender any time, anyone after expiry, always pays out to the sender).
  One gift holds several tokens; `MAX_GIFT_STOCKS` is a product cap (start at 3, like Morrow) and
  gas is re-measured if it rises.
  - **The contract sets the expiry, not the caller**: `expiresAt = block.timestamp +
    GIFT_DURATION`, with `GIFT_DURATION = 30 days` a constant. A caller-supplied expiry could make
    a gift that never goes back, or one the recipient has no time to open. A different duration
    is a new contract version.
  - Time boundaries are exact and tested: claim allowed while `block.timestamp < expiresAt`;
    third-party refund allowed when `block.timestamp >= expiresAt`. No overlap, no gap.
  - Claim takes a destination: callable only by `recipient`, paying to `to`. This lets a recipient
    whose address gets blocked still receive at another address they control. Refunds by the
    sender may also take a `to`; refunds by anyone else always pay the stored sender.
  - One bad item must not lock the others: per-item claimed flag with `claimItem(id, index, to)`
    and `refundItem(id, index)` alongside the whole-gift calls. Never let a paused or blocked token
    make the whole gift unclaimable forever.
  - The sender can refund before the recipient claims. That is a product choice; make it visible
    in the UI ("you can take this back until they open it") so it isn't a surprise.
- `HoldsakeFunds`: `createFund(beneficiary, unlockAt, mix[])`, `contribute(id, token, amount)`,
  `withdraw(id, to)` and `withdrawToken(id, token, to)` (beneficiary, after `unlockAt`).
  Beneficiary, unlock date and mix are fixed at creation, never changeable.
  - `unlockAt` must be after `block.timestamp` and no later than `block.timestamp +
    MAX_FUND_LOCK` (a constant, e.g. 25 years), so a typo can't lock money for centuries.
  - **Anyone can contribute, so anyone can grief.** Contributions are restricted to tokens in
    `mix` (at most `MAX_FUND_STOCKS`, start at 3), so dust can't fill the fund with other tokens.
  - **Minimum contribution is a raw amount, not a dollar value**: each `mix` entry is
    `(token, minRaw)`, and `contribute` reverts below `minRaw`. The contract has no oracle and
    must not get one for this. The server sets `minRaw` at creation from the current price
    (about $1 per stock, rounded up) and shows it; because the stock price moves, it is a dust
    floor, not a dollar promise.
  - Withdraw per token as well as all at once, for the same blocklist and pause reasons as gifts.
- `HoldsakeLending`: only if "Verify first" step 10 finds no market to use. See its section below.
- `HoldsakePaymaster`: verifying paymaster (see below). Its `owner` is a multisig and can only set
  the signer and withdraw the paymaster's own ETH deposit; it never touches user funds.
- Use `SafeERC20`, check balance deltas rather than trusting amounts, reentrancy guards on every
  payout, events for every state change (`events.ts` reads them).
- Only canonical Stock Tokens and USDG may enter escrow: either check against Robinhood's registry
  on-chain, or keep our own allowlist set by an owner that can only add, never move funds.
  - If we keep our own allowlist, the owner is a multisig, not a single key. Adding a token never
    touches existing balances, and accounting is per token, so a bad token added by mistake can
    only affect gifts, funds and loans made with that token.
- `forge test` covers every flow, including a stock whose `uiMultiplier` changes mid-gift and
  mid-loan. Fuzz every amount and timestamp input, and invariant-test that for every token the
  contract's balance is at least the sum of everything it owes.
- `packages/sdk` tests run each flow end to end against an anvil fork through the same encoders
  the server uses, the way Morrow's `pnpm test:gifts` runs against a throwaway validator.

### HoldsakeLending (borrow cash against shares)

The highest-risk contract in the app. It holds collateral, prices it with an oracle and can hand
it to liquidators. Design it narrowly.

**Shape**

- Isolated markets: one market = one collateral Stock Token + USDG as the debt. No
  cross-collateral, no shared pool risk between stocks.
- Every market's parameters are immutable once created: collateral token, oracle feed, max
  loan-to-value, liquidation threshold, liquidation bonus, interest rate model, borrow cap. A
  change means a new market. No admin can change parameters or move collateral.
- Lenders: see "Open decisions".

**Units (the bug most likely to ship)**

- Collateral is stored as the raw token amount, never a share count.
- Collateral value in USDG = raw × `uiMultiplier` ÷ 1e18 × price-per-share, with the price from
  Chainlink (which already includes corporate actions — confirm per feed). Scale between the feed's
  decimals and USDG's decimals explicitly. Name variables `rawAmount`, `shares`, `pricePerShare`,
  `pricePerRaw` so nobody mixes them up.
- Rounding always favours the protocol: collateral value rounds down, debt rounds up.

**Oracle**

- Chainlink only for collateral value. **Never fall back to a Uniswap quote for lending**, even
  when the feed is stale: pool prices on thin stock-token liquidity can be moved within one block.
- Reject a price when `updatedAt` is older than the feed's heartbeat plus a margin, when
  `answer <= 0`, or when the round is incomplete.
- Market hours: US stocks trade about 6.5 hours a day on weekdays. Use what "Verify first" step 7
  found: if the feed stops off-hours, pause new borrows and liquidations while it is stale. If the
  feed updates off-hours, check where that price comes from before trusting it.
- **A stale feed means we carry the gap.** While liquidations are paused, debt keeps accruing and
  the stock can open far from Friday's close. Max loan-to-value and the liquidation threshold
  must be set so a position at max LTV is still solvent after the worst historical
  close-to-open gap for that stock, not an average one. See "Open decisions".

**Interest**

- Debt accrues through a global borrow index, updated on every interaction. No per-user loops.
- Start with a simple fixed or kinked rate. Write the formula here.

**Liquidation**

- Liquidatable when debt > collateral value × liquidation threshold.
- The liquidator repays debt in USDG and receives collateral plus the bonus. The contract does not
  swap on Uniswap during liquidation; the liquidator handles the sale.
- Cap the amount liquidated per call (close factor) so one call can't wipe a position on a bad
  print.
- A borrower can't profit by liquidating themselves; test it.
- Size borrow caps per market from "Verify first" step 9: if the pool can't absorb a liquidation of
  the cap without large impact, the cap is too big. Bad debt is ours.
- If the borrower's address gets blocked, repay and collateral withdrawal must still work to a
  different `to` address, and liquidation must still work.

**UI**

- Say what liquidation is, in plain words: if the shares fall far enough they are sold to cover
  the loan, and that sale costs up to the liquidation bonus. Show the price the stock would have
  to reach and the percent fall that gets there; never show a loan without it. Recompute it from
  the same math the contract uses.

### Paymaster (gas sponsorship)

Sponsoring gas is the one place where users can make us lose money directly. Rules:

- Verifying paymaster: the server signs `(userOpHash, chainId, validUntil, validAfter)` with
  `PAYMASTER_SIGNER_KEY` and the paymaster accepts only that signature. A sponsorship is good for
  exactly one user operation and expires within minutes.
- Cap `callGasLimit`, `verificationGasLimit` and `preVerificationGas` per flow, from measured
  numbers plus a margin. Refuse to sponsor anything above the cap.
- **Reverting executions still cost us gas.** If validation passes and execution reverts, the
  whole batch reverts, including the USDG fee transfer, but we have already paid for the gas. A
  user can trigger this on purpose (e.g. spend the balance between build and submit). Mitigate in
  layers: simulate right before submit; rate-limit sponsored ops per user and per IP; count failed
  sponsored ops per user and stop sponsoring after a small number.
- Keep the paymaster deposit small and topped up by the cron; never hold more ETH there than a
  day or two of expected volume.

### Submit checks (don't loosen)

The submit route re-reads the signed operation and refuses anything unexpected. Decode every call
in the user operation and allow only

- the expected function on our own contract, with the arguments recorded on the draft row;
- `approve`/`permit` for exactly that token, spender and amount;
- a USDG `transfer` to the treasury of exactly the recorded fee.

Nothing else, no unknown targets, no `delegatecall`. Better still, enforce what you can inside the
contract so the check isn't only server-side.

Also check, before sponsoring:

- `chainId`, `sender`, `nonce` and paymaster fields match the draft; the paymaster signature is for
  this exact `userOpHash` and is unexpired.
- For EIP-7702 accounts, the account's delegation target is the pinned implementation address.
- Gas limits are within the per-flow caps.
- Never an unlimited `approve`; the amount equals what the call will pull.

## Feature map

| Feature                                | Status                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Gifts, claim, 30-day refund            | Build (contract). Depends on "Verify first".                                                                                           |
| Gifts to email / Telegram              | Build. Privy pregenerates EVM wallets for email recipients; Telegram names resolve only to people who already signed in (like Morrow). |
| Cash gifts                             | Build, USDG as the cash item.                                                                                                          |
| Funds                                  | Build (contract).                                                                                                                      |
| Buy / sell                             | Build on Uniswap, USDG pairs.                                                                                                          |
| Send stocks, cash out                  | Build (plain ERC-20 transfer).                                                                                                         |
| Borrow against shares                  | Build. Existing market if step 10 finds one, else `HoldsakeLending`. Only tokens with a verified Chainlink feed.                       |
| Earn on idle cash                      | Out of scope.                                                                                                                          |
| Orders at a price                      | Blocked until a limit order protocol is confirmed on this chain.                                                                       |
| Notifications, watchlists, share cards | Build, same design as Morrow (`notify()`, local watchlists, canvas share cards).                                                       |
| Private gift details                   | Not on this chain yet. Don't claim it in UI or copy.                                                                                   |

## Money rules (don't regress these)

- **Gas is charged at cost, quoted with a small buffer.** The fee is quoted before execution with
  15% headroom on ETH price and gas price, paid in USDG as one transfer to the treasury inside the
  same batch, and not refunded after. Product copy says "at cost" only alongside "quoted with a
  small buffer"; never "exact cost".
- **Who pays the fee, in order:**
  1. Cash the sender keeps after the gift (USDG not being sent).
  2. If that's short and the gift contains cash, the shortfall comes out of the cash going to the
     recipients, split evenly, so sending the whole balance still works. The full fee transfer is
     still in the batch, so the sender never spends more than their balance.
  3. If that would empty a recipient's cash item, or the gift has no cash, the fee is paid in one
     of the gifted stocks at `pricePerRaw`.
  4. If none of that covers it, the gift is refused before signing with a plain message ("Not
     enough cash to cover the fee").
     The client mirrors this in the send screen; the server (`fees.ts`) is authoritative.
- Trading fee: integrator fee (`TRADE_FEE_BPS`) only where the venue supports it cleanly; never at
  the cost of a worse route.
- Borrow: interest and any origination fee are shown up front in plain words before the user
  confirms. The liquidation bonus is paid from the borrower's collateral; say so on the borrow
  screen.
- Fees arrive as USDG but the paymaster spends ETH: `/api/cron/paymaster-eth` swaps, capped per
  run, only while the treasury is the ops wallet (a separate treasury is a key this app never
  signs for).
- When you add an on-chain flow, decide who pays gas and charge it at cost.

## Limits you'll hit

Fill in from "Verify first" step 5; until then nothing here is measured.

| Flow                      | Gas | USD at measured gas price |
| ------------------------- | --- | ------------------------- |
| Gift, 3 stocks + cash fee |     |                           |
| Claim, 3 items            |     |                           |
| Refund, 3 items           |     |                           |
| Create fund               |     |                           |
| Contribute, 1 stock       |     |                           |
| Withdraw, 3 stocks        |     |                           |
| Send stocks / cash out    |     |                           |

`MAX_GIFT_STOCKS` and `MAX_FUND_STOCKS` start at 3. Raising either means re-measuring and
re-setting the paymaster's per-flow gas caps in the same change.

## Open decisions

Write the answer here before building what depends on it.

- **Lending venue and lenders.** An existing market (step 10), or `HoldsakeLending` with USDG from
  our treasury only, or open supply. Open supply changes the risk and the regulatory picture.
- **Lending parameters per stock.** Max LTV, liquidation threshold and borrow cap, from the worst
  historical close-to-open gap (step 7) and pool depth (step 9). Record the gap used and its date.
- **Interest rate formula.**

## Don'ts

- Don't add chain or token jargon to screens, even in error messages.
- Don't trust a token by its symbol; only canonical registry addresses.
- Don't make escrow contracts upgradeable or give any admin a way to move escrowed funds.
- Don't loosen the submit checks to make something pass.
- Don't pregenerate Privy wallets outside actually sending a gift.
- Don't hard-code decimals, prices or gas numbers; measure, then write them here.
- Don't deploy to mainnet or fund the paymaster without the user's go-ahead.
- Don't value collateral with a DEX price, ever.
- Don't let one paused or blocked token freeze a whole gift, fund or loan.
- Don't sponsor a user operation the server hasn't signed for, by hash, with an expiry.
- Don't claim gift privacy on this chain.
- Don't change an already-applied migration file; add a new one.
- Don't commit or push unless asked.
