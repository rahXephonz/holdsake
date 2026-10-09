-- Gift cards: the greeting card a gift is wrapped in. Safe to re-run.
alter table public.gifts add column if not exists card_theme text not null default 'birthday';
alter table public.gifts drop constraint if exists gifts_card_theme_check;
alter table public.gifts add constraint gifts_card_theme_check check (
  card_theme in (
    'birthday', 'angpao', 'lunar_new_year', 'lebaran', 'christmas', 'graduation', 'wedding'
  )
);

notify pgrst, 'reload schema';
