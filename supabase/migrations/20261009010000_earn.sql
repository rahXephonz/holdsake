-- Earn: cash lent out through a vault; the interest is claimed as shares. Safe to re-run.

alter table public.operations drop constraint if exists operations_kind_check;
alter table public.operations add constraint operations_kind_check check (
  kind in (
    'gift_create', 'gift_claim', 'gift_refund',
    'fund_create', 'fund_contribute', 'fund_withdraw',
    'trade', 'send',
    'earn_deposit', 'earn_withdraw', 'earn_claim'
  )
);

-- One row per person and vault. principal_raw is what they put in minus what they took out, in
-- cash units: anything the vault holds for them above it is interest, theirs to claim as shares.
create table if not exists public.earn_positions (
  user_id uuid not null references public.users (id) on delete cascade,
  vault text not null check (vault ~ '^0x[0-9a-f]{40}$'),
  principal_raw numeric(78, 0) not null default 0 check (principal_raw >= 0),
  -- The stock interest turns into; a catalog ticker
  target_ticker text not null default 'NVDA',
  -- Everything ever claimed, in cash units, for "earned so far"
  claimed_raw numeric(78, 0) not null default 0 check (claimed_raw >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, vault)
);

drop trigger if exists earn_positions_updated_at on public.earn_positions;
create trigger earn_positions_updated_at before update on public.earn_positions
for each row execute function public.set_updated_at();

alter table public.earn_positions enable row level security;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'gift_sent', 'gift_received', 'gift_opened', 'gift_returned', 'gift_expiring',
    'fund_contribution', 'fund_unlocked',
    'trade_bought', 'trade_sold', 'cash_received', 'stock_received',
    'earn_claimed'
  )
);

notify pgrst, 'reload schema';
