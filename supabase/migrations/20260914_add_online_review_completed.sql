-- Existing and unassessed records remain NULL. Reuse existing row ownership/RLS.
ALTER TABLE public.student_lesson_logs
  ADD COLUMN IF NOT EXISTS online_review_completed BOOLEAN NULL DEFAULT NULL;
