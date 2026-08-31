-- Phase 3.5: homework, next lesson plan (per daily log) and a per-group
-- "today's preparation" checklist. Additive only, no destructive changes.

alter table public.daily_logs add column if not exists homework text;
alter table public.daily_logs add column if not exists next_lesson_plan text;

-- [{ "id": "uuid", "text": "지난 숙제 확인", "completed": false }, ...]
alter table public.class_groups add column if not exists preparation_items jsonb not null default '[]'::jsonb;
