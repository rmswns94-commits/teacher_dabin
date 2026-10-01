// Dashboard QUICK CLASS CHECK (출결 초고속 체크 / 숙제 검사) — 순수 helper.
//
// 저장소는 새로 만들지 않는다. 둘 다 Daily Log의 학생 기록(student_lesson_logs)이 유일한 source다:
//   출결      row.attendance (NOT NULL enum — "미확인" = 오늘 canonical 일지에 그 학생 row가 없음)
//   숙제 검사  row.homework_status (completed/partial/missing, null = 아직 검사 안 함)
// 따라서 Daily Log 폼의 학생 평가(숙제 완료/일부/미제출)와 같은 값을 보고/쓴다 — 두 번째 source of truth 없음.
//
// 검사 대상 숙제 = 브리핑 "지난 숙제"와 같은 canonical source(getGroupsBriefingData.lastLog: 같은 그룹의
// class-end lock 적용 직전 Finalized 일지)이며, 학생별 적용 여부는 growth-awards와 같은 규칙:
//   공통(assigned null)  → 그 일지에 기록이 있던 학생(historical audience, 현재 멤버십으로 재구성하지 않는다)
//   개인/다중(학생별 row) → assigned_student_id 일치
//
// 숫자의 의미는 "검사를 마친 학생 수"다 (결과가 아니라 확인 완료 — 결석/미제출도 확인됨).

import { attendanceLabels } from "@/lib/attendance";
import { homeworkStatusLabels } from "@/lib/elementary";
import { homeworkAppliesToStudent } from "@/lib/growth-awards";
import { formatHomeworkDisplay, homeworkAudienceLabel } from "@/lib/homework-assignments";
import type { AttendanceStatus, DailyLogStatus, HomeworkStatus } from "@/lib/supabase/types";
import { linkedContextLabel } from "@/lib/textbooks";

export { attendanceLabels, homeworkStatusLabels };

export const HOMEWORK_STATUS_ORDER: readonly HomeworkStatus[] = ["completed", "partial", "missing"];

export type QuickCheckHomeworkItem = {
  id: string;
  label: string; // 기존 formatter(formatHomeworkDisplay) 그대로 — "공통 · 교재 - 내용"
  audience: "common" | "individual";
  dueDate: string;
};

export type QuickCheckStudent = {
  id: string;
  name: string;
  attendance: AttendanceStatus | null; // null = 오늘 일지에 row 없음(미확인)
  attendanceReason: string;
  homeworkStatus: HomeworkStatus | null; // null = 미검사
  homeworkItems: QuickCheckHomeworkItem[]; // 이 학생에게 적용되는 지난 숙제 (없으면 검사 대상 아님)
};

export type QuickCheckModel = {
  groupId: string;
  groupName: string;
  classDate: string; // canonical lesson identity (user + group + class_date)
  timeLabel: string;
  logId: string | null;
  logStatus: DailyLogStatus | null;
  // 자동 임시저장(daily_log_drafts)이 있으면 폼 state가 아직 저장되지 않은 것 — 대시보드에서 쓰지 않는다 (read-only 안내)
  hasAutosaveDraft: boolean;
  formHref: string; // 같은 identity의 수업일지 (있으면 edit, 없으면 new)
  previousLessonDate: string | null;
  students: QuickCheckStudent[];
};

export type QuickCheckProgress = { checked: number; total: number; complete: boolean };

export type QuickCheckLessonRow = {
  student_id: string;
  attendance: AttendanceStatus;
  attendance_reason?: string | null;
  homework_status: HomeworkStatus | null;
};

export type QuickCheckHomeworkSource = {
  id: string;
  content: string;
  due_date: string;
  textbook: string | null;
  school: string | null;
  assigned_student_id: string | null;
  assignedStudentName: string | null;
};

export function buildQuickCheckStudents(input: {
  members: readonly { id: string; name: string }[];
  lastLog: { rows: readonly { student_id: string }[]; homeworkAssignments: readonly QuickCheckHomeworkSource[] } | null;
  todayRows: readonly QuickCheckLessonRow[];
}): QuickCheckStudent[] {
  const rowByStudent = new Map(input.todayRows.map((row) => [row.student_id, row]));
  // 공통 숙제의 historical audience — 그 일지에 기록이 있던 학생 (growth-awards의 attendeeStudentIds와 같은 규칙)
  const attendeeIds = (input.lastLog?.rows ?? []).map((row) => row.student_id);
  const assignments = input.lastLog?.homeworkAssignments ?? [];
  // 같은 학생이 멤버십 row 중복으로 두 번 오더라도 한 번만 (identity = student id)
  const seen = new Set<string>();
  const members = input.members.filter((member) => (seen.has(member.id) ? false : (seen.add(member.id), true)));

  return members.map((member) => {
    const row = rowByStudent.get(member.id);
    const homeworkItems = assignments
      .filter((item) =>
        homeworkAppliesToStudent(
          { assignedStudentId: item.assigned_student_id, attendeeStudentIds: attendeeIds },
          member.id,
        ),
      )
      .map((item) => ({
        id: item.id,
        label: formatHomeworkDisplay({
          audienceLabel: homeworkAudienceLabel(item.assignedStudentName),
          contextLabel: linkedContextLabel(item),
          content: item.content,
        }),
        audience: item.assigned_student_id ? ("individual" as const) : ("common" as const),
        dueDate: item.due_date,
      }));
    return {
      id: member.id,
      name: member.name,
      attendance: row?.attendance ?? null,
      attendanceReason: row?.attendance_reason ?? "",
      homeworkStatus: row?.homework_status ?? null,
      homeworkItems,
    };
  });
}

export function buildQuickCheckModel(input: {
  groupId: string;
  groupName: string;
  classDate: string;
  timeLabel: string;
  log: { id: string; status: DailyLogStatus } | null;
  members: readonly { id: string; name: string }[];
  lastLog: {
    class_date: string;
    rows: readonly { student_id: string }[];
    homeworkAssignments: readonly QuickCheckHomeworkSource[];
  } | null;
  todayRows: readonly QuickCheckLessonRow[];
  hasAutosaveDraft: boolean;
  formHref: string;
}): QuickCheckModel {
  return {
    groupId: input.groupId,
    groupName: input.groupName,
    classDate: input.classDate,
    timeLabel: input.timeLabel,
    logId: input.log?.id ?? null,
    logStatus: input.log?.status ?? null,
    hasAutosaveDraft: input.hasAutosaveDraft,
    formHref: input.formHref,
    previousLessonDate: input.lastLog?.class_date ?? null,
    students: buildQuickCheckStudents({ members: input.members, lastLog: input.lastLog, todayRows: input.todayRows }),
  };
}

// ---- 진행 숫자 ("확인을 마친 학생 수") ----

// 출결: 현재 roster 전원이 분모, 오늘 일지에 row가 있는(상태가 정해진) 학생이 분자 — 결석도 "확인됨"
export function attendanceProgress(students: readonly QuickCheckStudent[]): QuickCheckProgress {
  const total = students.length;
  const checked = students.filter((student) => student.attendance !== null).length;
  return { checked, total, complete: total > 0 && checked === total };
}

// 숙제 검사 대상: 적용되는 지난 숙제가 1개 이상이고 오늘 결석이 아닌 학생 (결석은 saveDailyLog 규칙상 homework_status를 남기지 않는다)
export function isHomeworkCheckTarget(student: QuickCheckStudent) {
  return student.homeworkItems.length > 0 && student.attendance !== "absent";
}

// 검사를 저장할 수 있는 상태 — 오늘 출결 row가 있어야 한다 (row 없이 숙제만 쓰면 출결이 기본값 present로 생겨버린다)
export function isHomeworkCheckable(student: QuickCheckStudent) {
  return isHomeworkCheckTarget(student) && student.attendance !== null;
}

export function homeworkProgress(students: readonly QuickCheckStudent[]): QuickCheckProgress {
  const targets = students.filter(isHomeworkCheckTarget);
  const checked = targets.filter((student) => student.homeworkStatus !== null).length;
  return { checked, total: targets.length, complete: targets.length > 0 && checked === targets.length };
}

// 숙제 결과 요약 (secondary) — "완료 5 · 일부 1 · 미제출 0" 중 0이 아닌 것만
export function homeworkResultSummary(students: readonly QuickCheckStudent[]): string {
  const targets = students.filter(isHomeworkCheckTarget);
  const count = (status: HomeworkStatus) => targets.filter((student) => student.homeworkStatus === status).length;
  return HOMEWORK_STATUS_ORDER.map((status) => (count(status) > 0 ? `${homeworkStatusLabels[status]} ${count(status)}` : ""))
    .filter(Boolean)
    .join(" · ");
}

// [전체 출석] 대상 — 아직 상태가 없는(row 없는) 학생만. 지각/조퇴/결석/출석으로 이미 정한 학생은 절대 건드리지 않는다.
export function wholeAttendanceTargets(students: readonly QuickCheckStudent[]): string[] {
  return students.filter((student) => student.attendance === null).map((student) => student.id);
}

export function attendanceBreakdown(students: readonly QuickCheckStudent[]): string {
  const count = (status: AttendanceStatus) => students.filter((student) => student.attendance === status).length;
  const parts = (["present", "late", "early_leave", "absent"] as const)
    .map((status) => (count(status) > 0 ? `${attendanceLabels[status]} ${count(status)}` : ""))
    .filter(Boolean);
  const unchecked = students.filter((student) => student.attendance === null).length;
  if (unchecked > 0) {
    parts.push(`미확인 ${unchecked}`);
  }
  return parts.join(" · ");
}

// ---- Quick Action 라벨 ----
export function attendanceQuickLabel(progress: QuickCheckProgress) {
  return `${progress.complete ? "✓ " : ""}출결 ${progress.checked}/${progress.total}`;
}

// "숙제 확인"(검사 완료 수) — "숙제 완료"가 아니다. 대상이 없으면 숫자를 강조하지 않는다.
export function homeworkQuickLabel(progress: QuickCheckProgress) {
  if (progress.total === 0) {
    return "숙제 확인";
  }
  return `${progress.complete ? "✓ " : ""}숙제 확인 ${progress.checked}/${progress.total}`;
}

// ---- 어떤 occurrence에서 수정할 수 있는가 ----
// actual current(진행 중) → 가능. 방금 끝난 수업(자동 focus인 wrap-up, 미완료) → 가능.
// 미래 수업 탐색 / 더 지난 수업 탐색 / Finalized → 불가 (실수로 다른 수업 데이터를 바꾸지 않게).
export type QuickCheckLock =
  | { editable: true }
  | { editable: false; reason: "future" | "ended" | "finalized" };

export function resolveQuickCheckLock(input: {
  startEpoch: number;
  endEpoch: number;
  now: number;
  finalized: boolean;
  // wrap-up(종료 후) 수정 허용 여부 — 카드의 자동 focus(가장 최근 종료 수업)일 때만 true
  wrapUpAllowed: boolean;
}): QuickCheckLock {
  if (input.finalized) {
    return { editable: false, reason: "finalized" };
  }
  if (input.now < input.startEpoch) {
    return { editable: false, reason: "future" };
  }
  if (input.now < input.endEpoch) {
    return { editable: true };
  }
  return input.wrapUpAllowed ? { editable: true } : { editable: false, reason: "ended" };
}

export const quickCheckLockText: Record<Exclude<QuickCheckLock, { editable: true }>["reason"], string> = {
  future: "수업 시작 후 확인할 수 있어요",
  ended: "지난 수업은 수업일지에서 확인해주세요",
  finalized: "완료된 일지는 수업일지에서 수정해요",
};
