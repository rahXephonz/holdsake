-- Holdsake schema. Every table is server-only: RLS is on with no policies, so the anon key reads
-- nothing and the app talks to Postgres through the service role in server routes.
-- Safe to re-run.

create extension if not exists citext;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- People. The account address is the Privy embedded wallet (an EOA that delegates to
-- Simple7702Account), always read from Privy on the server, never taken from the browser.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  privy_id text not null unique,
  email citext unique,
  wallet_address text unique check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  handle citext unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  name text check (char_length(name) between 1 and 60),
  avatar_path text,
  country text,
  not_us_person boolean not null default false,
  terms_accepted_at timestamptz,
  -- Sponsored operations that reverted on-chain; past a small number we stop paying for them
  failed_ops integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at before update on public.users
for each row execute function public.set_updated_at();

-- One row per user operation the server built: what it may contain is recorded here before the
-- browser signs, and `submit` refuses anything that doesn't match (AGENT.md "Submit checks").
create table if not exists public.operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  sender text not null,
  kind text not null check (
    kind in (
      'gift_create', 'gift_claim', 'gift_refund',
      'fund_create', 'fund_contribute', 'fund_withdraw',
      'trade', 'send'
    )
  ),
  -- The exact calls allowed, as [{ to, data, value }] hex strings
  calls jsonb not null,
  fee_raw numeric(78, 0) not null default 0 check (fee_raw >= 0),
  fee_token text,
  -- What the browser is asked to sign: the unsigned user operation and its hash
  user_op jsonb not null,
  user_op_hash text not null unique,
  valid_until timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'confirmed', 'failed', 'expired')),
  tx_hash text unique,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operations_user_idx on public.operations (user_id, created_at desc);
create index if not exists operations_draft_idx on public.operations (created_at)
  where status = 'draft';

drop trigger if exists operations_updated_at on public.operations;
create trigger operations_updated_at before update on public.operations
for each row execute function public.set_updated_at();

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  -- Keyed on-chain by (contract, onchain_id); onchain_id comes from GiftCreated after submit
  contract text not null,
  onchain_id numeric(78, 0),
  sender_id uuid not null references public.users (id),
  sender_wallet text not null,
  -- Exactly who may open it: a Holdsake user, or an email that got a pregenerated account
  recipient_id uuid references public.users (id),
  recipient_email citext,
  recipient_wallet text not null,
  message text check (char_length(message) <= 280),
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'opened', 'claimed', 'refunded')),
  fee_raw numeric(78, 0) not null default 0,
  expires_at timestamptz,
  create_operation_id uuid references public.operations (id),
  create_tx text unique,
  settle_tx text,
  opened_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract, onchain_id),
  check (recipient_id is not null or recipient_email is not null)
);

create index if not exists gifts_sender_idx on public.gifts (sender_id, created_at desc);
create index if not exists gifts_recipient_idx on public.gifts (recipient_wallet, created_at desc);
create index if not exists gifts_expiry_idx on public.gifts (expires_at) where status in ('pending', 'opened');

drop trigger if exists gifts_updated_at on public.gifts;
create trigger gifts_updated_at before update on public.gifts
for each row execute function public.set_updated_at();

create table if not exists public.gift_items (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.gifts (id) on delete cascade,
  -- Position in the on-chain items array
  index smallint not null check (index between 0 and 3),
  token text not null,
  amount_raw numeric(78, 0) not null check (amount_raw > 0),
  usd_value numeric(14, 2),
  settled boolean not null default false,
  unique (gift_id, index),
  unique (gift_id, token)
);

create table if not exists public.funds (
  id uuid primary key default gen_random_uuid(),
  contract text not null,
  onchain_id numeric(78, 0),
  name text not null check (char_length(name) between 1 and 60),
  creator_id uuid not null references public.users (id),
  creator_wallet text not null,
  beneficiary_name text not null check (char_length(beneficiary_name) between 1 and 60),
  beneficiary_id uuid references public.users (id),
  beneficiary_email citext,
  beneficiary_wallet text not null,
  purpose text not null default 'other'
    check (purpose in ('college', 'first_home', 'wedding', 'retirement', 'other')),
  goal_usd numeric(14, 2) check (goal_usd > 0),
  unlock_at timestamptz not null,
  -- What contributions buy: { "<token>": <percent> }, summing to 100
  allocations jsonb not null default '{}'::jsonb,
  -- The on-chain dust floor per token: { "<token>": "<minRaw>" }
  min_raw jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'withdrawn')),
  create_operation_id uuid references public.operations (id),
  create_tx text unique,
  unlock_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract, onchain_id)
);

create index if not exists funds_creator_idx on public.funds (creator_id, created_at desc);
create index if not exists funds_beneficiary_idx on public.funds (beneficiary_wallet, created_at desc);
create index if not exists funds_unlock_idx on public.funds (unlock_at) where status = 'active';

drop trigger if exists funds_updated_at on public.funds;
create trigger funds_updated_at before update on public.funds
for each row execute function public.set_updated_at();

create table if not exists public.fund_contributions (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  -- Rows added in the same breath share a group and read as one entry
  group_id uuid not null default gen_random_uuid(),
  contributor_id uuid references public.users (id),
  contributor_name text not null,
  contributor_wallet text,
  token text not null,
  amount_raw numeric(78, 0) not null check (amount_raw > 0),
  usd_value numeric(14, 2),
  note text check (char_length(note) <= 140),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  operation_id uuid references public.operations (id),
  tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists fund_contributions_fund_idx on public.fund_contributions (fund_id, created_at desc);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  side text not null check (side in ('buy', 'sell')),
  token text not null,
  amount_raw numeric(78, 0) not null,
  cash_raw numeric(78, 0) not null,
  fee_raw numeric(78, 0) not null default 0,
  operation_id uuid references public.operations (id),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'failed')),
  tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists trades_user_idx on public.trades (user_id, created_at desc);

create table if not exists public.sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  token text not null,
  destination text not null check (destination ~ '^0x[0-9a-f]{40}$'),
  amount_raw numeric(78, 0) not null check (amount_raw > 0),
  operation_id uuid references public.operations (id),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'failed')),
  tx_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (
    kind in (
      'gift_sent', 'gift_received', 'gift_opened', 'gift_returned', 'gift_expiring',
      'fund_contribution', 'fund_unlocked',
      'trade_bought', 'trade_sold', 'cash_received'
    )
  ),
  title text not null,
  body text not null,
  href text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.notification_settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  gifts boolean not null default true,
  funds boolean not null default true,
  trades boolean not null default true,
  push boolean not null default true,
  email boolean not null default true
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Last block read per contract, so the hourly sync picks up where it stopped
create table if not exists public.sync_cursors (
  contract text primary key,
  block numeric(20, 0) not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.price_candles (
  token text not null,
  resolution text not null check (resolution in ('1h', '1d')),
  bucket timestamptz not null,
  open numeric(20, 8) not null,
  high numeric(20, 8) not null,
  low numeric(20, 8) not null,
  close numeric(20, 8) not null,
  primary key (token, resolution, bucket)
);

alter table public.users enable row level security;
alter table public.operations enable row level security;
alter table public.gifts enable row level security;
alter table public.gift_items enable row level security;
alter table public.funds enable row level security;
alter table public.fund_contributions enable row level security;
alter table public.trades enable row level security;
alter table public.sends enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.sync_cursors enable row level security;
alter table public.price_candles enable row level security;

-- Profile photos are public (they show on gift previews). Uploads go through the API with the
-- service role, so there are no insert/update policies for anon or authenticated clients.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
