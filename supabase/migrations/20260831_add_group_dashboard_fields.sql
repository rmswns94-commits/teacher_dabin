-- Group mini-dashboard fields: textbook info and a highlight memo separate
-- from the general-purpose memo. Non-destructive, additive only.

alter table public.class_groups add column if not exists textbook text;
alter table public.class_groups add column if not exists highlight_memo text;
