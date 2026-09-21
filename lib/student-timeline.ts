import type {
  AttendanceStatus,
  MakeupStatus,
  PraiseCategory,
  SchoolExamType,
} from "@/lib/supabase/types";
import type { ConsultationMethod, ConsultationTarget } from "@/lib/validation/consultation";

// 학생 통합 타임라인 — 기존 기록을 학생 기준으로 합쳐 보여주는 read-only 파생 view.
//
// 원칙
// - 새 timeline 테이블/row를 만들지 않는다. 여기 helper는 DB를 모르는 순수 함수다.
// - 각 item의 날짜는 "그 일이 실제로 있었던 날"이다 (created_at 대체 사용 금지):
//   수업=class_date, 숙제=due_date, 보충=완료일 또는 예정일, 칭찬=기록 시각(KST), 시험=시작일.
// - 출결·평가·온라인 복습은 별도 item이 아니라 그날 수업 item 안에 담는다 —
//   "전체"에서 같은 기록이 카드 두 개로 중복되지 않게 하기 위해서다.

export type TimelineCategory =
  | "all"
  | "lesson"
  | "attendance"
  | "homework"
  | "evaluation"
  | "exam"
  | "makeup"
  | "praise"
  | "consultation";

export const TIMELINE_CATEGORIES: { value: TimelineCategory; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "lesson", label: "수업" },
  { value: "attendance", label: "출결" },
  { value: "homework", label: "숙제" },
  { value: "evaluation", label: "평가" },
  { value: "exam", label: "시험" },
  { value: "makeup", label: "보충" },
  { value: "praise", label: "칭찬" },
  { value: "consultation", label: "상담" },
];

export type TimelineRange = "1m" | "3m" | "6m" | "all";

export const TIMELINE_RANGES: { value: TimelineRange; label: string; months: number | null }[] = [
  { value: "1m", label: "최근 1개월", months: 1 },
  { value: "3m", label: "최근 3개월", months: 3 },
  { value: "6m", label: "최근 6개월", months: 6 },
  { value: "all", label: "전체", months: null },
];

export function parseTimelineCategory(value: string | undefined): TimelineCategory {
  const found = TIMELINE_CATEGORIES.find((item) => item.value === value);
  return found ? found.value : "all";
}

export function parseTimelineRange(value: string | undefined): TimelineRange {
  const found = TIMELINE_RANGES.find((item) => item.value === value);
  return found ? found.value : "3m";
}

// 범위 시작 날짜 (KST date-only). "전체"면 null — 조회 쪽에서 하한을 두지 않는다.
export function timelineRangeStart(range: TimelineRange, today: string): string | null {
  const months = TIMELINE_RANGES.find((item) => item.value === range)?.months ?? null;

  if (months === null) {
    return null;
  }

  const [y, m, d] = today.split("-").map(Number);
  // UTC 정오 anchor — 달 계산에서 하루가 밀리지 않는다
  const start = new Date(Date.UTC(y, m - 1 - months, d, 12));
  return start.toISOString().slice(0, 10);
}

export type TimelineHomework = {
  id: string;
  content: string;
  dueDate: string;
  contextLabel: string | null; // 교재/학교 이름 스냅샷
  audienceLabel: string; // "공통" 또는 학생 이름
  completed: boolean;
  completedDate: string | null; // KST date-only
};

export type LessonTimelineItem = {
  type: "lesson";
  id: string;
  date: string;
  sortTime: string | null; // "HH:MM" (알 수 있을 때만)
  dailyLogId: string;
  groupId: string | null;
  groupName: string | null;
  groupIcon: string | null;
  timeLabel: string | null;
  title: string | null;
  progress: string; // 학생 개인 진도가 있으면 그것, 없으면 공통 진도 (legacy fallback 포함)
  progressIsCommon: boolean;
  attendance: AttendanceStatus;
  // 출결 사유 (지각/조퇴/결석에서만 의미 — 없으면 null, "-"/"없음" 같은 대체 문구를 만들지 않는다)
  attendanceReason: string | null;
  evaluation: string | null; // 학생 평가 (줄바꿈 보존)
  // 3-state 그대로: null = 기록 없음
  onlineReviewCompleted: boolean | null;
  homework: TimelineHomework[];
};

export type HomeworkTimelineItem = {
  type: "homework";
  id: string;
  date: string;
  sortTime: null;
  dailyLogId: string | null;
  groupName: string | null;
  groupIcon: string | null;
  homework: TimelineHomework;
};

export type MakeupTimelineItem = {
  type: "makeup";
  id: string;
  date: string;
  sortTime: string | null;
  status: MakeupStatus;
  timeLabel: string | null;
  originalClassDate: string;
  groupName: string | null;
  groupIcon: string | null;
  missedProgress: string | null;
  completedProgress: string | null;
  comment: string | null;
};

export type PraiseTimelineItem = {
  type: "praise";
  id: string;
  date: string;
  sortTime: string | null;
  category: PraiseCategory;
  comment: string | null;
  dailyLogId: string | null;
};

export type ExamTimelineItem = {
  type: "exam";
  id: string;
  date: string;
  sortTime: null;
  schoolName: string;
  examType: SchoolExamType;
  examYear: number;
  semester: 1 | 2;
  endDate: string;
  scopeText: string | null;
};

// 상담 기록 — 수업 기록 안에 들어 있는 데이터가 아니라 독립 이벤트라 중복 문제가 없다.
// 타임라인에서는 읽기 전용이다 (수정/삭제는 상담 기록 탭에서).
export type ConsultationTimelineItem = {
  type: "consultation";
  id: string;
  date: string;
  sortTime: string | null; // "HH:MM" (상담 시간을 아는 경우)
  consultationId: string;
  target: ConsultationTarget;
  method: ConsultationMethod;
  summary: string;
  followUpNote: string | null;
};

export type StudentTimelineItem =
  | LessonTimelineItem
  | HomeworkTimelineItem
  | MakeupTimelineItem
  | PraiseTimelineItem
  | ExamTimelineItem
  | ConsultationTimelineItem;

// 같은 날짜 안의 표시 순서 — 시각을 아는 항목이 먼저(늦은 시각이 위), 그다음 종류, 마지막은 id.
// 어떤 두 item도 같은 key를 갖지 않아 페이지 경계에서 중복/누락이 생기지 않는다.
const TYPE_RANK: Record<StudentTimelineItem["type"], number> = {
  lesson: 0,
  makeup: 1,
  consultation: 2,
  exam: 3,
  homework: 4,
  praise: 5,
};

export function compareTimelineItems(a: StudentTimelineItem, b: StudentTimelineItem) {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1; // 최신 → 과거
  }

  const timeA = a.sortTime ?? "";
  const timeB = b.sortTime ?? "";
  if (timeA !== timeB) {
    // 시각이 있는 항목이 위로, 같은 조건이면 늦은 시각이 위로
    return timeA < timeB ? 1 : -1;
  }

  if (a.type !== b.type) {
    return TYPE_RANK[a.type] - TYPE_RANK[b.type];
  }

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortTimelineItems(items: readonly StudentTimelineItem[]): StudentTimelineItem[] {
  return [...items].sort(compareTimelineItems);
}

// 선택한 카테고리에 해당하는 item만.
// 출결/평가는 수업 item이 그 정보를 담고 있으므로 "수업 중 해당 기록이 있는 것"으로 좁힌다
// (같은 기록을 별도 카드로 복제하지 않고, 필터에서만 다른 방식으로 보여준다).
export function filterTimelineItems(
  items: readonly StudentTimelineItem[],
  category: TimelineCategory,
): StudentTimelineItem[] {
  switch (category) {
    case "all":
      return [...items];
    case "lesson":
      return items.filter((item) => item.type === "lesson");
    case "attendance":
      return items.filter((item) => item.type === "lesson");
    case "evaluation":
      return items.filter(
        (item) =>
          item.type === "lesson" &&
          (Boolean(item.evaluation?.trim()) || item.onlineReviewCompleted !== null),
      );
    case "homework":
      return items.filter(
        (item) =>
          item.type === "homework" || (item.type === "lesson" && item.homework.length > 0),
      );
    case "exam":
      return items.filter((item) => item.type === "exam");
    case "makeup":
      return items.filter((item) => item.type === "makeup");
    case "praise":
      return items.filter((item) => item.type === "praise");
    case "consultation":
      return items.filter((item) => item.type === "consultation");
    default:
      return [...items];
  }
}

export const TIMELINE_PAGE_SIZE = 30;

// 날짜별 묶음 (날짜 heading 아래 그 날 item들). 정렬은 이미 끝난 목록을 그대로 쓴다.
export function groupTimelineByDate(items: readonly StudentTimelineItem[]) {
  const groups: { date: string; items: StudentTimelineItem[] }[] = [];

  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.date) {
      last.items.push(item);
      continue;
    }
    groups.push({ date: item.date, items: [item] });
  }

  return groups;
}

// timestamptz(UTC ISO) → KST 날짜/시각. 칭찬처럼 시각까지 저장된 기록용.
export function kstDateAndTime(iso: string) {
  const kst = new Date(Date.parse(iso) + 9 * 3_600_000);
  const text = kst.toISOString();
  return { date: text.slice(0, 10), time: text.slice(11, 16) };
}
