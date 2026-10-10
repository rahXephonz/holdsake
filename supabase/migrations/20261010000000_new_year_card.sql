-- Gift cards: adds the New Year card. Safe to re-run.
alter table public.gifts drop constraint if exists gifts_card_theme_check;
alter table public.gifts add constraint gifts_card_theme_check check (
  card_theme in (
    'birthday', 'new_year', 'angpao', 'lunar_new_year', 'lebaran', 'christmas', 'graduation',
    'wedding'
  )
);

notify pgrst, 'reload schema';
