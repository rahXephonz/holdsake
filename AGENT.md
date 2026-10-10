# Agent guide — Holdsake on Robinhood Chain (EVM)

Holdsake lets people give real ownership: tokenized stocks and cash, sent as personal gifts,
pooled into goal funds, and borrowed against without selling. This file is what you need to change
the code safely. It follows the shape of Morrow (`playriglabs/trymorrow`, the same product on
Solana): read its `AGENT.md` when a flow here says "like Morrow". https://holdsake.app

## Product in one paragraph

Holdsake is a mobile-first PWA for gifting tokenized stocks. A gift is locked to one recipient
(wallet, email or @handle) and only they can open it; unopened gifts go back to the sender
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
| Fonts           | Google Sans for text, Inter for numbers, Valley Sans for headings only (see "Design")                   |
| Auth / wallets  | Privy (`@privy-io/react-auth`, `@privy-io/node`), embedded EVM wallets                                  |
| DB              | Supabase Postgres; service role on the server only                                                      |
| Chain           | viem; typed ABIs generated from Foundry output with `@wagmi/cli`                                        |
| Contracts       | Foundry (forge, anvil, cast), Solidity, OpenZeppelin                                                    |
| Validation      | zod                                                                                                     |
| Lint / format   | Oxlint (type-aware) + Oxfmt (VoidZero), incl. md/yaml/css; `forge fmt` for Solidity; lefthook git hooks |
| Tests (TS)      | Vitest                                                                                                  |
| Hosting         | Vercel (app + crons), one Vercel project per app                                                        |
| Email / push    | Resend, web push (VAPID); both inert when their keys are unset                                          |
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
  contracts/               # Foundry: HoldsakeTokenList, HoldsakeGifts, HoldsakeFunds, HoldsakePaymaster
  packages/
    sdk/                   # generated ABIs, deployments per chain and version, call builders, tests
    ui/                    # styles.css (tokens, @font-face) and fonts/ only; no components
  supabase/migrations/     # timestamped SQL, applied by the user
  scripts/
    deploy.sh              # Vercel deploy (only when asked)
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
  `test` (Vitest). `src/encoders.ts` builds calldata for every call from the generated ABIs.
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
  browsers don't auto-darken form controls or scrollbars.
- The PWA manifest `theme_color` / `background_color` use the same
  light background token.
- Emails and share cards are light too.

**Type**

- **Google Sans** for body, labels and buttons.
- **Inter** for numbers (Space Grotesk until 2026-10-10): amounts, prices, changes, counts, codes. Always
  `font-number tabular-nums` together (`--font-number`).
- **Loaders**: `Spinner` (`@/components/ui/spinner`) wraps ldrs `Ring2`; skeletons for content
  that has a known shape (`Skeleton`, `RowsSkeleton`).
- **Success**: every money flow ends on `SuccessState` (`@/components/success-state`): a green
  (`--gain`) check that pops in and draws itself, via `motion` 13 (`motion/react`), still under
  `prefers-reduced-motion`.
- **Valley Sans** for headings only (screen titles, share-card heroes). Never
  for body text, numbers or buttons.
- **Google Sans and Inter load from Google Fonts** (decided 2026-10-09, Inter since 2026-10-10, both OFL), linked
  in each app's root head. Valley Sans isn't on Google Fonts: it's self-hosted from
  `packages/ui/src/fonts` via `packages/ui/src/fonts.css` once the licensed woff2 is there, and
  headings fall back to Google Sans until then. All three are Tailwind theme tokens in
  `packages/ui/src/styles.css` (`--font-sans`, `--font-number`, `--font-heading`).
- Confirm the licence of both fonts allows web embedding in a commercial app before shipping; if
  either doesn't, stop and ask rather than swapping in a lookalike.

**Components: shadcn on Base UI, no shared component package**

- Components come from shadcn/ui set up with **Base UI** primitives (not Radix), styled with
  Tailwind. `apps/app` runs the shadcn CLI and owns its copies in `src/components/ui`
  (`components.json` in `apps/app`).
- `components.json`: style `base-nova`, base colour neutral, Phosphor icons
  (`@phosphor-icons/react`; the CLI may still emit Lucide imports: swap them for Phosphor). Generated components
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
| `VITE_PRIVY_APP_ID`, `VITE_PRIVY_CLIENT_ID`                   | both        | Privy app; email, Google, Apple login; EVM embedded wallets                          |
| `PRIVY_APP_SECRET`                                            | server      | Privy server auth, wallet lookup and pregeneration                                   |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                   | server      | DB; the service role key never reaches the browser                                   |
| `ROBINHOOD_RPC_URL`                                           | server      | Chain 4663 RPC (may embed an API key: never log it)                                  |
| `BUNDLER_URL`                                                 | server      | ERC-4337 bundler for chain 4663                                                      |
| `PAYMASTER_SIGNER_KEY`                                        | server      | Signs sponsorships only. Holds no funds; its address is the paymaster's `signer`     |
| `OPS_PRIVATE_KEY`                                             | server      | Hot wallet: sends `handleOps` (our own bundling); later tops up the paymaster        |
| `TREASURY_ADDRESS`                                            | server      | Receives fees. Defaults to the ops wallet; the top-up cron only runs when they match |
| `CRON_SECRET`                                                 | server      | Vercel sends it as `Authorization: Bearer` to `/api/cron/*`                          |
| `TRADE_FEE_BPS`                                               | server      | Integrator fee on trades; unset means no fee                                         |
| `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | both/server | Web push; unset keeps notifications in the feed only                                 |
| `RESEND_API_KEY`                                              | server      | Email; unset sends nothing                                                           |
| `EMAIL_FROM`                                                  | server      | Sender for every email; its domain must be verified in Resend                        |
| `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST`             | both        | Analytics; unset turns it off                                                        |

Contract addresses are not env vars: they live in `packages/sdk/src/deployments.ts`, per chain
and per contract version.

Keys, in order of what they can lose:

- `OPS_PRIVATE_KEY` holds real money. Balance capped at a few days of fees plus top-up float; the
  cron sweeps anything above that to a multisig.
- `PAYMASTER_SIGNER_KEY` can't move funds but can make the paymaster pay gas for anything. The
  signer is immutable in `HoldsakePaymaster` (ERC-7562 rule, see "Paymaster"), so rotating means:
  new key, deploy a new paymaster with it, the multisig moves the deposit (`withdrawTo` on the
  old one, `deposit` on the new one), point the server at the new address, delete the old key.
  Do it at once if the key may have leaked; until then the old paymaster can be drained of its
  deposit by the multisig to cap the damage.
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

| What       | Value                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Chain      | Robinhood Chain, Arbitrum Orbit L2, chain id `4663`, mainnet since 2026-07-01                          |
| Gas token  | ETH. Robinhood's gas subsidy ended 2026-09-29, so we pay our own.                                      |
| Public RPC | `https://rpc.mainnet.chain.robinhood.com` (free, rate limited; dev only, use a provider in production) |
| Explorer   | Blockscout (`robinhoodchain.blockscout.com`, behind Cloudflare for scripts)                            |
| Cash       | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (Paxos)                                              |
| WETH       | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`                                                           |
| Stock list | Robinhood's on-chain asset registry (see docs.robinhood.com/chain/contracts)                           |
| Prices     | Chainlink feeds per Stock Token                                                                        |
| Main DEX   | Uniswap v3/v4 (~99% of stock token liquidity), pairs mostly against USDG                               |
| Bundler    | Alchemy (the RPC URL is also the bundler). Serves EntryPoint v0.6, v0.7, v0.8, v0.9                    |
| ArbOS      | 61 (`ArbSys.arbOSVersion()` returns 116 = 55 + 61): Cancun and EIP-7702 supported                      |

Every address our code uses, with where it was checked, lives in `packages/sdk/src/deployments.ts`
(EntryPoint v0.8, `Simple7702Account`, Morpho Blue, Uniswap v4, Chainlink feeds, Multicall3,
Permit2). Re-read them before deploying anything.

Measured 2026-10-06: gas price ~0.02 gwei (`eth_gasPrice` 20,376,000 wei), L1 data ~2.02 gwei per
calldata byte (`ArbGasInfo.getPricesInWei`), ETH $2,706 (Chainlink).

## Stock Tokens: what to know

- **Stock Tokens are ERC-20 with 18 decimals; USDG has 6.** Never hard-code decimals for any
  token: read `decimals()` once and cache it.
- **What a Stock Token can do (read from TSLA's implementation, 2026-10-06):** it's a beacon proxy
  (beacon and blocklist registry are the same contract, `0xe10b…1b00`), so **Robinhood can
  upgrade every Stock Token at once**. It has `pause`/`unpause`, `permit` (EIP-2612, tested),
  `adminBurn(address,uint256)` (the issuer can burn from **any** address, our escrow included),
  `mint`, a scheduled multiplier (`updateMultiplier(newMultiplier, effectiveAt)`,
  `newUIMultiplier()`, `effectiveAt()`), `balanceOfUI` and `pauseOracle`. USDG is an upgradeable
  Paxos proxy with pause, permit and supply control. If a token is burned out of our escrow,
  `owed` exceeds the balance and that item's payout reverts; per-item calls keep the rest moving.
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
- **Transfers are permissionless with a blocklist** (verified on a fork): any address,
  contracts included, can hold and move Stock Tokens unless the registry's `isBlocked` says
  otherwise. A blocked address can't receive, can't send, and can't be approved as a spender.
  If **our escrow contract itself** were blocked, nothing in it could move; nothing in our
  contracts can fix that.
- **A blocklist can strand escrow.** If a sender, recipient, beneficiary or borrower is blocked
  after funds enter our contracts, a payout to that address reverts. Our contracts are
  non-upgradeable with no admin, so the design must leave a way out (see the contract sections).
- **Not for US persons**, and restricted in Canada, the UK, Switzerland, the UAE and sanctioned
  jurisdictions. The sequencer drops transactions from sanctioned addresses. With no KYC, the
  app-level geo restriction is the only control on our side; keep it in place for every flow,
  borrow included.

## Verify first: results

Run with `moon run contracts:verify` (fork tests in `contracts/test/verify/`, nothing spent). All
12 pass on a fork of block ~81.77M (2026-10-06).

1. **Fork + holders.** TSLA holder `0x92d4…f765` (EOA), USDG holder `0xf70d…dbef` (EOA), found
   from recent transfers (`alchemy_getAssetTransfers`; Alchemy's free tier caps `eth_getLogs` at a
   tiny block range). Override with `VERIFY_HOLDER` / `VERIFY_USDG_HOLDER`.
2. **Escrow works with real tokens.** `EscrowSmoke.t.sol` and `RealTokens.t.sol`: our actual
   `HoldsakeGifts` and `HoldsakeFunds` take, hold and pay out real TSLA and USDG (create → claim,
   create → expire → refund by anyone, fund contribute → withdraw). Amounts arrive in full.
3. **Token capabilities:** see "Stock Tokens: what to know". Permit works for TSLA, so a batch can
   use `permit` instead of `approve`.
4. **USDG decimals: 6.**
5. **Gas:** see "Limits you'll hit".
6. **Blocklist:** sending to, sending from and approving a blocked address all revert. A blocked
   recipient still opens a gift to another address (`claimGift(id, to)`), tested.
7. **Chainlink (TSLA/USD, 400 rounds back to 2026-09-03):** updates 24/5 including overnight
   sessions (median 18 min between rounds, 0.5% deviation trigger), **stops from Friday evening
   to Monday 00:00 UTC** (gaps of 52–53 h, 78 h over Labor Day). Heartbeat is 24 h, so a plain
   heartbeat staleness check fails every weekend; checks must know market hours. Largest
   weekend move seen: −1.09% (5 weekends, a small sample). Other stock feeds share the same
   `us_equities_24/5` schedule per Chainlink's directory; walk each before relying on it.
8. **Account abstraction works end to end.** ArbOS 61, EIP-7702 accepted. `Sponsored7702.t.sol`:
   an EOA with no ETH delegates to the official `Simple7702Account` (EntryPoint v0.8), and one
   sponsored user operation through the deployed EntryPoint approves TSLA, creates a gift and
   pays the USDG fee. Our paymaster paid ~0.0000184 ETH (~$0.05) of L2 gas.
9. **Uniswap depth: not measured yet.** Needs the v4 quoter and pool keys; do it when building
   `trades.ts`. Only matters for our own lending, which we no longer plan.
10. **Lending venue: Morpho Blue exists** (`0x9d53…1010`) and already holds Stock Tokens as
    collateral (NVDA ~7.1k, GOOGL ~1.9k, AAPL ~1.4k, smaller TSLA, SPY, COIN, QQQ). Borrow runs on
    Morpho markets; `HoldsakeLending` is not written (see "Borrow on Morpho").

## How the app is put together

`apps/app` is TanStack Start with SSR. Pages in `src/routes`, server routes in `src/routes/api`,
screens in `src/components/screens`. Every server route goes through `route()` (auth, errors,
rate limits, zod body).

Server modules in `src/lib/server`:

| Module          | Owns                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `http.ts`       | `route()` wrapper, `HttpError`, `badRequest`/`forbidden`/`notFound`, `readBody` (zod)                 |
| `privy.ts`      | Access-token auth, wallet lookup, `walletForEmail` (creates) vs `findWalletForEmail` (read-only)      |
| `users.ts`      | Profile rows, `requireUser`, onboarding state                                                         |
| `recipients.ts` | `@handle`/email resolution, `resolveGiftRecipients`                                                   |
| `rate-limit.ts` | Per-user and per-IP windows on recipient lookup, gift routes and sponsored operations                 |
| `chain.ts`      | viem clients, bundler, `buildUserOp`, simulate, submit with retries, receipt and event parsing        |
| `paymaster.ts`  | Sponsorship signatures (`userOpHash`, chain, expiry), per-flow gas caps, failed-op counter            |
| `submit.ts`     | Decodes a signed user operation and checks it against the draft row (see "Submit checks")             |
| `tokens.ts`     | ERC-20 reads, `decimals`, `uiMultiplier`, multicall balances                                          |
| `catalog.ts`    | Robinhood asset registry, cached; `findStock`, `findGiftAsset` (USDG resolves like a stock)           |
| `prices.ts`     | Chainlink `pricePerShare` and `pricePerRaw`; Uniswap quote fallback for display and trade checks only |
| `charts.ts`     | Candles from an indexer or pool events, outlier filtering, cached in `price_candles`                  |
| `trades.ts`     | Uniswap routing (USDG pairs first), 3% fair-price check against Chainlink, integrator fee             |
| `fees.ts`       | Gas-at-cost fee math in USDG, fee payment plan (see "Money rules")                                    |
| `gifts.ts`      | Gift rows (`gift_items` embedded) to `GiftView`, keyed by `(contract, onchain id)`                    |
| `funds.ts`      | Fund rows, balances read from `HoldsakeFunds`, `toFundView`                                           |
| `borrow.ts`     | Positions, health and "falls X% before sale"; same math as the contract or market, tested against it  |
| `events.ts`     | Reads our contracts' logs (every deployed version) and reconciles rows                                |
| `notify.ts`     | The only way into the feed: settings filter, insert (deduped by key), then email for away-events      |
| `email.ts`      | Resend over HTTP, light HTML template; inert with no key, never throws                                |
| `deposits.ts`   | "Maya sent you $25": incoming cash/stock transfers not explained by our own operations or contracts   |
| `push.ts`       | Phone delivery (not written yet)                                                                      |
| `posthog.ts`    | Money events from submit routes only; amounts as bands, people only by Privy id                       |

`packages/sdk` holds the generated ABIs, `deployments.ts`, and the encoders for every call the
server builds (`encodeCreateGift`, `encodeClaimGift`, …). No hand-encoded selectors.

### Signing and gas

- **Decided and tested on a fork:** each Privy embedded wallet (an EOA) delegates with EIP-7702 to
  eth-infinitism's audited `Simple7702Account` for EntryPoint v0.8
  (`SIMPLE_7702_ACCOUNT` in `packages/sdk/src/deployments.ts`). The address stays the user's own,
  one signature covers a batch (`executeBatch`: permit/approve + action + fee), and
  `HoldsakePaymaster` pays the gas. Alchemy (`BUNDLER_URL`) estimates and simulates; the server
  sends each checked operation itself as a one-op `handleOps` from the ops wallet (see "Mainnet
  deployment"), because Alchemy's bundler never mined ops carrying a 7702 authorization here.
- The delegation target controls the user's whole account. Only ever that one pinned address;
  never a contract we wrote, never an address from user input. The submit route checks it.
- Every on-chain action has the same three steps, like Morrow: the server builds the batch and
  records a draft row, the browser signs it with no UI, the server's `submit` verifies and sends.
- Use `permit` instead of `approve` where the token supports it (TSLA and USDG both do).

### Gift flow

1. `POST /api/gifts/quote` shows the fee before sending (never pregenerates wallets).
2. `POST /api/gifts` resolves recipients (pregenerating Privy wallets for new emails), checks
   balances, plans the fee, inserts one `gifts` row per recipient with its `gift_items`, and
   returns one user operation per recipient: `approve`/`permit` per item, `createGift`, at most
   one fee transfer, plus the paymaster signature.
3. The browser signs (Privy, no UI) and calls `POST /api/gifts/[id]/submit`. Several recipients
   (up to `MAX_RECIPIENTS`, 3) each get their own gift, built and sent one at a time: every
   operation reads the account's nonce when it's built, so building them all up front gives them
   the same nonce and every one after the first fails.
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

Written (`contracts/src`): `HoldsakeTokenList`, `HoldsakeGifts`, `HoldsakeFunds`,
`HoldsakePaymaster`, and `script/Deploy.s.sol` (never broadcast without the user's go-ahead; it
doesn't fund the paymaster). 56 local tests (unit, fuzz, invariant, a local EntryPoint v0.8) and
12 fork tests against the real TSLA, USDG and EntryPoint all pass. Not written, by decision:
`HoldsakeLending` (borrow runs on Morpho). **v1 is live on mainnet** (see "Mainnet deployment").

- `HoldsakeTokenList`: the allowlist both escrows read. `addToken(token)` only, by an
  `Ownable2Step` owner that must be a multisig (the deploy script refuses an EOA). Nothing can be
  removed and the owner never touches escrowed funds. Accounting is per token, so a token added by
  mistake only affects gifts and funds made with that token.
- `HoldsakeGifts` (`constructor(tokenList, cash)`):
  - `createGift(recipient, items[])` with `items = (token, amount)[]`. At most `MAX_GIFT_STOCKS`
    (3) stock items plus one cash (USDG) item; no duplicate tokens; recipient is neither zero nor
    the sender. What's recorded is the balance delta, not the requested amount.
  - **The contract sets the expiry, not the caller**: `expiresAt = block.timestamp +
    GIFT_DURATION` (30 days, a constant). A different duration is a new contract version.
  - `claimGift(id, to)` and `claimItem(id, index, to)`: recipient only, while
    `block.timestamp < expiresAt`, paying to any `to` they choose (a blocked recipient receives
    elsewhere). The first claim marks the gift `opened`.
  - `refundGift(id)` / `refundItem(id, index)` always pay the stored sender;
    `refundGiftTo(id, to)` / `refundItemTo(id, index, to)` are sender-only (a blocked sender takes
    it back elsewhere). The sender may refund until the gift is `opened`, and any time after
    expiry; anyone else only once `block.timestamp >= expiresAt`. No overlap, no gap; both
    boundaries are tested.
  - Once opened, the sender can't take back the rest before expiry, so a recipient can wait out a
    paused token. Make "you can take this back until they open it" visible in the UI.
  - One stuck item never locks the others: whole-gift calls revert if any item fails; per-item
    calls settle the rest.
  - `getGift(id)` returns the gift and its items; `owed(token)` is what the contract owes in total.
  - Events: `GiftCreated`, `ItemClaimed`, `ItemRefunded`.
- `HoldsakeFunds` (`constructor(tokenList)`):
  - `createFund(beneficiary, unlockAt, mix[])` with `mix = (token, minRaw)[]`, 1 to
    `MAX_FUND_STOCKS` (3) allowlisted tokens. `unlockAt` must be after now and no later than
    `MAX_FUND_LOCK` (25 years) from now. Beneficiary, unlock date and mix never change.
  - `contribute(id, token, amount)`: anyone, mix tokens only, and what arrives must be at least
    that token's `minRaw`. **`minRaw` is a raw amount, not a dollar value**: the contract has no
    oracle and must not get one. The server sets it at creation (about $1 per stock, rounded up)
    and shows it; it's a dust floor, not a dollar promise.
  - `withdraw(id, to)` and `withdrawToken(id, token, to)`: beneficiary only, once
    `block.timestamp >= unlockAt`, to any `to`. Contributions after a withdrawal can be withdrawn
    again.
  - `getFund(id)`, `balanceOf(id, token)`, `minRaw(id, token)`, `owed(token)`.
  - Events: `FundCreated`, `Contributed`, `Withdrawn`.
- `HoldsakePaymaster` (`constructor(entryPoint, owner, signer, maxCostPerOp)`): see "Paymaster".
- Use `SafeERC20`, check balance deltas rather than trusting amounts, reentrancy guards on every
  payout, events for every state change (`events.ts` reads them).
- Only canonical Stock Tokens and USDG may enter escrow, through `HoldsakeTokenList` (addresses
  from Robinhood's registry, added by the multisig).
- `forge test` covers every flow, including a stock whose `uiMultiplier` changes mid-gift. Fuzz every amount and timestamp input, and invariant-test that for every token the
  contract's balance is at least the sum of everything it owes.
- `packages/sdk` tests run each flow end to end against an anvil fork through the same encoders
  the server uses, the way Morrow's `pnpm test:gifts` runs against a throwaway validator.

### Borrow on Morpho (no contract of ours)

Borrowing runs on **Morpho Blue** (`MORPHO_BLUE`), like Morrow's runs on Kamino: the shares go in as
collateral, cash comes out to the person's own account, and Morpho is the book. We only build what
they sign (`supplyCollateral`, `borrow`, `repay`, `withdrawCollateral`, batched through their
7702 account) and read positions back from Morpho; we record nothing we can't re-read.

- **Only existing Morpho markets** with a Stock Token as collateral, USDG as the loan asset and a
  Chainlink-based oracle. Read each market's params (`idToMarketParams`) and LLTV live; don't
  hard-code them. Never create a market or curate a vault without the user's decision.
- Before listing a market, check its oracle: what feed it reads, and what it does over the weekend
  gap ("Verify first" step 7). A market whose oracle falls back to a DEX price is not offered.
- Units: Morpho collateral is in raw token amounts. Show value with `pricePerRaw` (multiplier
  applied once, Chainlink already includes it) and name variables so nobody mixes them up.
- **Say what liquidation is, in plain words**: if the shares fall far enough they are sold to cover
  the loan, and that costs a penalty. Show the price the stock would have to reach and the percent
  fall that gets there, from the market's own LLTV and oracle price; never show a loan without it.
  Say that the price doesn't move over the weekend but the stock can open Monday far from Friday.
- If the borrower's address is blocked, Morpho's own `onBehalf`/`receiver` arguments let repay and
  withdrawal go elsewhere; use them.
- Who lends, at what rate, is Morpho's market, not ours: show the live borrow rate and that it's
  variable.

### Paymaster (gas sponsorship)

Sponsoring gas is the one place where users can make us lose money directly. `HoldsakePaymaster`
(EntryPoint v0.8) and the server split the work:

- **The server signs one exact operation.** `getHash` covers sender, nonce, initCode, callData,
  account gas limits, paymaster gas limits, preVerificationGas, gas fees, chain id, the paymaster
  address and a `validUntil`/`validAfter` window; the server signs it as an EIP-191 message with
  `PAYMASTER_SIGNER_KEY`. Change any field and the signature fails (AA34); the nonce makes it
  single use (AA25); it expires within minutes (AA32). All tested.
- `paymasterAndData` = paymaster (20) | verification gas (16) | postOp gas (16) | validUntil (6) |
  validAfter (6) | signature (65). No postOp: the fee is a USDG transfer inside the batch.
- **`signer` and `maxCostPerOp` are immutable**: ERC-7562 doesn't let an unstaked paymaster read
  its own storage while validating, and bundlers enforce it. Rotation = new paymaster (see "Env
  vars"). `maxCostPerOp` is the on-chain backstop; per-flow gas caps are the server's job, from
  measured numbers plus a margin, before it signs.
- The owner is the multisig and can only manage the paymaster's own ETH (deposit, stake,
  `withdrawTo`). It never touches user funds.
- **Reverting executions still cost us gas** (tested): if execution reverts, the USDG fee
  transfer reverts with it but the paymaster has paid. A user can do this on purpose (e.g. spend
  the balance between build and submit). Mitigate in layers: simulate right before submit;
  rate-limit sponsored ops per user and per IP; count failed sponsored ops per user and stop
  sponsoring after a small number.
- Keep the paymaster deposit small and topped up by the cron; never hold more ETH there than a
  day or two of expected volume. At ~$0.05 per gift, $50 of ETH covers ~1,000 gifts.

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

| Feature                                | Status                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| Gifts, claim, 30-day refund            | Build (contract). Depends on "Verify first".                                     |
| Gifts to email                         | Build. Privy pregenerates EVM wallets for email recipients.                      |
| Cash gifts                             | Build, USDG as the cash item.                                                    |
| Funds                                  | Build (contract).                                                                |
| Buy / sell                             | Build on Uniswap, USDG pairs.                                                    |
| Send stocks, cash out                  | Build (plain ERC-20 transfer).                                                   |
| Borrow against shares                  | Built on Morpho (NVDA, AAPL, GOOGL, TSLA); see "Borrow on Morpho".               |
| Earn (apys.co-style)                   | Built: cash into a Morpho USDG vault, interest claimed as shares (see "Earn").   |
| Orders at a price                      | Blocked until a limit order protocol is confirmed on this chain.                 |
| Notifications, watchlists, share cards | Build, same design as Morrow (`notify()`, local watchlists, canvas share cards). |
| Private gift details                   | Not on this chain yet. Don't claim it in UI or copy.                             |

## Money rules (don't regress these)

- **Gas is charged at cost, quoted with a small buffer.** The fee is quoted before execution with
  15% headroom on ETH price and gas price, paid in USDG as one transfer to the treasury inside the
  same batch, and not refunded after. It prices `expectedGasUsed(limits)` (85% of the
  operation's gas limits, measured: a first gift burns 83%) at today's gas price, not
  `maxFeePerGas`, rounded up to $0.001. Charging full limits at maxFeePerGas billed ~2× the real
  cost (2026-10-09: $0.04 for a $0.021 gift); now it's ~1.4×, the two 15% buffers. Product copy says "at cost" only alongside "quoted with a
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
- **Moving all of your cash still works.** Sending cash out and putting cash into Earn take the
  fee from the cash left over; when that's short (sending or putting in everything), the
  shortfall comes out of the amount itself, and the review shows what actually arrives.
- **Opening a gift never needs money you don't have.** The fee comes from cash (yours or the
  gift's), then from a gifted stock at its Chainlink price; if the gift is only stocks with no
  feed, the batch sells a sliver of one through Uniswap (price-checked, minimum out, ~25% over
  the spot amount) and pays the fee from that cash. What's left of the sale stays theirs.
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

Measured 2026-10-06 at ~0.02 gwei and ETH $2,706. "Real" rows ran against the real TSLA and USDG
on a fork (`moon run contracts:verify`, execution gas only); "mock" rows are the worst case from
`moon run contracts:gas`. A full sponsored user operation adds EntryPoint and account overhead
plus ~$0.003 of L1 data: the 7702 gift batch (approve + `createGift` + fee) cost the paymaster
~0.0000184 ETH, **about $0.05**. Gas prices move; quote live, never from this table.

| Flow                                 | Gas     | Source        | USD (execution) |
| ------------------------------------ | ------- | ------------- | --------------- |
| Sponsored gift batch (7702, 1 stock) | —       | real, full op | ~0.05           |
| `createGift`, TSLA + USDG            | 381,096 | real          | 0.021           |
| `createGift`, 3 stocks + cash        | 587,268 | mock, max     | 0.032           |
| `claimGift`, 2 items                 | 80,960  | real          | 0.0045          |
| `claimItem`                          | 62,820  | mock, max     | 0.0035          |
| `refundGift`, 2 items                | 87,361  | mock, max     | 0.0048          |
| `createFund`, 1 stock                | 179,997 | real          | 0.0099          |
| `contribute`                         | 121,132 | real          | 0.0067          |
| `withdraw`, 1 stock                  | 43,896  | real          | 0.0024          |
| `withdrawToken`                      | 53,867  | mock, max     | 0.003           |
| Send stocks / cash out (ERC-20 only) | —       | not measured  | —               |

`MAX_GIFT_STOCKS` and `MAX_FUND_STOCKS` start at 3. Raising either means re-measuring and
re-setting the paymaster's per-flow gas caps in the same change.

## Mainnet deployment (v1, 2026-10-09)

Deployed with `script/Deploy.s.sol` from the deployer `0x616e2B9Bc83D60790E70CbaAc6c8612AFc6A7896`
(a Foundry keystore named `deployer`, password held by the user) at blocks 84043655–84043671.
Transactions are in `contracts/broadcast/Deploy.s.sol/4663/run-latest.json`; addresses in
`packages/sdk/src/deployments.ts` (the last entry per contract is the current version).

| Contract            | Address                                      | Notes                                       |
| ------------------- | -------------------------------------------- | ------------------------------------------- |
| `HoldsakeTokenList` | `0xEe7c5B5a9eeAf667A6EFb217A8a77534C873f7a9` | USDG + all 194 stocks allowed, owner Safe   |
| `HoldsakeGifts`     | `0x4b96E74B963efa7Ab7D7497854Fc87220Bd092C4` | cash = USDG                                 |
| `HoldsakeFunds`     | `0x1515c22fDBa8CCa4B3610dEbCf8BEa8867055Bd7` |                                             |
| `HoldsakePaymaster` | `0x04CD74e77ac145B18d61c6C8D7939e3241DBB60A` | EntryPoint v0.8, maxCostPerOp 0.0002 ETH    |
| Owner (Safe 1.5.0)  | `0x812a47f8860ca05045C3Ad69FF0caea732f32922` | `OWNER_SAFE`; 1-of-1, the deployer is owner |

- Every value above was read back on-chain after the deploy (owner, `isAllowed` for all 195
  tokens, `tokenList`/`cash` wiring, paymaster `signer`, `maxCostPerOp`, `entryPoint`, `owner`).
- Paymaster signer: `0x93673550b4a7E5ea02F090773AF706470003D96A`. Its key was generated straight
  into `apps/app/.env` (`PAYMASTER_SIGNER_KEY`) and never printed; it exists only there and must
  be copied to Vercel by the user. Losing it means a new paymaster (see "Env vars").
- Cost: deploy 0.000178 ETH (8.88M gas at ~0.020 gwei), Safe creation ~0.000005 ETH, paymaster
  deposit 0.0018 ETH (~90 sponsored gifts at ~$0.05). Demo scale on purpose; the user tops it up
  (`deposit()` on the paymaster, payable by anyone) as usage grows.
- Fees go to the deployer: `TREASURY_ADDRESS` is `0x616e…7896` in `apps/app/.env`.
- Ops wallet `0x68AE979FEf3bd70d137D52A0B64C7A3d93e1dE91` (`OPS_PRIVATE_KEY`, generated straight
  into `apps/app/.env`, never printed) is our own bundler: `submit` sends every operation as
  `EntryPoint.handleOps([op], ops)`, with the user's 7702 authorization in the transaction's
  authorization list on their first send. The EntryPoint repays it from the paymaster deposit,
  so it only floats gas; `submit` refuses while it holds under 0.0001 ETH. It isn't the treasury,
  so `/api/cron/paymaster-eth` doesn't run; the user tops up the deposit by hand.
- An operation Alchemy accepted but never mined dies on its own: the paymaster signature in it
  expires within minutes (AA32), so it can't land later next to a resend.
- **Before real users**: raise the Safe to 2-of-3 with separate keys (Settings → Setup, address
  unchanged), grow the deposit, move fees to a dedicated treasury or ops wallet, and test a
  first-time 7702 delegation end to end (still untested, see below).
- A new contract version deploys the same way and is appended to `deployments`; never remove an
  old address while anything it holds is unsettled.

## Vercel (2026-10-10)

- Project `holdsake` on the **Freelancerz** team (Hobby plan), production at
  https://holdsake.vercel.app. Not linked to GitHub: deploy with `vercel deploy --prod` from the
  repo root (`.vercel/` is gitignored; the project's root directory is `apps/app`, Node 24.x).
- Production env was copied from `apps/app/.env` (values never printed; `VERIFY_*` left out,
  server keys marked sensitive) with `VITE_APP_URL=https://holdsake.vercel.app`.
- **Hobby runs crons at most once a day** and refuses a deploy with an hourly schedule, so
  `/api/cron/prices` runs daily; the short chart ranges fill in slowly until the plan or an
  external scheduler allows hourly.
- Privy needs `https://holdsake.vercel.app` in its allowed origins (and Google's redirect) or
  sign-in fails there.

## App: what's built (2026-10-09)

- **Stock list**: `packages/sdk/src/stock-tokens.gen.ts`, 194 Stock Tokens: everything Robinhood's
  token factory (`0x4783…c046`) created, each with runtime code byte-identical to TSLA's (which
  embeds the beacon `0xe10b…1b00`), minus 10 with no supply and one test token.
- **Markets**: `packages/sdk/src/stock-pools.gen.ts`, candidate Uniswap v4 pools per stock against
  USDG, found by scanning every PoolManager `Initialize` event for Stock Tokens (101k pools, mostly
  spam). Only hookless pools at a fee of at most 5% (`MAX_POOL_FEE`): many stocks only have real
  depth at 2-5%, while lookalike pools charge 50-96% at made-up prices. 190 stocks have one; AEIS,
  SATS, VTI and WEEK only trade in hooked or pricier pools and show without a price. A stock is
  valued at its deepest live pool; a trade quotes every candidate and takes the best.
- **Prices**: Chainlink where a feed exists (10 stocks), otherwise the pool's spot price for display
  and valuation. A feed is read as USD per whole token with the multiplier in it; `pricePerShare`
  divides by `uiMultiplier`. Fees taken in shares still need a fresh Chainlink price
  (`chargeableFeed`); a pool price can be pushed around.
- **Trades** (`lib/server/trades.ts`): exact-input single-pool swaps through Universal Router 2.1.2
  with Permit2, quoted by V4Quoter, 1% slippage, refused when the price is more than 3% (plus the
  pool's own fee, shown on the receipt) from Chainlink, or from the pool's spot price where there's
  no feed. The swap input carries `minHopPriceX36` (0) between `amountOutMinimum` and
  `hookData`: Universal Router 2.1.2's v4-periphery added it, and the older 5-field struct makes
  the router revert with no reason (found and fixed on a fork, 2026-10-09). A full buy through
  the app hasn't landed yet.
- **Network note**: the public RPC's DNS is blocked by Indonesian ISPs (it resolves to
  `aduankonten.id`); scripts reach it through its real Cloudflare IP with `curl --resolve`. Alchemy's
  free tier caps `eth_getLogs` at 10 blocks, so scans run against the public RPC.
- **Auth**: our own screens over Privy's headless hooks (email code, Google). No Privy modal.
- **One submit route for every flow**: `POST /api/operations/$id/submit`. The browser sends only
  its signatures; the server sends exactly the recorded draft (`lib/server/operations.ts`), after
  checking the signer, the delegation target and the sponsorship window, and simulating.
- **Signing in the browser** goes through Privy's `toViemAccount` on the embedded wallet, not
  `useSign7702Authorization`/`useSignTypedData`: those require `useWallets().ready`, which Privy
  (3.47 and 3.48) only sets after an external wallet connector initialises. With
  `disableAllExternalWallets` there are none, so it never does ("Wallets are not ready"). Recheck
  on a Privy upgrade before switching back.
- **Approve, not permit**: inside a 7702 batch an exact-amount `approve` costs no extra
  signature, while `permit` would need a second one.
- **First-time delegation**: the paymaster hash uses the packed initCode (`0x7702` padded to 20
  bytes). Alchemy's bundler also needs `factory` padded to 20 bytes (it rejects viem's 2-byte
  `0x7702` as "wrong address length"); `paddedFactoryTransport` in `operations.ts` rewrites it.
  viem hashes both forms the same. Server logs go through `logError`, which strips URLs: viem
  puts the RPC URL, API key included, into its error text. Untested so far, on a fork or on mainnet; the fork test delegated beforehand. The first
  gift from a fresh account is the test.
- **UI loading**: `Spinner` (ldrs `Ring2`) for full-screen waits, `Skeleton`/`RowsSkeleton` for
  lists, totals, the stock page and the chart; switching chart range dims the old line.
- **Funds**: beneficiary is yourself or an existing @handle (an email would pregenerate an
  account outside a gift). Contributions are shares the person holds; cash contributions wait
  for trading.
- **Notifications**: the feed polls every 30s and refetches balances and gifts when money arrives.
  Deposits are found by `alchemy_getAssetTransfers` (Alchemy-only; another RPC provider turns the
  scan off with a logged error), run from the portfolio and feed routes at most every 20s per
  person, starting at the block of their first scan. Canonical tokens only (spam lookalikes are
  sent to accounts); transfers in the person's own operations or from our contracts are skipped.
  Emails go out for things that happen while you're away (gift received/opened/returned,
  deposits, fund events), and to an email recipient who isn't on Holdsake yet when a gift lands.
  Migration `20261009000000_deposit_notifications.sql` must be applied first.
- **Borrow** (`lib/server/borrow.ts`, `/api/borrow/*`, `/borrow`, kinds `borrow_open`,
  `borrow_repay`, `borrow_withdraw`, migration `20261009020000_borrow.sql`): we cap loans at
  50% of the shares' value (Morpho allows 62.5%), so a stock falls ~20% from the most-borrowed
  point before anything is sold. Shares to lock are worked out from the amount asked; repaying
  everything repays by shares (approving a 0.1% interest margin, reset to 0 after); taking
  shares back is refused if what stays wouldn't cover the loan at that line. Every loan shows
  the fall %, the sell price per share and the penalty (1/(0.3·LLTV+0.7)−1 ≈ 12.7%). Lock,
  borrow, 30 days, repay by shares and take back all ran on a fork with the user's account.
- **Gift cards** (`lib/gift-cards.ts`, migration `20261009030000_gift_cards.sql`): every gift is
  wrapped in a greeting card (birthday, angpao, lunar_new_year, lebaran, christmas, graduation,
  wedding). Art is hand-drawn SVG in a flat paper-cut print style, three inks per card, no
  gradients, emoji or stock icons; one source renders in the app and on the server.
  `/api/gifts/$id/card.png` (satori + @resvg/resvg-js, Google Sans TTF fetched once) is the
  link's `og:image` and the "Save card" download; it shows only the occasion and the two names,
  never the amount or the message. `@vercel/og` was tried and dropped: its Node build fails with
  "Dynamic require of fs".
- **Not built yet**: crons, events sync, push, share cards, watchlists, cash
  contributions to funds (they'd buy through the trade path).

## Earn (built 2026-10-09, after apys.co)

Cash goes into one Morpho Vault V2 over USDG (`EARN_VAULT` in `deployments.ts`) and stays the
person's; what it grows by above what they put in is interest, claimed as shares of a stock they
pick. Nothing moves without their signature, so claiming is a button, never a background buy.

- **Vault: NetNet Credit (nnUSDG), the user's choice.** It lends to people borrowing against
  Stock Tokens (SPCX, NVDA, AAPL, GOOGL, MSFT) plus wsNET. One multisig curates it, 10%
  performance fee; ~21.7% net APY on 2026-10-09 because its markets ran at ~99.8% use, which also
  meant only ~$4 could leave at once. The other sizeable USDG vault, Purinta, lends against meme
  tokens (Pons, Cash Cat, Artificial Inu) and was turned down for that. Re-check the collateral
  before switching vaults; a vault is one line in `deployments.ts`.
- **Accounting** (`earn_positions`, migration `20261009010000_earn.sql`): `principal_raw` moves
  by the cash that actually went into or came out of the vault in each confirmed operation (USDG
  transfers wallet→vault and vault→wallet in its logs). Interest = `convertToAssets(shares)` −
  principal. Withdrawals eat principal first.
- **Flows** (`lib/server/earn.ts`, `/api/earn/*`, operation kinds `earn_deposit`,
  `earn_withdraw`, `earn_claim`): deposit = approve + `deposit` + fee; withdraw = `withdraw`
  (or `redeem` all shares, no dust) + fee from the cash that arrives; claim = `withdraw(interest)`
  - `buyCalls` (shared with trades) + fee, from $0.25 of interest. Claims only buy stocks with a
    Chainlink feed, so the price check has a real reference.
- **Vault V2's `maxWithdraw`/`maxDeposit` always return 0.** Liquidity and APY come from
  Morpho's API (`blue-api.morpho.org`, cached 5 min) for display and a plain refusal; an
  unfillable withdrawal also fails its estimate before signing.
- Checked on a fork 2026-10-09 with the user's real account: deposit $0.50 (381k gas), 30 days
  of interest, partial withdraw (360k), redeem all (315k). Not yet done through the app.
- The Earn screen says where interest comes from and what can go wrong (waits to withdraw, rate
  moves, lending losses, share prices) in plain words; keep that section when changing it.

## Open decisions

Write the answer here before building what depends on it.

- ~~Which Morpho markets to offer~~ **Decided 2026-10-09:** `BORROW_MARKETS` in `deployments.ts`
  (NVDA, AAPL, GOOGL, TSLA at 62.5% LLTV). Each was read on-chain: USDG loan, canonical Stock
  Token collateral, Morpho's Chainlink oracle on Chainlink proxies (same owner and aggregators as
  `CHAINLINK_FEEDS`). The busy AAPL market (~99.8% used) has a non-standard oracle and isn't
  offered. Chainlink stops over the weekend: the screens say so.
- ~~Any fee on borrowing~~ **Decided:** only the usual gas fee at cost, no origination fee; the
  rate is Morpho's, shown live and called variable.
- **Brand accent colour** (`--primary` is a placeholder black).
- **Landing page** stack and design.

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
- Don't add Telegram (login, Mini App, bot, names as recipients), even though Morrow has it.
