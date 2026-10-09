-- What a company does, from the profile provider, and when its daily closes were last fetched.
-- The free tier is a few hundred calls a day, so both are cached here. Safe to re-run.

create table if not exists public.stock_profiles (
  ticker text primary key,
  description text,
  sector text,
  industry text,
  website text,
  fetched_at timestamptz not null default now(),
  -- Daily closes: null until tried; false when the provider's plan doesn't cover this ticker
  eod_available boolean,
  eod_fetched_at timestamptz
);

alter table public.stock_profiles enable row level security;

-- Closes come from two places that never share a resolution: '1d' rows are the listed stock's
-- daily closes from the provider, '1h' rows are our own hourly record of the price we show
alter table public.price_candles add column if not exists fetched_at timestamptz not null default now();

create index if not exists price_candles_recent_idx
  on public.price_candles (token, resolution, bucket desc);

notify pgrst, 'reload schema';
