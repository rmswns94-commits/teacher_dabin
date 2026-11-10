// 교사일지 Excel 데이터 조립 — 일 단위(/daily-logs/export?date=)와 월 단위(?month=)가
// 같은 함수를 쓴다. 같은 Daily Log는 어느 export에서든 같은 칸에 같은 값으로 나온다.
//
// - App Daily Log가 source of truth (예정 수업을 임의 생성하지 않음)
// - 포함 기준: completed는 항상, draft는 내용(공통 진도)이 있을 때만 (기존 일 단위 정책 그대로)
// - 시간은 그 날짜의 실제 수업(1회 휴강/시간 변경/날짜 이동/보강 반영)으로 확정 —
//   없거나 여러 개면 명확한 오류 (임의 추측 금지)
// - 교시 = 수업 시작 시간 오름차순 (같은 시각이면 반 이름 가나다 — 저장 순서와 무관)
import { dayOfWeekOf } from "@/lib/calendar";
import { formatMixedProgressForExcel } from "@/lib/mixed-display";
import { mergeLegacyLessonContent } from "@/lib/progress";
import {
  movedInOccurrences,
  resolveOccurrence,
  supplementOccurrences,
  type ScheduleExceptionIndex,
} from "@/lib/schedule-exceptions";
import type { ExamTextbook } from "@/lib/supabase/types";
import type { TextbookSection } from "@/lib/textbooks";

import { examTextbookCell } from "./teacher-log-display";
import {
  formatDateLabel,
  TEACHER_LOG_CONSTANTS,
  type TeacherLogExportData,
  type TeacherLogExportRow,
} from "./teacher-log-export";

// 교재 셀 결정에 필요한 그룹 필드까지 embed 1쿼리로 (그룹마다 추가 조회 없음)
export const TEACHER_LOG_EXPORT_SELECT =
  "id, group_id, class_date, status, default_progress, lesson_content, textbook_progress, school_progress, class_groups(id, name, textbook, is_exam_period, exam_textbooks)";

export type TeacherLogEntry = {
  date: string;
  groupId: string;
  status: string;
  progress: string;
  groupName: string;
  textbook: string;
};

export type TeacherLogScheduleSlot = {
  id: string;
  group_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type TeacherLogSourceRow = {
  group_id: string;
  class_date: string;
  status: string;
  default_progress: string | null;
  lesson_content: string | null;
  textbook_progress: unknown;
  school_progress: unknown;
  class_groups: unknown;
};

export function toTeacherLogEntry(row: TeacherLogSourceRow): TeacherLogEntry {
  const groups = row.class_groups;
  const group = (Array.isArray(groups) ? groups[0] : groups) as
    | {
        id: string;
        name: string;
        textbook: string | null;
        is_exam_period: boolean | null;
        exam_textbooks: ExamTextbook[] | null;
      }
    | null;

  return {
    date: row.class_date,
    groupId: row.group_id,
    status: row.status,
    progress: formatMixedProgressForExcel({
      raw: mergeLegacyLessonContent(row.default_progress, row.lesson_content),
      school: row.school_progress as TextbookSection[] | null,
      textbook: row.textbook_progress as TextbookSection[] | null,
    }),
    groupName: group?.name ?? "수업 그룹",
    // 교재 셀은 export 시점의 그룹 상태 기준 (historical snapshot 아님 — 기존 정책 유지).
    // 시험 기간 ON: 등록된 시험 대비용 교재 이름들, 하나도 없으면 "시험대비" fallback.
    // OFF: 기존 일반 교재 그대로. 그룹마다 독립 (하나가 ON이어도 다른 그룹은 영향 없음).
    textbook: examTextbookCell(group),
  };
}

// 실제 작성된 기록만: completed는 항상, draft는 내용(공통 진도)이 있을 때만 (빈/미작성 draft 제외)
export function isExportableTeacherLog(entry: TeacherLogEntry) {
  return entry.status === "completed" || entry.progress.trim() !== "";
}

export function teacherLogPeriodLimitError(count: number) {
  return count > TEACHER_LOG_CONSTANTS.MAX_PERIODS
    ? `교사일지는 하루 최대 ${TEACHER_LOG_CONSTANTS.MAX_PERIODS}교시까지 내보낼 수 있어요. 현재 ${count}개의 수업 기록이 있어요.`
    : null;
}

// 그 날짜에 각 그룹이 실제로 수업한 시간 후보 (1회 휴강 제외, 날짜 이동/보강 포함)
function groupTimesOn(
  date: string,
  slots: readonly TeacherLogScheduleSlot[],
  exceptionIndex: ScheduleExceptionIndex,
) {
  const dow = dayOfWeekOf(date);
  const timesByGroup = new Map<string, { start_time: string; end_time: string }[]>();
  const addTime = (groupId: string, start: string, end: string) => {
    const list = timesByGroup.get(groupId) ?? [];
    // 완전 중복 schedule row는 하나로
    if (!list.some((item) => item.start_time === start && item.end_time === end)) {
      list.push({ start_time: start, end_time: end });
    }
    timesByGroup.set(groupId, list);
  };

  for (const slot of slots) {
    if (slot.day_of_week !== dow) {
      continue;
    }

    // 1회 휴강이거나 다른 날짜로 옮겨간 수업은 이 날짜의 시간 후보가 아니다
    const effective = resolveOccurrence(exceptionIndex, slot.id, date, slot.start_time, slot.end_time);
    if (effective.cancelled) {
      continue;
    }

    addTime(slot.group_id, effective.startTime, effective.endTime);
  }

  // 이 날짜로 옮겨온 수업 (원래 요일이 달라도 이 날 실제로 진행된 수업)
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  for (const moved of movedInOccurrences(exceptionIndex, date)) {
    const slot = slotById.get(moved.scheduleId);
    if (!slot || !moved.startTime || !moved.endTime) {
      continue;
    }

    addTime(slot.group_id, moved.startTime, moved.endTime);
  }

  // 보강 — 반복 시간표가 없는 날에도 그 반이 실제로 수업한 시간이다
  for (const supplement of supplementOccurrences(exceptionIndex, date)) {
    addTime(supplement.groupId, supplement.startTime, supplement.endTime);
  }

  return timesByGroup;
}

export type TeacherLogDayResult =
  | { ok: true; data: TeacherLogExportData }
  | { ok: false; error: string };

const groupNameCollator = new Intl.Collator("ko-KR");

// 하루치 교사일지 데이터 — entries는 그 날짜의 export 대상 기록(isExportableTeacherLog)만
export function buildTeacherLogDay(
  date: string,
  entries: readonly TeacherLogEntry[],
  slots: readonly TeacherLogScheduleSlot[],
  exceptionIndex: ScheduleExceptionIndex,
): TeacherLogDayResult {
  const limitError = teacherLogPeriodLimitError(entries.length);
  if (limitError) {
    return { ok: false, error: limitError };
  }

  const timesByGroup = groupTimesOn(date, slots, exceptionIndex);
  const rows: (TeacherLogExportRow & { groupName: string })[] = [];

  for (const entry of entries) {
    const times = timesByGroup.get(entry.groupId) ?? [];

    // 시간 임의 추측 금지 — 없거나 애매하면 명확한 오류
    if (times.length === 0) {
      return { ok: false, error: `${entry.groupName}의 수업 시간을 확인할 수 없어 엑셀을 만들지 못했어요.` };
    }
    if (times.length > 1) {
      return {
        ok: false,
        error: `${entry.groupName}의 수업 시간을 확정할 수 없어요. (이 요일 시간표가 ${times.length}개예요)`,
      };
    }

    rows.push({
      startTime: times[0].start_time,
      endTime: times[0].end_time,
      textbook: entry.textbook,
      progress: entry.progress,
      groupName: entry.groupName,
    });
  }

  // 수업 시작 시간 오름차순 → 1교시부터 (저장 순서와 무관). 같은 시각이면 반 이름 가나다.
  rows.sort(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) || groupNameCollator.compare(a.groupName, b.groupName),
  );

  return {
    ok: true,
    data: {
      dateLabel: formatDateLabel(date, dayOfWeekOf(date)),
      rows: rows.map(({ startTime, endTime, textbook, progress }) => ({
        startTime,
        endTime,
        textbook,
        progress,
      })),
    },
  };
}

// 월간 — export 대상 기록을 날짜별로 묶어 날짜 오름차순으로 (기록 없는 날짜는 만들지 않는다)
export function groupTeacherLogsByDate(entries: readonly TeacherLogEntry[]) {
  const byDate = new Map<string, TeacherLogEntry[]>();
  for (const entry of entries) {
    byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
}
