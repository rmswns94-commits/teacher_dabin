import { formatKoreanDateFull } from "@/lib/dates";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type {
  AttendanceStatus,
  ClassGroupRecord,
  DailyLogRecord,
  DailyLogStatus,
  MakeupLessonRecord,
  StudentLessonLogRecord,
  StudentRecord,
} from "@/lib/supabase/types";
import type { DailyLogFormInput } from "@/lib/validation/daily-log";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

export type DailyLogListItem = DailyLogRecord & {
  group: Pick<ClassGroupRecord, "id" | "name" | "grade"> | null;
  attendanceCounts: { present: number; late: number; absent: number; total: number };
};

export async function getCurrentUserDailyLogs(filters?: {
  groupId?: string;
  date?: string;
  status?: DailyLogStatus;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as DailyLogListItem[];
  }

  let query = supabase
    .from("daily_logs")
    .select("*, class_groups(id, name, grade), student_lesson_logs(attendance)")
    .eq("user_id", user.id)
    .order("class_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.groupId) {
    query = query.eq("group_id", filters.groupId);
  }

  if (filters?.date) {
    query = query.eq("class_date", filters.date);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getCurrentUserDailyLogs error", error);
    return [] as DailyLogListItem[];
  }

  return (data ?? []).map((row) => {
    const lessonLogs = (row.student_lesson_logs ?? []) as { attendance: AttendanceStatus }[];
    const counts = { present: 0, late: 0, absent: 0, total: lessonLogs.length };

    for (const log of lessonLogs) {
      counts[log.attendance] += 1;
    }

    return {
      ...(row as unknown as DailyLogRecord),
      group: pickOne<Pick<ClassGroupRecord, "id" | "name" | "grade">>(row.class_groups),
      attendanceCounts: counts,
    };
  });
}

// 캘린더 한 달치 마커/반 목록용 경량 데이터. 학생별 기록은 포함하지 않는다.
export type MonthlyLogMarker = {
  id: string;
  class_date: string;
  group_id: string;
  status: DailyLogStatus;
  title: string | null;
  default_progress: string | null;
  created_at: string;
  studentCount: number; // 그날 명단에 오른 학생 수 (embed count — 추가 쿼리 없음)
  group: Pick<ClassGroupRecord, "id" | "name" | "icon"> | null;
};

export async function getMonthlyLogMarkers(
  monthStart: string,
  monthEnd: string,
  filters?: { groupId?: string; status?: DailyLogStatus },
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as MonthlyLogMarker[];
  }

  let query = supabase
    .from("daily_logs")
    .select(
      "id, class_date, group_id, status, title, default_progress, created_at, student_lesson_logs(count), class_groups(id, name, icon)",
    )
    .eq("user_id", user.id)
    .gte("class_date", monthStart)
    .lte("class_date", monthEnd)
    .order("class_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (filters?.groupId) {
    query = query.eq("group_id", filters.groupId);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getMonthlyLogMarkers error", error);
    return [] as MonthlyLogMarker[];
  }

  return (data ?? []).map((row) => {
    const countRow = pickOne<{ count: number }>(row.student_lesson_logs);

    return {
      ...(row as unknown as Omit<MonthlyLogMarker, "group" | "studentCount">),
      studentCount: countRow?.count ?? 0,
      group: pickOne<Pick<ClassGroupRecord, "id" | "name" | "icon">>(row.class_groups),
    };
  });
}

export type StudentLessonLogWithStudent = StudentLessonLogRecord & {
  student: Pick<StudentRecord, "id" | "name" | "grade"> | null;
};

export type DailyLogDetail = DailyLogRecord & {
  group: Pick<ClassGroupRecord, "id" | "name" | "grade"> | null;
  lessonLogs: StudentLessonLogWithStudent[];
  makeups: MakeupLessonRecord[];
};

export async function getDailyLogDetailForCurrentUser(dailyLogId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select("*, class_groups(id, name, grade), student_lesson_logs(*, students(id, name, grade))")
    .eq("id", dailyLogId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getDailyLogDetailForCurrentUser error", error);
    return null;
  }

  if (!data) {
    return null;
  }

  const lessonLogs = ((data.student_lesson_logs ?? []) as Record<string, unknown>[])
    .map((row) => ({
      ...(row as unknown as StudentLessonLogRecord),
      student: pickOne<Pick<StudentRecord, "id" | "name" | "grade">>(row.students),
    }))
    .sort((a, b) => (a.student?.name ?? "").localeCompare(b.student?.name ?? "", "ko"));

  let makeups: MakeupLessonRecord[] = [];
  const lessonLogIds = lessonLogs.map((log) => log.id);

  if (lessonLogIds.length > 0) {
    const { data: makeupRows, error: makeupError } = await supabase
      .from("makeup_lessons")
      .select("*")
      .eq("user_id", user.id)
      .in("student_lesson_log_id", lessonLogIds);

    if (makeupError) {
      console.error("getDailyLogDetailForCurrentUser makeup error", makeupError);
    } else {
      makeups = (makeupRows ?? []) as MakeupLessonRecord[];
    }
  }

  return {
    ...(data as unknown as DailyLogRecord),
    group: pickOne<Pick<ClassGroupRecord, "id" | "name" | "grade">>(data.class_groups),
    lessonLogs,
    makeups,
  } as DailyLogDetail;
}

// 같은 Teacher + 같은 날짜 + 같은 그룹의 수업일지는 최대 1개.
// typed error로 구분해 UI가 전용 경고 dialog를 띄울 수 있게 한다.
// 기준은 항상 "선택한 수업 날짜" — 오늘이 아닐 수 있으므로 문구에 날짜를 명시한다.
export class DuplicateDailyLogError extends Error {
  constructor(classDate?: string) {
    const dateLabel = classDate ? `${formatKoreanDateFull(classDate)}에` : "선택한 날짜에";
    super(
      `${dateLabel} 이미 등록된 수업 일지가 있어요.\n같은 반의 수업 일지는 하루에 한 번만 등록할 수 있어요.\n기존 수업 일지를 수정하거나 삭제 후 다시 등록해주세요.`,
    );
    this.name = "DuplicateDailyLogError";
  }
}

// Postgres unique violation (DB-level race 방지용 unique index가 있을 때)
const UNIQUE_VIOLATION = "23505";

// Saves the daily log header, all per-student records, and keeps makeup
// lessons consistent with the attendance data. Upserts are idempotent, so
// retrying after a partial failure never duplicates rows.
export async function saveDailyLog(input: DailyLogFormInput) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: group } = await supabase
    .from("class_groups")
    .select("id")
    .eq("id", input.groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!group) {
    throw new Error("수업 그룹을 찾을 수 없어요.");
  }

  // 중복 방지: 같은 user + 그룹 + 날짜의 일지는 draft/completed 무관 1개만.
  // 수정 저장은 자기 자신(dailyLogId)을 제외하고 검사한다 (날짜 변경 케이스 포함).
  let duplicateQuery = supabase
    .from("daily_logs")
    .select("id")
    .eq("user_id", user.id)
    .eq("group_id", input.groupId)
    .eq("class_date", input.classDate)
    .limit(1);

  if (input.dailyLogId) {
    duplicateQuery = duplicateQuery.neq("id", input.dailyLogId);
  }

  const { data: duplicateRows, error: duplicateError } = await duplicateQuery;

  if (duplicateError) {
    console.error("saveDailyLog duplicate check error", duplicateError);
    throw new Error("수업 기록을 저장하지 못했어요. 다시 시도해주세요.");
  }

  if ((duplicateRows ?? []).length > 0) {
    throw new DuplicateDailyLogError(input.classDate);
  }

  const studentIds = input.students.map((entry) => entry.studentId);
  const { data: ownedStudents, error: ownedError } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", user.id)
    .in("id", studentIds);

  if (ownedError || (ownedStudents ?? []).length !== new Set(studentIds).size) {
    throw new Error("학생 정보를 확인하지 못했어요. 다시 시도해주세요.");
  }

  const vocabTotal = input.vocabTotal ? Number(input.vocabTotal) : null;

  // lesson_content(legacy 수업 내용)는 payload에서 제외 — 기존 값을 덮어쓰지 않고 보존하며,
  // 신규 저장의 canonical field는 default_progress(공통 진도) 하나다.
  const headerPayload = {
    user_id: user.id,
    group_id: input.groupId,
    class_date: input.classDate,
    title: input.title?.trim() || null,
    default_progress: input.defaultProgress?.trim() || null,
    memo: input.memo?.trim() || null,
    homework: input.homework?.trim() || null,
    next_lesson_plan: input.nextLessonPlan?.trim() || null,
    vocab_total: vocabTotal,
    status: input.status,
  };

  let dailyLogId = input.dailyLogId ?? null;

  if (dailyLogId) {
    const { data: existing } = await supabase
      .from("daily_logs")
      .select("id")
      .eq("id", dailyLogId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      throw new Error("수업 일지를 찾을 수 없어요.");
    }

    const { error: updateError } = await supabase
      .from("daily_logs")
      .update(headerPayload)
      .eq("id", dailyLogId)
      .eq("user_id", user.id);

    if (updateError) {
      if (updateError.code === UNIQUE_VIOLATION) {
        throw new DuplicateDailyLogError(input.classDate);
      }
      console.error("saveDailyLog update error", updateError);
      throw new Error("수업 기록을 저장하지 못했어요. 다시 시도해주세요.");
    }
  } else {
    const { data: created, error: insertError } = await supabase
      .from("daily_logs")
      .insert(headerPayload)
      .select("id")
      .single();

    if (insertError || !created) {
      // pre-check를 동시에 통과한 race는 DB unique index가 막는다 → 같은 사용자 문구로
      if (insertError?.code === UNIQUE_VIOLATION) {
        throw new DuplicateDailyLogError(input.classDate);
      }
      console.error("saveDailyLog insert error", insertError);
      throw new Error("수업 기록을 저장하지 못했어요. 다시 시도해주세요.");
    }

    dailyLogId = created.id;
  }

  // 학부모 전달 상태 보존: 이미 "전달 완료"한 기록을 일지 재저장이 pending으로
  // 되돌리지 않도록, 내용이 그대로면 completed 상태를 유지한다.
  const { data: existingLessonRows } = input.dailyLogId
    ? await supabase
        .from("student_lesson_logs")
        .select("student_id, parent_note, parent_note_status, parent_note_completed_at")
        .eq("user_id", user.id)
        .eq("daily_log_id", dailyLogId)
    : { data: [] };

  const existingByStudent = new Map(
    (existingLessonRows ?? []).map((row) => [row.student_id as string, row]),
  );

  const lessonPayload = input.students.map((entry) => {
    const isAbsent = entry.attendance === "absent";
    const parentNote = entry.parentNoteNeeded ? entry.parentNote?.trim() || null : null;
    const existing = existingByStudent.get(entry.studentId);
    const keepCompleted =
      parentNote !== null &&
      existing?.parent_note_status === "completed" &&
      (existing.parent_note ?? "") === parentNote;

    return {
      user_id: user.id,
      daily_log_id: dailyLogId,
      student_id: entry.studentId,
      attendance: entry.attendance,
      progress: entry.progress?.trim() || null,
      strengths: isAbsent ? null : entry.strengths?.trim() || null,
      improvements: isAbsent ? null : entry.improvements?.trim() || null,
      memo: entry.memo?.trim() || null,
      // 초등 quick check: 결석 학생은 그날 수업 기반 평가를 남기지 않는다.
      homework_status: isAbsent ? null : entry.homeworkStatus || null,
      vocab_correct: isAbsent || !entry.vocabCorrect ? null : Number(entry.vocabCorrect),
      vocab_retest: isAbsent ? false : Boolean(entry.vocabRetest),
      focus_level: isAbsent ? null : entry.focusLevel || null,
      participation_level: isAbsent ? null : entry.participationLevel || null,
      question_level: isAbsent ? null : entry.questionLevel || null,
      kindness_level: isAbsent ? null : entry.kindnessLevel || null,
      effort_level: isAbsent ? null : entry.effortLevel || null,
      parent_note: parentNote,
      parent_note_status: parentNote === null ? null : keepCompleted ? "completed" : "pending",
      parent_note_completed_at: keepCompleted ? existing?.parent_note_completed_at ?? null : null,
    };
  });

  const { data: savedLessonLogs, error: lessonError } = await supabase
    .from("student_lesson_logs")
    .upsert(lessonPayload, { onConflict: "daily_log_id,student_id" })
    .select("id, student_id");

  if (lessonError || !savedLessonLogs) {
    console.error("saveDailyLog lesson upsert error", lessonError);
    throw new Error("학생 기록 일부를 저장하지 못했어요. 저장 버튼을 다시 눌러주세요.");
  }

  const lessonLogIdByStudent = new Map(savedLessonLogs.map((row) => [row.student_id, row.id]));

  const { data: existingMakeups, error: makeupReadError } = await supabase
    .from("makeup_lessons")
    .select("*")
    .eq("user_id", user.id)
    .in("student_lesson_log_id", savedLessonLogs.map((row) => row.id));

  if (makeupReadError) {
    console.error("saveDailyLog makeup read error", makeupReadError);
    throw new Error("보충수업 정보를 확인하지 못했어요. 저장 버튼을 다시 눌러주세요.");
  }

  const makeupByLessonLog = new Map(
    ((existingMakeups ?? []) as MakeupLessonRecord[]).map((row) => [row.student_lesson_log_id, row]),
  );

  for (const entry of input.students) {
    const lessonLogId = lessonLogIdByStudent.get(entry.studentId);

    if (!lessonLogId) {
      continue;
    }

    const existing = makeupByLessonLog.get(lessonLogId);
    const wantsMakeup = entry.attendance === "absent" && entry.needsMakeup;

    if (wantsMakeup) {
      // Completed makeups are history — never overwrite them from the log form.
      if (existing?.status === "completed") {
        continue;
      }

      const scheduledDate = entry.makeupScheduledDate || null;
      const makeupPayload = {
        user_id: user.id,
        student_id: entry.studentId,
        student_lesson_log_id: lessonLogId,
        original_class_date: input.classDate,
        missed_progress: entry.missedProgress?.trim() || input.defaultProgress?.trim() || null,
        status: (scheduledDate ? "scheduled" : "required") as MakeupLessonRecord["status"],
        scheduled_date: scheduledDate,
      };

      const { error: makeupError } = existing
        ? await supabase
            .from("makeup_lessons")
            .update(makeupPayload)
            .eq("id", existing.id)
            .eq("user_id", user.id)
        : await supabase.from("makeup_lessons").insert(makeupPayload);

      if (makeupError) {
        console.error("saveDailyLog makeup upsert error", makeupError);
        throw new Error("보충수업 정보를 저장하지 못했어요. 저장 버튼을 다시 눌러주세요.");
      }
    } else if (existing && (existing.status === "required" || existing.status === "scheduled")) {
      // Attendance went back to present/late (or makeup no longer needed):
      // keep the record for history but mark it cancelled.
      const { error: cancelError } = await supabase
        .from("makeup_lessons")
        .update({ status: "cancelled" })
        .eq("id", existing.id)
        .eq("user_id", user.id);

      if (cancelError) {
        console.error("saveDailyLog makeup cancel error", cancelError);
        throw new Error("보충수업 정보를 저장하지 못했어요. 저장 버튼을 다시 눌러주세요.");
      }
    }
  }

  // 칭찬 한표 동기화: 이 일지의 "코멘트 칭찬"만 폼 상태 그대로 교체한다 (멱등).
  // - 한 학생이 한 수업에서 칭찬을 여러 개 받을 수 있다 (row 단위 독립 record).
  // - 자동 생성 없음: 집중/참여/질문/배려/노력 등 관찰값은 Praise를 만들지 않는다.
  //   Praise는 Teacher가 [칭찬 한표]로 직접 남긴 comment가 있을 때만 저장된다.
  // - 예전 category chip 방식의 legacy 칭찬(comment null)은 건드리지 않고 보존한다.
  const praiseBaseTime = Date.now();
  const praiseRows = input.students.flatMap((entry) => {
    if (entry.attendance === "absent") {
      return [];
    }

    const comments = (entry.praiseComments ?? [])
      .map((comment) => comment.trim())
      .filter(Boolean);

    return comments.map((comment, index) => ({
      user_id: user.id,
      student_id: entry.studentId,
      daily_log_id: dailyLogId,
      category: "other" as const,
      comment,
      source: "manual_daily_log" as const,
      // batch insert는 created_at default가 전부 같은 값이라 Teacher가 적은 순서가
      // 뒤섞일 수 있어, ms 단위로 어긋난 timestamp를 명시해 입력 순서를 보존한다.
      created_at: new Date(praiseBaseTime + index).toISOString(),
    }));
  });

  const { error: praiseDeleteError } = await supabase
    .from("student_praises")
    .delete()
    .eq("user_id", user.id)
    .eq("daily_log_id", dailyLogId)
    .not("comment", "is", null);

  if (praiseDeleteError) {
    console.error("saveDailyLog praise delete error", praiseDeleteError);
    throw new Error("칭찬 기록을 저장하지 못했어요. 저장 버튼을 다시 눌러주세요.");
  }

  if (praiseRows.length > 0) {
    const { error: praiseInsertError } = await supabase.from("student_praises").insert(praiseRows);

    if (praiseInsertError) {
      console.error("saveDailyLog praise insert error", praiseInsertError);
      throw new Error("칭찬 기록을 저장하지 못했어요. 저장 버튼을 다시 눌러주세요.");
    }
  }

  // 참고: legacy manual 성장 체크(student_growth_checks)는 더 이상 저장/삭제하지 않는다.
  // 기존 데이터는 보존하되, 새 Achievement 판정에는 사용하지 않는다.

  return dailyLogId;
}

// 수업일지 안전 삭제. 실제 FK 정책 기준으로 처리한다:
// - student_lesson_logs.daily_log_id = ON DELETE CASCADE → 출결/평가는 DB가 함께 삭제
// - student_growth_checks.daily_log_id = ON DELETE CASCADE → legacy 체크도 자동 삭제
// - student_praises.daily_log_id = ON DELETE SET NULL → orphan 칭찬이 남지 않게 먼저 명시 삭제
// - makeup_lessons.student_lesson_log_id = ON DELETE SET NULL → 미처리(required/scheduled)
//   보충만 함께 삭제하고, 완료/취소된 보충 이력은 링크만 해제된 채 보존한다
// 학생/그룹/스케줄/교재/캘린더 일정은 건드리지 않는다.
export async function deleteDailyLog(dailyLogId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  // ownership 검증 — 다른 Teacher의 일지 id로는 삭제 불가 (RLS + 명시 확인)
  const { data: existing } = await supabase
    .from("daily_logs")
    .select("id, class_date")
    .eq("id", dailyLogId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    throw new Error("수업일지를 찾을 수 없어요.");
  }

  // 이 일지에 종속된 lesson log id를 batch 1쿼리로 수집 (학생별 반복 쿼리 금지)
  const { data: lessonRows, error: lessonReadError } = await supabase
    .from("student_lesson_logs")
    .select("id")
    .eq("user_id", user.id)
    .eq("daily_log_id", dailyLogId);

  if (lessonReadError) {
    console.error("deleteDailyLog lesson read error", lessonReadError);
    throw new Error("수업일지를 삭제하지 못했어요. 다시 시도해주세요.");
  }

  const lessonLogIds = (lessonRows ?? []).map((row) => row.id as string);

  // 이 일지의 결석에서 생성된 "미처리" 보충만 함께 삭제 (완료/취소 이력은 보존)
  if (lessonLogIds.length > 0) {
    const { error: makeupError } = await supabase
      .from("makeup_lessons")
      .delete()
      .eq("user_id", user.id)
      .in("student_lesson_log_id", lessonLogIds)
      .in("status", ["required", "scheduled"]);

    if (makeupError) {
      console.error("deleteDailyLog makeup error", makeupError);
      throw new Error("보충 기록을 정리하지 못했어요. 다시 시도해주세요.");
    }
  }

  // 이 일지의 칭찬 한표 삭제 (FK가 SET NULL이라 명시적으로 지워 orphan 방지)
  const { error: praiseError } = await supabase
    .from("student_praises")
    .delete()
    .eq("user_id", user.id)
    .eq("daily_log_id", dailyLogId);

  if (praiseError) {
    console.error("deleteDailyLog praise error", praiseError);
    throw new Error("칭찬 기록을 정리하지 못했어요. 다시 시도해주세요.");
  }

  const { error: deleteError } = await supabase
    .from("daily_logs")
    .delete()
    .eq("id", dailyLogId)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("deleteDailyLog error", deleteError);
    throw new Error("수업일지를 삭제하지 못했어요. 다시 시도해주세요.");
  }

  return existing.class_date as string;
}

// 일지 수정/상세 화면에서 기존 칭찬을 복원할 때 사용 (쿼리 1번).
export type DailyLogPraiseRow = { student_id: string; category: string; comment: string | null };

export async function getPraisesForDailyLog(dailyLogId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as DailyLogPraiseRow[];
  }

  const { data, error } = await supabase
    .from("student_praises")
    .select("student_id, category, comment")
    .eq("user_id", user.id)
    .eq("daily_log_id", dailyLogId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getPraisesForDailyLog error", error);
    return [] as DailyLogPraiseRow[];
  }

  return (data ?? []) as DailyLogPraiseRow[];
}

// ── 이전 수업 기록 패널 ────────────────────────────────────────────────

export type DailyLogHistorySummary = {
  id: string;
  class_date: string;
  group_id: string;
  status: DailyLogStatus;
  title: string | null;
  default_progress: string | null;
  lesson_content: string | null;
  homework: string | null;
  next_lesson_plan: string | null;
  memo: string | null;
  updated_at: string;
  studentCount: number;
};

// 같은 그룹의 이전(작성 날짜 미만) 일지를 가볍게 조회한다.
// daily_logs row의 공통 필드만 — 학생 기록/칭찬은 상세를 열 때 lazy 조회 (N+1 금지).
export async function getGroupHistoryLogs(
  groupId: string,
  beforeDate: string,
  offset = 0,
  limit = 10,
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { rows: [] as DailyLogHistorySummary[], hasMore: false };
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select(
      "id, class_date, group_id, status, title, default_progress, lesson_content, homework, next_lesson_plan, memo, updated_at, student_lesson_logs(count)",
    )
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .lt("class_date", beforeDate)
    .order("class_date", { ascending: false })
    .range(offset, offset + limit); // limit+1개 조회 — hasMore 판정용

  if (error) {
    console.error("getGroupHistoryLogs error", error);
    throw new Error("이전 수업 기록을 불러오지 못했어요.");
  }

  const rows = (data ?? []).map((row) => {
    const countRow = pickOne<{ count: number }>(row.student_lesson_logs);

    return {
      ...(row as unknown as Omit<DailyLogHistorySummary, "studentCount">),
      studentCount: countRow?.count ?? 0,
    } as DailyLogHistorySummary;
  });

  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// 이전 일지의 공통 필드만 update (학생 평가/칭찬은 기존 전체 수정 화면 재사용).
// group/date는 바꾸지 않으므로 중복 일지 가드와 충돌할 일이 없다.
export async function updateDailyLogFields(input: {
  dailyLogId: string;
  title: string;
  defaultProgress: string;
  memo: string;
  homework: string;
  nextLessonPlan: string;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요해요.");
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .update({
      title: input.title.trim() || null,
      default_progress: input.defaultProgress.trim() || null,
      memo: input.memo.trim() || null,
      homework: input.homework.trim() || null,
      next_lesson_plan: input.nextLessonPlan.trim() || null,
    })
    .eq("id", input.dailyLogId)
    .eq("user_id", user.id)
    .select(
      "id, class_date, group_id, status, title, default_progress, lesson_content, homework, next_lesson_plan, memo, updated_at",
    )
    .single();

  if (error || !data) {
    console.error("updateDailyLogFields error", error);
    throw new Error("이전 수업 기록을 저장하지 못했어요. 다시 시도해주세요.");
  }

  return data as unknown as Omit<DailyLogHistorySummary, "studentCount">;
}
