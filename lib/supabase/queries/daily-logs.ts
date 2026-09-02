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
  group: Pick<ClassGroupRecord, "id" | "name"> | null;
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
    .select("id, class_date, group_id, status, title, default_progress, created_at, class_groups(id, name)")
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

  return (data ?? []).map((row) => ({
    ...(row as unknown as Omit<MonthlyLogMarker, "group">),
    group: pickOne<Pick<ClassGroupRecord, "id" | "name">>(row.class_groups),
  }));
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

  const headerPayload = {
    user_id: user.id,
    group_id: input.groupId,
    class_date: input.classDate,
    title: input.title?.trim() || null,
    lesson_content: input.lessonContent?.trim() || null,
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

  // 칭찬 동기화: 이 일지에 대한 칭찬을 폼 상태 그대로 교체한다 (멱등).
  // 학생별 개별 쿼리 없이 delete 1번 + insert 1번.
  const praiseRows = input.students.flatMap((entry) =>
    (entry.praises ?? []).map((category) => ({
      user_id: user.id,
      student_id: entry.studentId,
      daily_log_id: dailyLogId,
      category,
    })),
  );

  const { error: praiseDeleteError } = await supabase
    .from("student_praises")
    .delete()
    .eq("user_id", user.id)
    .eq("daily_log_id", dailyLogId);

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

  return dailyLogId;
}

// 일지 수정 화면에서 기존 칭찬을 폼 상태로 복원할 때 사용 (쿼리 1번).
export async function getPraisesForDailyLog(dailyLogId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as { student_id: string; category: string }[];
  }

  const { data, error } = await supabase
    .from("student_praises")
    .select("student_id, category")
    .eq("user_id", user.id)
    .eq("daily_log_id", dailyLogId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getPraisesForDailyLog error", error);
    return [] as { student_id: string; category: string }[];
  }

  return (data ?? []) as { student_id: string; category: string }[];
}
