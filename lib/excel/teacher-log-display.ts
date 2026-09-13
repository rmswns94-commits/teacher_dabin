import type { ExamTextbook } from "@/lib/supabase/types";

// 교재 셀 값 — 시험 기간 ON이면 시험 대비용 교재, 아니면 일반 교재.
// 여러 권은 일반 교재(class_groups.textbook)와 같은 줄바꿈 표기로 이어 붙인다.
// 시험 기간 ON인데 등록된 교재가 없을 때만 "시험대비"(공백 없음)로 대체한다
// (표시용 fallback — DB에는 저장하지 않는다). OFF면 이 fallback을 쓰지 않는다:
// 저장된 시험 대비용 교재가 남아 있어도 무시하고 일반 교재를 쓴다.
export function examTextbookCell(
  group: {
    textbook: string | null;
    is_exam_period: boolean | null;
    exam_textbooks?: ExamTextbook[] | null;
  } | null,
) {
  const regular = group?.textbook?.trim() ?? "";

  if (!group?.is_exam_period) {
    return regular;
  }

  const examBooks = (group.exam_textbooks ?? [])
    .map((book) => book?.name?.trim() ?? "")
    .filter(Boolean);

  return examBooks.length > 0 ? examBooks.join("\n") : "시험대비";
}

