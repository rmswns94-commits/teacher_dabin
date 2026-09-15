import { formatShortDateWithWeekday } from "@/lib/dates";
import { formatHomeworkDisplay, homeworkAudienceLabel } from "@/lib/homework-assignments";
import { linkedContextLabel } from "@/lib/textbooks";

// 오늘 숙제 공유 텍스트 — source는 항상 "현재 폼 state" (DB 조회 아님).
// 표시 문구는 기존 숙제 표시 정책(formatHomeworkDisplay/linkedContextLabel)을 그대로 재사용한다:
//   공통 · Grammar Inside 2 - p.42~47   (일반 = 교재 context)
//   마감: 9/18(금)                       (숙제별 마감일 + 요일 — 항목 바로 아래 줄)
// content 내부 줄바꿈은 보존한다 (trim은 앞뒤 공백만).

export const HOMEWORK_SHARE_TITLE = "📚 오늘의 숙제";

export type ShareableHomeworkItem = {
  content: string;
  textbook?: string | null;
  school?: string | null;
  // 대상 학생의 "표시 이름" — 비어 있으면 공통 (id 해석은 호출부 책임: roster → 저장 스냅샷 순)
  assignedStudentName?: string | null;
  // 폼의 effective 마감일("YYYY-MM-DD") — 기본값(다음 수업일)은 addAssignment가 이미
  // nextClassDateAfter로 채워 두므로 여기서 날짜를 새로 계산하지 않는다.
  // 비어 있으면 "미정"으로 표시한다 (임의 날짜 생성 금지).
  dueDate?: string | null;
};

// 공유 대상 = 내용이 있는 숙제만 — 저장 정책과 같은 meaningful 기준
// (내용 없이 완료일만 고른 행은 저장 검증에서도 완성으로 인정되지 않는다).
// 순서는 입력 배열 그대로 유지 — 교사가 폼에서 보는 순서가 곧 공유 순서 (재정렬 금지).
export function shareableHomework<T extends ShareableHomeworkItem>(items: readonly T[]): T[] {
  return items.filter((item) => item.content.trim().length > 0);
}

export function formatHomeworkShareLine(item: ShareableHomeworkItem): string {
  return formatHomeworkDisplay({
    audienceLabel: homeworkAudienceLabel(item.assignedStudentName),
    contextLabel: linkedContextLabel(item),
    content: item.content,
  });
}

// 숙제별 마감 줄 — "마감: 9/18(금)". 날짜가 비어 있으면 줄을 숨기지 않고 "마감: 미정"으로
// 드러낸다 (교사가 날짜를 빠뜨린 사실을 공유 화면에서 놓치지 않게).
export function formatHomeworkShareDueLine(dueDate: string | null | undefined): string {
  return `마감: ${formatShortDateWithWeekday(dueDate) || "미정"}`;
}

// 최종 공유 텍스트. 첫 줄 제목 + 빈 줄 + 숙제 블록들(내용 줄 + 마감 줄, 블록 사이 빈 줄).
// 숙제마다 서로 다른 마감일을 각자 블록 아래에 표시한다 — 상단 공통 날짜 없음.
// URL/그룹명은 붙이지 않는다 — 숙제 내용 전달이 목적.
export function buildHomeworkShareText(items: readonly ShareableHomeworkItem[]): string {
  const blocks = shareableHomework(items).map(
    (item) => `${formatHomeworkShareLine(item)}\n${formatHomeworkShareDueLine(item.dueDate)}`,
  );
  return [HOMEWORK_SHARE_TITLE, "", blocks.join("\n\n")].join("\n");
}
