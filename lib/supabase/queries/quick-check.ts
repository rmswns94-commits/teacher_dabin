import { normalizeAttendanceReason } from "@/lib/attendance";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { AttendanceStatus, DailyLogStatus, HomeworkStatus } from "@/lib/supabase/types";

// Dashboard QUICK CLASS CHECK 저장 — Daily Log 저장(saveDailyLog)과 같은 canonical 테이블/identity/충돌 키를 쓴다.
// - 일지 identity: user + group + class_date 하나 (saveDailyLog의 중복 검사와 같은 규칙, DB unique index가 race를 막는다).
//   일지 row가 없으면 최소 draft header만 만든다 — 폼의 [임시 저장]이 만드는 row와 같은 status('draft').
// - 학생 기록: student_lesson_logs upsert(onConflict daily_log_id,student_id) — 여기서 보내는 컬럼만 바뀌고
//   나머지(평가/메모/학부모 전달 등)는 그대로 남는다 (PostgREST upsert는 payload 컬럼만 UPDATE).
// - 출결 사유는 폼/서버 저장과 같은 normalizeAttendanceReason 규칙 (출석이면 null).
// - 자동 임시저장(daily_log_drafts)이 있으면 쓰지 않는다: 폼이 그 스냅샷을 복원하므로 두 source가 어긋나지 않게.
// - Finalized(completed) 일지는 대시보드에서 바꾸지 않는다 (수업일지 수정 화면이 canonical).
// - 숙제 검사(homework_status)는 이미 row가 있는 학생만 UPDATE — row 없이 쓰면 attendance가 DB 기본값(present)으로
//   생겨 "자동 출석"이 되므로 거부한다. 결석 학생도 saveDailyLog 규칙(homework_status null)대로 거부.

const UNIQUE_VIOLATION = "23505";

export type QuickCheckWriteError = {
  error: string;
  code: "auth" | "not_found" | "finalized" | "draft_blocked" | "attendance_required" | "absent" | "write";
};

type LogIdentity = { id: string; status: DailyLogStatus };

function isWriteError<T>(value: T | QuickCheckWriteError): value is QuickCheckWriteError {
  return typeof value === "object" && value !== null && "error" in value && "code" in value;
}

async function findLogByIdentity(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  userId: string,
  groupId: string,
  classDate: string,
): Promise<LogIdentity | null | QuickCheckWriteError> {
  const { data, error } = await supabase
    .from("daily_logs")
    .select("id, status")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .eq("class_date", classDate)
    .maybeSingle();
  if (error) {
    console.error("quick-check findLogByIdentity error", { code: error.code, message: error.message });
    return { error: "수업 일지를 확인하지 못했어요. 다시 시도해주세요.", code: "write" };
  }
  return (data ?? null) as LogIdentity | null;
}

// 자동 임시저장 존재 여부 — 새 작성(daily_log_id null + group/date) 또는 기존 일지(daily_log_id) 둘 다
async function autosaveDraftExists(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  userId: string,
  groupId: string,
  classDate: string,
  logId: string | null,
) {
  const condition = logId
    ? `daily_log_id.eq.${logId},and(daily_log_id.is.null,group_id.eq.${groupId},class_date.eq.${classDate})`
    : `and(daily_log_id.is.null,group_id.eq.${groupId},class_date.eq.${classDate})`;
  const { data, error } = await supabase
    .from("daily_log_drafts")
    .select("id")
    .eq("user_id", userId)
    .or(condition)
    .limit(1);
  if (error) {
    console.error("quick-check autosaveDraftExists error", { code: error.code, message: error.message });
    return true; // 판단 불가면 안전하게 "있음" (대시보드에서 쓰지 않는다)
  }
  return (data ?? []).length > 0;
}

const DRAFT_BLOCKED: QuickCheckWriteError = {
  error: "작성 중인 임시저장이 있어요. 수업일지에서 이어서 확인해주세요.",
  code: "draft_blocked",
};
const FINALIZED: QuickCheckWriteError = {
  error: "완료된 수업 일지예요. 수업일지 수정 화면에서 바꿔주세요.",
  code: "finalized",
};

// canonical identity의 일지 row — 없으면 최소 draft header로 만든다 (다른 컬럼은 폼이 비워 두는 것과 같은 null)
async function ensureQuickCheckLog(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  userId: string,
  groupId: string,
  classDate: string,
): Promise<LogIdentity | QuickCheckWriteError> {
  const found = await findLogByIdentity(supabase, userId, groupId, classDate);
  if (found) {
    return found;
  }

  const { data: group } = await supabase
    .from("class_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!group) {
    return { error: "수업 그룹을 찾을 수 없어요.", code: "not_found" };
  }

  const { data: created, error: insertError } = await supabase
    .from("daily_logs")
    .insert({ user_id: userId, group_id: groupId, class_date: classDate, status: "draft" })
    .select("id, status")
    .single();
  if (insertError || !created) {
    if (insertError?.code === UNIQUE_VIOLATION) {
      // 동시에 폼이 만든 경우 — 그 row를 쓴다
      const again = await findLogByIdentity(supabase, userId, groupId, classDate);
      if (again && !isWriteError(again)) {
        return again;
      }
    }
    console.error("quick-check ensureQuickCheckLog insert error", {
      code: insertError?.code,
      message: insertError?.message,
    });
    return { error: "수업 일지를 만들지 못했어요. 다시 시도해주세요.", code: "write" };
  }
  return created as LogIdentity;
}

async function ownedStudentIds(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  userId: string,
  studentIds: string[],
) {
  const { data, error } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .in("id", studentIds);
  if (error) {
    return null;
  }
  return new Set((data ?? []).map((row) => row.id as string));
}

export type QuickAttendanceEntry = {
  studentId: string;
  attendance: AttendanceStatus;
  attendanceReason?: string | null;
};

export type QuickAttendanceResult = {
  logId: string;
  logStatus: DailyLogStatus;
  rows: { studentId: string; attendance: AttendanceStatus; attendanceReason: string }[];
};

export async function saveQuickAttendance(input: {
  groupId: string;
  classDate: string;
  entries: QuickAttendanceEntry[];
}): Promise<QuickAttendanceResult | QuickCheckWriteError> {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();
  if (!supabase || !user) {
    return { error: "로그인이 필요합니다.", code: "auth" };
  }

  const log = await ensureQuickCheckLog(supabase, user.id, input.groupId, input.classDate);
  if (isWriteError(log)) {
    return log;
  }
  if (log.status === "completed") {
    return FINALIZED;
  }
  if (await autosaveDraftExists(supabase, user.id, input.groupId, input.classDate, log.id)) {
    return DRAFT_BLOCKED;
  }

  const ids = [...new Set(input.entries.map((entry) => entry.studentId))];
  const owned = await ownedStudentIds(supabase, user.id, ids);
  if (!owned || !ids.every((id) => owned.has(id))) {
    return { error: "학생 정보를 확인하지 못했어요. 다시 시도해주세요.", code: "not_found" };
  }

  const payload = input.entries.map((entry) => ({
    user_id: user.id,
    daily_log_id: log.id,
    student_id: entry.studentId,
    attendance: entry.attendance,
    attendance_reason: normalizeAttendanceReason(entry.attendance, entry.attendanceReason ?? ""),
  }));

  const { data, error } = await supabase
    .from("student_lesson_logs")
    .upsert(payload, { onConflict: "daily_log_id,student_id" })
    .select("student_id, attendance, attendance_reason");
  if (error) {
    console.error("quick-check saveQuickAttendance upsert error", { code: error.code, message: error.message });
    return { error: "출결을 저장하지 못했어요. 다시 시도해주세요.", code: "write" };
  }

  return {
    logId: log.id,
    logStatus: log.status,
    rows: ((data ?? []) as { student_id: string; attendance: AttendanceStatus; attendance_reason: string | null }[]).map(
      (row) => ({ studentId: row.student_id, attendance: row.attendance, attendanceReason: row.attendance_reason ?? "" }),
    ),
  };
}

export type QuickHomeworkEntry = { studentId: string; homeworkStatus: HomeworkStatus | null };

export async function saveQuickHomeworkStatus(input: {
  groupId: string;
  classDate: string;
  entries: QuickHomeworkEntry[];
}): Promise<{ logId: string } | QuickCheckWriteError> {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();
  if (!supabase || !user) {
    return { error: "로그인이 필요합니다.", code: "auth" };
  }

  const log = await findLogByIdentity(supabase, user.id, input.groupId, input.classDate);
  if (log && isWriteError(log)) {
    return log;
  }
  if (!log) {
    return { error: "출결을 먼저 확인해주세요.", code: "attendance_required" };
  }
  if (log.status === "completed") {
    return FINALIZED;
  }
  if (await autosaveDraftExists(supabase, user.id, input.groupId, input.classDate, log.id)) {
    return DRAFT_BLOCKED;
  }

  const ids = [...new Set(input.entries.map((entry) => entry.studentId))];
  const { data: existing, error: readError } = await supabase
    .from("student_lesson_logs")
    .select("student_id, attendance")
    .eq("user_id", user.id)
    .eq("daily_log_id", log.id)
    .in("student_id", ids);
  if (readError) {
    console.error("quick-check saveQuickHomeworkStatus read error", { code: readError.code, message: readError.message });
    return { error: "학생 기록을 확인하지 못했어요. 다시 시도해주세요.", code: "write" };
  }
  const attendanceByStudent = new Map(
    ((existing ?? []) as { student_id: string; attendance: AttendanceStatus }[]).map((row) => [row.student_id, row.attendance]),
  );
  for (const id of ids) {
    const attendance = attendanceByStudent.get(id);
    if (!attendance) {
      return { error: "출결을 먼저 확인해주세요.", code: "attendance_required" };
    }
    if (attendance === "absent") {
      return { error: "결석한 학생은 숙제 검사를 남기지 않아요.", code: "absent" };
    }
  }

  // 상태값별로 묶어 UPDATE (최대 4쿼리) — 학생별 반복 쿼리 없음
  const byStatus = new Map<HomeworkStatus | null, string[]>();
  for (const entry of input.entries) {
    byStatus.set(entry.homeworkStatus, [...(byStatus.get(entry.homeworkStatus) ?? []), entry.studentId]);
  }
  for (const [status, studentIds] of byStatus) {
    const { error } = await supabase
      .from("student_lesson_logs")
      .update({ homework_status: status })
      .eq("user_id", user.id)
      .eq("daily_log_id", log.id)
      .in("student_id", studentIds);
    if (error) {
      console.error("quick-check saveQuickHomeworkStatus update error", { code: error.code, message: error.message });
      return { error: "숙제 검사를 저장하지 못했어요. 다시 시도해주세요.", code: "write" };
    }
  }

  return { logId: log.id };
}
