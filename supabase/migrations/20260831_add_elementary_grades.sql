-- 초등학교 1~6학년을 grade_level enum에 추가한다. 기존 값/데이터는 그대로.

alter type public.grade_level add value if not exists 'elementary_1';
alter type public.grade_level add value if not exists 'elementary_2';
alter type public.grade_level add value if not exists 'elementary_3';
alter type public.grade_level add value if not exists 'elementary_4';
alter type public.grade_level add value if not exists 'elementary_5';
alter type public.grade_level add value if not exists 'elementary_6';
