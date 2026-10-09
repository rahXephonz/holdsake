-- Borrow against shares on Morpho Blue. Positions live on Morpho and are read back from it; the
-- only thing stored is the operation, like every other flow. Safe to re-run.

alter table public.operations drop constraint if exists operations_kind_check;
alter table public.operations add constraint operations_kind_check check (
  kind in (
    'gift_create', 'gift_claim', 'gift_refund',
    'fund_create', 'fund_contribute', 'fund_withdraw',
    'trade', 'send',
    'earn_deposit', 'earn_withdraw', 'earn_claim',
    'borrow_open', 'borrow_repay', 'borrow_withdraw'
  )
);

notify pgrst, 'reload schema';
