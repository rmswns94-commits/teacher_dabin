-- 수업 그룹 대표 아이콘 (emoji preset). additive — 기존 그룹은 null(기본 아이콘 fallback).
alter table public.class_groups
  add column if not exists icon text;

alter table public.class_groups
  drop constraint if exists class_groups_icon_length;
alter table public.class_groups
  add constraint class_groups_icon_length
  check (icon is null or char_length(icon) <= 16);
