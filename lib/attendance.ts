import { compareKoreanName } from "@/lib/korean-sort";
import { formatScheduleBlock, groupSchedulesByTime } from "@/lib/schedule";
import type { AttendanceStatus } from "@/lib/supabase/types";

// 출결 표시의 단일 소스 — 화면 라벨과 월간 출석부 Excel 기호가 같은 정의를 쓴다.
// 순서는 화면 표시 순서(출석 → 지각 → 조퇴 → 결석)이기도 하다.
export const ATTENDANCE_ORDER: AttendanceStatus[] = ["present", "late", "early_leave", "absent"];

export const attendanceLabels: Record<AttendanceStatus, string> = {
  present: "출석",
  late: "지각",
  early_leave: "조퇴",
  absent: "결석",
};

// 월간 출석부 Excel 기호 — 출석부.xlsx template 범례("출석 : O  지각 : △  조퇴 : Φ  결석 : X")와
// 동일해야 한다. template이 기호의 단일 소스.
export const attendanceSymbols: Record<AttendanceStatus, string> = {
  present: "O",
  late: "△",
  early_leave: "Φ",
  absent: "X",
};

export type AttendanceCounts = Record<AttendanceStatus, number>;

export function emptyAttendanceCounts(): AttendanceCounts {
  return { present: 0, late: 0, early_leave: 0, absent: 0 };
}

// ── 월간 출결(출결 현황 페이지 + 출석부 Excel)의 공용 조립 로직 ──────────────
// Daily Log(작성 완료)의 학생 평가 attendance가 유일한 소스 — 화면과 Excel이
// 같은 entry 배열을 서로 다른 모양으로 조립만 한다 (별도 저장/복제 없음).

export type AttendanceEntry = {
  classDate: string; // lesson_date(class_date) 기준 — created_at 사용 금지
  groupId: string;
  groupName: string;
  groupIcon: string | null;
  studentId: string;
  studentName: string;
  studentGrade: string;
  attendance: AttendanceStatus;
};

export type GroupTimeSlot = {
  group_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export function countAttendanceByDate(entries: AttendanceEntry[]) {
  const byDate = new Map<string, AttendanceCounts>();

  for (const entry of entries) {
    const counts = byDate.get(entry.classDate) ?? emptyAttendanceCounts();
    counts[entry.attendance] += 1;
    byDate.set(entry.classDate, counts);
  }

  return byDate;
}

export function slotsByGroupOf(slots: GroupTimeSlot[]) {
  const map = new Map<string, GroupTimeSlot[]>();
  for (const slot of slots) {
    map.set(slot.group_id, [...(map.get(slot.group_id) ?? []), slot]);
  }
  return map;
}

// 그룹의 시간표 라벨 ("월 · 수 15:00 ~ 16:30", 블록 여러 개면 " / "로 연결).
// 시간표가 없으면 빈 문자열 — 임의 추측 금지.
export function groupTimeLabelOf(slots: GroupTimeSlot[] | undefined) {
  if (!slots || slots.length === 0) {
    return "";
  }
  return groupSchedulesByTime(slots).map(formatScheduleBlock).join(" / ");
}

// 정렬용 대표 시작 시간. dayOfWeek를 주면 그 요일의 가장 이른 시작 시간을,
// 그 요일 시간표가 없으면(보강 등 다른 요일 수업) 전체에서 가장 이른 시간을 쓴다.
// 시간표 자체가 없으면 "99:99" → 맨 뒤로.
export function groupStartSortKey(slots: GroupTimeSlot[] | undefined, dayOfWeek?: number) {
  if (!slots || slots.length === 0) {
    return "99:99";
  }

  const pool =
    dayOfWeek === undefined
      ? slots
      : slots.filter((slot) => slot.day_of_week === dayOfWeek);
  const source = pool.length > 0 ? pool : slots;

  return source.reduce(
    (min, slot) => (slot.start_time < min ? slot.start_time : min),
    "99:99",
  ).slice(0, 5);
}

// 출석부 Excel의 행: Student × Group (같은 이름도 다른 반이면 별도 행 — merge 금지)
export type MonthlyAttendanceRow = {
  groupId: string;
  groupName: string;
  timeLabel: string;
  studentId: string;
  studentName: string;
  studentGrade: string;
  // 일(day of month) → 출결. 기록 없는 날은 키 자체가 없어 공란이 된다.
  marks: Map<number, AttendanceStatus>;
};

export function buildMonthlyAttendanceRows(
  entries: AttendanceEntry[],
  slotsByGroup: Map<string, GroupTimeSlot[]>,
): MonthlyAttendanceRow[] {
  const rows = new Map<string, MonthlyAttendanceRow>();

  for (const entry of entries) {
    const key = `${entry.groupId}:${entry.studentId}`;
    const row =
      rows.get(key) ??
      ({
        groupId: entry.groupId,
        groupName: entry.groupName,
        timeLabel: groupTimeLabelOf(slotsByGroup.get(entry.groupId)),
        studentId: entry.studentId,
        studentName: entry.studentName,
        studentGrade: entry.studentGrade,
        marks: new Map<number, AttendanceStatus>(),
      } satisfies MonthlyAttendanceRow);

    row.marks.set(Number(entry.classDate.slice(8)), entry.attendance);
    rows.set(key, row);
  }

  // 반: 수업 시작 시간 ASC(모르면 뒤) → 반 이름 → 학생 가나다 → id(동명이인 안정 정렬)
  return [...rows.values()].sort((a, b) => {
    const timeA = groupStartSortKey(slotsByGroup.get(a.groupId));
    const timeB = groupStartSortKey(slotsByGroup.get(b.groupId));
    return (
      timeA.localeCompare(timeB) ||
      compareKoreanName(a.groupName, b.groupName) ||
      compareKoreanName(a.studentName, b.studentName) ||
      a.studentId.localeCompare(b.studentId)
    );
  });
}
