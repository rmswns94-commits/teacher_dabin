"use server";

import { z } from "zod";

import { getLessonImportCandidates } from "@/lib/supabase/queries/daily-logs";
import type { LessonImportCandidates } from "@/lib/lesson-import";

// [지난 수업에서 가져오기] 후보 조회 — 다이얼로그를 열 때 현재 폼의 (group, lesson_date) 기준으로 호출한다.
// 폼 안에서 날짜를 바꾸면 그 날짜 기준으로 다시 resolve되고(TEST 20), 그룹 변경은 페이지 이동이라 자연 갱신된다.
// 조회만 한다 — 어떤 row도 만들거나 바꾸지 않는다 (import는 폼 local state merge뿐).
const inputSchema = z.object({
  groupId: z.string().uuid(),
  lessonDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function getLessonImportCandidatesAction(
  input: unknown,
): Promise<{ candidates: LessonImportCandidates } | { error: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "가져올 수업 정보를 확인해주세요." };
  }

  try {
    return { candidates: await getLessonImportCandidates(parsed.data.groupId, parsed.data.lessonDate) };
  } catch (error) {
    console.error("getLessonImportCandidatesAction error", error);
    return { error: "지난 수업 항목을 불러오지 못했어요. 다시 시도해주세요." };
  }
}
