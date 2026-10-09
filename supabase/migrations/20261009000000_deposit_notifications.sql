-- Deposit notifications: "You received $25 cash" when cash or shares arrive from outside the app.
-- Safe to re-run.

-- Where each person's incoming-transfer scan stopped. Null until their first scan, which starts
-- from the current block so nobody gets notified about their whole history.
alter table public.users add column if not exists deposits_block numeric(20, 0);
alter table public.users add column if not exists deposits_checked_at timestamptz;

-- Shares arriving get their own kind; cash keeps `cash_received`
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'gift_sent', 'gift_received', 'gift_opened', 'gift_returned', 'gift_expiring',
    'fund_contribution', 'fund_unlocked',
    'trade_bought', 'trade_sold', 'cash_received', 'stock_received'
  )
);

-- One notification per (person, event): two scans racing each other insert it once. Nulls never
-- collide, so notifications without a key are unaffected.
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_idx
  on public.notifications (user_id, dedupe_key);

notify pgrst, 'reload schema';
