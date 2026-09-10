import { formatKoreanDate } from "@/lib/dates";
import { linkedContextLabel } from "@/lib/textbooks";

// 오늘 숙제(구조화) 공용 헬퍼.
// mirror: 구조화 숙제를 daily_logs.homework 텍스트로도 파생 기록한다 —
// 지난 숙제 카드/브리핑/그룹 요약 등 기존 free-text 소비처가 코드 변경 없이 계속 동작하게.
// homework_due_date는 이때 null로 남겨 기존 "숙제 날짜 → Teacher Todo 연동"이 발동하지 않는다.

export type HomeworkAssignmentInput = {
  id: string | null; // 기존 row id (수정 sync용) — 새 항목은 null
  content: string;
  dueDate: string; // "YYYY-MM-DD"
  textbook?: string | null; // 연결 교재 이름 스냅샷 (없으면 content만 표시)
  // 숙제 대상: null = 반 공통, uuid = 그 학생 한 명 ("공통"은 가짜 학생 row가 아니다)
  assignedStudentId?: string | null;
};

// 숙제 대상 라벨 — 공통이면 고정 문구, 특정 학생이면 이름.
// 색이 아니라 실제 텍스트로 구분한다 (한 곳에서만 정의해 화면마다 문구가 갈리지 않게).
export const COMMON_HOMEWORK_LABEL = "공통";

export function homeworkAudienceLabel(studentName?: string | null): string {
  return studentName?.trim() || COMMON_HOMEWORK_LABEL;
}

// 숙제 한 줄의 표시 문자열 — 상세/브리핑/mirror가 전부 이 함수를 쓴다 (문구 중복 구현 금지).
// "공통 · Grammar Inside 2 - p.42~47" / "김민지 · p.42~47"(context 없음)
// context가 없을 때 undefined/null/"교재 없음" 같은 prefix를 절대 붙이지 않는다.
export function formatHomeworkDisplay({
  audienceLabel,
  contextLabel,
  content,
}: {
  audienceLabel: string;
  contextLabel?: string | null;
  content: string;
}): string {
  const context = contextLabel?.trim();
  return `${audienceLabel} · ${context ? `${context} - ` : ""}${content.trim()}`;
}

// due_date ASC(같으면 입력 순서) 정렬 사본
export function sortAssignments<T extends { dueDate: string }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate) || a.index - b.index)
    .map(({ item }) => item);
}

// 파생 텍스트: "9월 11일까지 · 공통 · [교재명/학교명 - ]내용" 줄들 (완료일 오름차순, 내부 \n 유지).
// 대상 이름은 저장 시점 스냅샷 — 교재/학교 이름과 같은 취급이라, 나중에 학생 이름이 바뀌어도
// 과거 mirror(지난 숙제)는 그때 기록한 이름 그대로 남는다.
export function buildHomeworkMirror(
  items: {
    content: string;
    dueDate: string;
    textbook?: string | null;
    school?: string | null;
    // 대상 학생 이름 — 비어 있으면 공통 (id가 아니라 표시용 이름을 받는다)
    assignedStudentName?: string | null;
  }[],
): string {
  return sortAssignments(items)
    .map((item) => {
      const line = formatHomeworkDisplay({
        audienceLabel: homeworkAudienceLabel(item.assignedStudentName),
        contextLabel: linkedContextLabel(item),
        content: item.content,
      });
      return `${formatKoreanDate(item.dueDate)}까지 · ${line}`;
    })
    .join("\n");
}

// 대상 라벨이 mirror에 들어가기 전(공통/학생 기능 이전)에 저장된 형식.
// 과거 데이터를 고쳐 쓰지 않으려고 판정용으로만 남긴다.
function buildLegacyHomeworkMirror(
  items: { content: string; dueDate: string; textbook?: string | null; school?: string | null }[],
): string {
  return sortAssignments(items)
    .map((item) => {
      const label = linkedContextLabel(item);
      return `${formatKoreanDate(item.dueDate)}까지 · ${label ? `${label} - ` : ""}${item.content.trim()}`;
    })
    .join("\n");
}

// 저장된 homework 텍스트가 구조화 숙제에서 파생된 mirror인지 (상세 화면에서 중복 숨김용).
// 새 형식과 옛 형식 둘 다 인정한다 — 예전에 저장한 일지도 계속 mirror로 인식되어야 한다.
export function isDerivedHomeworkMirror(
  homeworkText: string,
  items: {
    content: string;
    dueDate: string;
    textbook?: string | null;
    school?: string | null;
    assignedStudentName?: string | null;
  }[],
): boolean {
  const text = homeworkText.trim();
  if (!text || items.length === 0) {
    return false;
  }
  return text === buildHomeworkMirror(items) || text === buildLegacyHomeworkMirror(items);
}
