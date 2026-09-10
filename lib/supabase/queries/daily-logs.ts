import { formatKoreanDateFull } from "@/lib/dates";
import {
  dailyLogTaskTodoId,
  isDailyLogTaskTodoId,
  meaningfulDailyLogTasks,
  resolveDailyLogTaskDueDate,
} from "@/lib/daily-log-tasks";
import { buildHomeworkMirror } from "@/lib/homework-assignments";
import { sortByKoreanName } from "@/lib/korean-sort";
import { dedupeVocabWords } from "@/lib/vocab";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type {
  PreparationItem,
  ClassGroupRecord,
  DailyLogHomeworkAssignmentRecord,
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
  student: Pick<StudentRecord, "id" | "name" | "grade" | "school"> | null;
};

// 숙제 row + 대상 학생 이름(relation embed). 표시는 이름, identity는 assigned_student_id다.
export type HomeworkAssignmentWithAudience = DailyLogHomeworkAssignmentRecord & {
  assignedStudentName: string | null;
};

export type DailyLogDetail = DailyLogRecord & {
  // textbook: 수업 제목 옆 "교재 LIST" 보조 버튼용 (줄바꿈 구분 여러 권 — 그룹 상세와 동일 포맷)
  // is_exam_period: 시험 기간 context용 (edit 화면의 새 항목 기본 context 결정 —
  // 학교 목록은 그룹 컬럼이 아니라 그룹 소속 학생들의 students.school에서 유도한다)
  group: Pick<ClassGroupRecord, "id" | "name" | "grade" | "textbook" | "is_exam_period"> | null;
  lessonLogs: StudentLessonLogWithStudent[];
  makeups: MakeupLessonRecord[];
  // 오늘 숙제(구조화) — 완료일 ASC. migration 미적용/조회 실패 시 [] (화면은 항상 뜬다).
  // assignedStudentName은 relation embed로 함께 받는다 (숙제마다 학생 쿼리 금지 — N+1 없음).
  homeworkAssignments: HomeworkAssignmentWithAudience[];
  // 이 일지의 "해야 할 일" linked Todo들 (공용 preparation 항목 — 복제 아님, 같은 row 상태).
  // 삭제(dismissed)된 항목은 제외. 조회 실패 시 [] (화면은 항상 뜬다)
  linkedTasks: { id: string; text: string; textbook: string | null; school: string | null; dueDate: string | null; completed: boolean }[];
};

// options.withMakeups=false: 보충 정보가 필요 없는 소비처(이전 기록 패널의 학생 기록 lazy 조회)가
// 버려질 makeup 쿼리 1번을 아낄 수 있게 한다. 기본값은 기존과 동일하게 포함.
export async function getDailyLogDetailForCurrentUser(
  dailyLogId: string,
  options?: { withMakeups?: boolean },
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select("*, class_groups(id, name, grade, textbook, is_exam_period), student_lesson_logs(*, students(id, name, grade, school))")
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

  // 상세/수정/캘린더 인라인 상세 공통: DB 저장 순서와 무관하게 이름 가나다순으로 표시
  // (공용 collator — 작성 화면과 동일한 정렬 기준, 동명이인은 학생 id로 안정 정렬)
  const lessonLogs = sortByKoreanName(
    ((data.student_lesson_logs ?? []) as Record<string, unknown>[]).map((row) => ({
      ...(row as unknown as StudentLessonLogRecord),
      student: pickOne<Pick<StudentRecord, "id" | "name" | "grade" | "school">>(row.students),
    })),
    (log) => log.student?.name ?? "",
    (log) => log.student?.id ?? log.id,
  );

  let makeups: MakeupLessonRecord[] = [];
  const lessonLogIds = lessonLogs.map((log) => log.id);

  if (options?.withMakeups !== false && lessonLogIds.length > 0) {
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

  // 오늘 숙제(구조화) — 일지당 batch 1쿼리 (항목별 반복 쿼리 없음), 미적용/실패 시 [].
  // 대상 학생 이름은 같은 쿼리의 relation embed로 받는다 (숙제가 N개여도 학생 쿼리 추가 0).
  let homeworkAssignments: HomeworkAssignmentWithAudience[] = [];
  const { data: hwRows, error: hwError } = await supabase
    .from("daily_log_homework_assignments")
    .select(
      "id, user_id, daily_log_id, content, due_date, textbook, school, assigned_student_id, sort_order, created_at, updated_at, assigned_student:students(id, name)",
    )
    .eq("user_id", user.id)
    .eq("daily_log_id", dailyLogId)
    .order("due_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (hwError) {
    if (!["42P01", "PGRST205"].includes(hwError.code ?? "")) {
      console.error("getDailyLogDetailForCurrentUser homework error", {
        code: hwError.code,
        message: hwError.message,
      });
    }
  } else {
    homeworkAssignments = (hwRows ?? []).map((row) => {
      const { assigned_student: student, ...rest } = row as DailyLogHomeworkAssignmentRecord & {
        assigned_student?: { id: string; name: string } | { id: string; name: string }[] | null;
      };
      const linked = Array.isArray(student) ? student[0] : student;
      return { ...rest, assignedStudentName: linked?.name ?? null };
    });
  }

  // 해야 할 일 linked Todo들 — 그룹 preparation_items에서 이 일지 소유 항목 조회 (batch jsonb 1쿼리)
  let linkedTasks: DailyLogDetail["linkedTasks"] = [];
  const { data: prepGroup, error: prepError } = await supabase
    .from("class_groups")
    .select("preparation_items")
    .eq("id", (data as { group_id: string }).group_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (prepError) {
    console.error("getDailyLogDetailForCurrentUser task error", {
      code: prepError.code,
      message: prepError.message,
    });
  } else {
    linkedTasks = ((prepGroup?.preparation_items ?? []) as PreparationItem[])
      .filter((item) => isDailyLogTaskTodoId(item.id, dailyLogId) && !item.dismissed)
      .map((item) => ({
        id: item.id,
        text: item.text,
        textbook: item.textbook ?? null,
        school: item.school ?? null,
        dueDate: item.dueDate ?? null,
        completed: item.completed,
      }));
  }

  return {
    ...(data as unknown as DailyLogRecord),
    group: pickOne<Pick<ClassGroupRecord, "id" | "name" | "grade">>(data.class_groups),
    lessonLogs,
    makeups,
    homeworkAssignments,
    linkedTasks,
  } as DailyLogDetail;
}

// 일지 필드(다음 수업 계획/숙제) ↔ 그룹 준비 항목(To Do) 동기화.
// identity = sourceDailyLogId + source (일지당 source별 linked 항목 최대 1개 — upsert/idempotent, 재시도에도 중복 없음).
// planText/planDate가 비면 linked 항목만 제거한다 — Teacher가 직접 만든 수동 항목은 절대 건드리지 않는다.
// (preparation_items 체크리스트는 완료 이력 보존 정책이 없어, 계획 삭제 시 완료된 linked 항목도 함께 제거된다)
const LINKED_ID_PREFIX = {
  daily_log_next_plan: "nlp",
  daily_log_homework: "hw",
  daily_log_task: "task",
} as const;

// createIfMissing=false: 기존 linked 항목이 있을 때만 갱신/제거하고, 없으면 새로 만들지 않는다.
// (다음 수업 계획은 이제 "계획 데이터"이고 Todo는 "해야 할 일"이 담당 — legacy nlp 항목이
// 이미 있는 일지는 기존 동작대로 계속 갱신하되, 새 일지부터는 nlp Todo를 만들지 않는다)
async function syncLinkedPreparation(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  userId: string,
  groupId: string,
  dailyLogId: string,
  source: keyof typeof LINKED_ID_PREFIX,
  planText: string,
  planDate: string | null,
  createIfMissing = true,
  // 연결 교재 이름 스냅샷 (해야 할 일 전용) — text에는 내용만, 표시할 때 "교재명 - 내용" 합성
  textbook: string | null = null,
) {
  const { data: groupRow, error: readError } = await supabase
    .from("class_groups")
    .select("preparation_items")
    .eq("id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError || !groupRow) {
    console.error("syncLinkedPreparation read error", readError);
    return;
  }

  const items = (groupRow.preparation_items ?? []) as PreparationItem[];
  // 기존 항목은 전부 next_plan source로 저장돼 있어 source 누락 시 next_plan으로 간주한다
  const index = items.findIndex(
    (item) =>
      item.sourceDailyLogId === dailyLogId &&
      (item.source ?? "daily_log_next_plan") === source,
  );
  const existing = index >= 0 ? items[index] : null;
  let next: PreparationItem[] | null = null;

  if (planText && planDate) {
    if (!existing && !createIfMissing) {
      // 기존 항목이 없고 신규 생성이 금지된 source(예: 다음 수업 계획) → 아무것도 하지 않음
      next = null;
    } else if (
      existing?.dismissed &&
      existing.text === planText &&
      existing.dueDate === planDate &&
      (existing.textbook ?? null) === (textbook ?? null)
    ) {
      // Teacher가 삭제한 linked 항목: 계획이 그대로면 단순 재저장으로 부활시키지 않는다
      next = null;
    } else {
      // 신규/변경(삭제된 계획을 실제로 고친 경우 포함) → live 항목으로 생성/갱신
      const linked: PreparationItem = {
        id: existing ? existing.id : `${LINKED_ID_PREFIX[source]}-${dailyLogId}`,
        text: planText,
        completed: existing && !existing.dismissed ? existing.completed : false,
        completedAt: existing && !existing.dismissed ? existing.completedAt ?? null : null,
        dueDate: planDate,
        source,
        sourceDailyLogId: dailyLogId,
        ...(textbook ? { textbook } : {}),
      };
      const unchanged =
        existing &&
        !existing.dismissed &&
        existing.text === linked.text &&
        existing.dueDate === linked.dueDate &&
        (existing.textbook ?? null) === (textbook ?? null);
      if (!unchanged) {
        next = existing
          ? items.map((item, n) => (n === index ? linked : item))
          : [...items, linked];
      }
    }
  } else if (index >= 0) {
    // 계획 자체가 지워짐 → linked 항목(tombstone 포함) 제거
    next = items.filter((_, n) => n !== index);
  }

  if (next) {
    const { error: writeError } = await supabase
      .from("class_groups")
      .update({ preparation_items: next })
      .eq("id", groupId)
      .eq("user_id", userId);
    if (writeError) {
      console.error("syncLinkedPreparation write error", writeError);
    }
  }
}

// ── 해야 할 일(다중 항목) ↔ 공용 Todo 동기화 ─────────────────────────
// 항목당 Todo 최대 1개 (id = dailyLogTaskTodoId — stable task id 기반, index 아님).
// meaningful(내용 있는) 항목만 대상이고, 폼에서 사라진 항목의 Todo는 제거한다.
// 수동 Todo/다른 일지의 Todo는 id prefix가 다르므로 절대 건드리지 않는다.
// read 1회 + (변경 시) write 1회 — 항목 수만큼 반복 쿼리하지 않는다.
async function syncDailyLogTaskTodos(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  userId: string,
  groupId: string,
  dailyLogId: string,
  lessonDate: string,
  tasks: { id: string; textbook?: string | null; school?: string | null; content: string; dueDate?: string | null }[],
) {
  const { data: groupRow, error: readError } = await supabase
    .from("class_groups")
    .select("preparation_items")
    .eq("id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError || !groupRow) {
    console.error("syncDailyLogTaskTodos read error", readError);
    return;
  }

  const items = (groupRow.preparation_items ?? []) as PreparationItem[];
  const expected = meaningfulDailyLogTasks(tasks).map((task) => ({
    todoId: dailyLogTaskTodoId(dailyLogId, task.id),
    text: task.content.trim(),
    dueDate: resolveDailyLogTaskDueDate(task.dueDate || null, lessonDate),
    textbook: task.textbook?.trim() || null,
    school: task.school?.trim() || null,
  }));
  const expectedById = new Map(expected.map((task) => [task.todoId, task]));

  let changed = false;
  const next: PreparationItem[] = [];

  for (const item of items) {
    if (!isDailyLogTaskTodoId(item.id, dailyLogId)) {
      next.push(item); // 수동/다른 source/다른 일지 항목은 그대로
      continue;
    }
    const target = expectedById.get(item.id);
    if (!target) {
      changed = true; // 폼에서 삭제되었거나 내용이 비워진 항목 → Todo 제거 (tombstone 포함)
      continue;
    }
    expectedById.delete(item.id);
    const unchanged =
      item.text === target.text &&
      (item.dueDate ?? null) === target.dueDate &&
      (item.textbook ?? null) === target.textbook &&
      (item.school ?? null) === target.school;
    if (unchanged) {
      next.push(item); // dismissed tombstone도 내용이 그대로면 부활시키지 않는다
      continue;
    }
    // 실제 변경 → live 항목으로 갱신 (완료 상태는 dismissed가 아니었을 때만 보존)
    changed = true;
    next.push({
      id: item.id,
      text: target.text,
      completed: !item.dismissed ? item.completed : false,
      completedAt: !item.dismissed ? item.completedAt ?? null : null,
      dueDate: target.dueDate,
      source: "daily_log_task",
      sourceDailyLogId: dailyLogId,
      ...(target.textbook ? { textbook: target.textbook } : {}),
      ...(target.school ? { school: target.school } : {}),
    });
  }

  // 새 항목 생성 (기존에 없던 task)
  for (const target of expectedById.values()) {
    changed = true;
    next.push({
      id: target.todoId,
      text: target.text,
      completed: false,
      dueDate: target.dueDate,
      source: "daily_log_task",
      sourceDailyLogId: dailyLogId,
      ...(target.textbook ? { textbook: target.textbook } : {}),
      ...(target.school ? { school: target.school } : {}),
    });
  }

  if (changed) {
    const { error: writeError } = await supabase
      .from("class_groups")
      .update({ preparation_items: next })
      .eq("id", groupId)
      .eq("user_id", userId);
    if (writeError) {
      console.error("syncDailyLogTaskTodos write error", writeError);
    }
  }
}

// ── 오늘 숙제(구조화) ─────────────────────────────────────────────
// migration 미적용(테이블 없음) 코드: 42P01 undefined table / PGRST205 schema cache 없음
const HW_MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);
const HW_MIGRATION_MESSAGE =
  "오늘 숙제 기능의 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260909_create_daily_log_homework_assignments.sql을 실행한 뒤 다시 시도해주세요.";

// 구조화 숙제 sync — id 기반 idempotent 교체 (문자열 비교 없음):
// 기존 row 조회 → 제출된 id는 update(upsert), 새 항목은 새 uuid insert, 빠진 id는 delete.
// autosave(draft payload)에서는 절대 호출되지 않는다 — saveDailyLog(수동 임시저장/완료)에서만.
async function syncHomeworkAssignments(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  userId: string,
  dailyLogId: string,
  items: {
    id?: string | null;
    content: string;
    dueDate: string;
    textbook?: string | null;
    school?: string | null;
    // 이미 소유 검증을 통과한 값만 들어온다 (null = 공통)
    assignedStudentId?: string | null;
  }[],
) {
  const { data: existingRows, error: readError } = await supabase
    .from("daily_log_homework_assignments")
    .select("id")
    .eq("user_id", userId)
    .eq("daily_log_id", dailyLogId);

  if (readError) {
    if (HW_MISSING_TABLE_CODES.has(readError.code ?? "")) {
      // migration 미적용: 숙제가 없으면 조용히 통과, 있으면 안내와 함께 실패
      if (items.length === 0) {
        return;
      }
      throw new Error(HW_MIGRATION_MESSAGE);
    }
    console.error("syncHomeworkAssignments read error", readError);
    throw new Error("오늘 숙제를 저장하지 못했어요. 다시 시도해주세요.");
  }

  const existingIds = new Set((existingRows ?? []).map((row) => row.id as string));

  // 새 항목 id는 폼이 추가 시점에 발급한다 (저장 후에도 같은 id 유지 — idempotent).
  // 단, 같은 사용자의 "다른 일지" row id를 보내 upsert로 가로채는 것만 막는다:
  // 이 일지의 기존 id도 아니고 내 다른 row로 존재하는 id면 새 id로 재발급.
  const unknownIds = items
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id) && !existingIds.has(id!));
  const foreignIds = new Set<string>();

  if (unknownIds.length > 0) {
    const { data: otherRows } = await supabase
      .from("daily_log_homework_assignments")
      .select("id")
      .eq("user_id", userId)
      .in("id", unknownIds);
    for (const row of otherRows ?? []) {
      foreignIds.add(row.id as string);
    }
  }

  const rows = items.map((item, index) => ({
    id: item.id && !foreignIds.has(item.id) ? item.id : globalThis.crypto.randomUUID(),
    user_id: userId,
    daily_log_id: dailyLogId,
    content: item.content.trim(),
    due_date: item.dueDate,
    textbook: item.textbook?.trim() || null,
    school: item.school?.trim() || null,
    assigned_student_id: item.assignedStudentId ?? null,
    sort_order: index,
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("daily_log_homework_assignments")
      .upsert(rows, { onConflict: "id" });

    if (upsertError) {
      console.error("syncHomeworkAssignments upsert error", upsertError);
      throw new Error(
        HW_MISSING_TABLE_CODES.has(upsertError.code ?? "")
          ? HW_MIGRATION_MESSAGE
          : "오늘 숙제를 저장하지 못했어요. 다시 시도해주세요.",
      );
    }
  }

  const keptIds = new Set(rows.map((row) => row.id));
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("daily_log_homework_assignments")
      .delete()
      .eq("user_id", userId)
      .in("id", toDelete);

    if (deleteError) {
      console.error("syncHomeworkAssignments delete error", deleteError);
      throw new Error("오늘 숙제를 저장하지 못했어요. 다시 시도해주세요.");
    }
  }
}

export type WritingDraftItem = {
  kind: "log" | "autosave"; // log=수동 임시저장된 일지 row, autosave=아직 일지가 없는 자동 임시저장
  href: string;
  // [임시저장 삭제]용 id — kind=log면 daily_logs.id, kind=autosave면 daily_log_drafts.id.
  // 삭제는 항상 이 id 단건 기준 (group/date 조건의 broad delete 금지 — 중복 draft 개별 정리).
  deleteId: string;
  classDate: string;
  groupName: string;
  groupIcon: string | null;
  updatedAt: string;
};

// "작성 중인 일지" 목록 — 어느 달/필터를 보고 있든 항상 보이게 (draft를 못 찾아 헤매는 문제 해결).
// ① status='draft' 일지 row(수동 임시저장) ② 아직 일지 row가 없는 자동 임시저장(create draft).
// 같은 identity에 둘 다 있으면 둘 다 보여준다 — 내용이 서로 다를 수 있으므로 자동 merge/삭제 없이
// 사용자가 각각 열어 확인하는 것이 복구 UX다. 조회 실패 시 [] (페이지는 항상 뜬다).
export async function getWritingDrafts() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as WritingDraftItem[];
  }

  const [logsRes, draftsRes] = await Promise.all([
    supabase
      .from("daily_logs")
      .select("id, class_date, updated_at, class_groups(name, icon)")
      .eq("user_id", user.id)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("daily_log_drafts")
      .select("id, group_id, class_date, updated_at, class_groups(name, icon)")
      .eq("user_id", user.id)
      .is("daily_log_id", null)
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  if (logsRes.error) {
    console.error("getWritingDrafts logs error", { code: logsRes.error.code, message: logsRes.error.message });
  }
  if (draftsRes.error) {
    console.error("getWritingDrafts drafts error", { code: draftsRes.error.code, message: draftsRes.error.message });
  }

  const items: WritingDraftItem[] = [];

  for (const row of (logsRes.data ?? []) as unknown as {
    id: string;
    class_date: string;
    updated_at: string;
    class_groups: { name?: string; icon?: string | null } | { name?: string; icon?: string | null }[] | null;
  }[]) {
    const group = pickOne<{ name?: string; icon?: string | null }>(row.class_groups);
    items.push({
      kind: "log",
      href: `/daily-logs/${row.id}/edit`,
      deleteId: row.id,
      classDate: row.class_date,
      groupName: group?.name ?? "수업 그룹",
      groupIcon: group?.icon ?? null,
      updatedAt: row.updated_at,
    });
  }

  for (const row of (draftsRes.data ?? []) as unknown as {
    id: string;
    group_id: string;
    class_date: string;
    updated_at: string;
    class_groups: { name?: string; icon?: string | null } | { name?: string; icon?: string | null }[] | null;
  }[]) {
    const group = pickOne<{ name?: string; icon?: string | null }>(row.class_groups);
    items.push({
      kind: "autosave",
      // create 화면이 같은 identity의 autosave를 즉시 전체 복원한다
      href: `/daily-logs/new?groupId=${row.group_id}&date=${row.class_date}`,
      deleteId: row.id,
      classDate: row.class_date,
      groupName: group?.name ?? "수업 그룹",
      groupIcon: group?.icon ?? null,
      updatedAt: row.updated_at,
    });
  }

  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10);
}

// 진입점 통합용: canonical identity(user+group+class_date)의 일지 row 조회 — draft/completed 불문.
// DB unique(user,group,class_date)가 identity당 1개를 보장하므로 maybeSingle. 조회만, write 없음.
export async function getDailyLogByIdentity(groupId: string, classDate: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .eq("class_date", classDate)
    .maybeSingle();

  if (error) {
    console.error("getDailyLogByIdentity error", { code: error.code, message: error.message });
    return null;
  }

  return (data ?? null) as { id: string; status: DailyLogStatus } | null;
}

// 같은 Teacher + 같은 날짜 + 같은 그룹의 수업일지는 최대 1개.
// typed error로 구분해 UI가 전용 경고 dialog를 띄울 수 있게 한다.
// 기준은 항상 "선택한 수업 날짜" — 오늘이 아닐 수 있으므로 문구에 날짜를 명시한다.
export class DuplicateDailyLogError extends Error {
  // 기존 일지 id — UI가 "삭제 후 재작성"이 아니라 "기존 일지 이어쓰기"로 안내할 수 있게
  existingLogId: string | null;

  constructor(classDate?: string, existingLogId?: string | null) {
    const dateLabel = classDate ? `${formatKoreanDateFull(classDate)}에` : "선택한 날짜에";
    super(
      `${dateLabel} 이미 등록된 수업 일지가 있어요.\n같은 반의 수업 일지는 하루에 한 번만 등록할 수 있어요.\n기존 일지를 이어서 작성해주세요.`,
    );
    this.name = "DuplicateDailyLogError";
    this.existingLogId = existingLogId ?? null;
  }
}

// Postgres unique violation (DB-level race 방지용 unique index가 있을 때)
const UNIQUE_VIOLATION = "23505";

// 코드가 기대하는 컬럼이 DB에 없음 = 대기 중인 migration 미적용 (42703: undefined column,
// PGRST204: PostgREST schema cache에 컬럼 없음). "다시 시도"로 해결되지 않으므로
// 원인을 그대로 알려준다 — 오류를 숨기지 않는 명시적 안내.
const SCHEMA_MISMATCH_CODES = new Set(["42703", "PGRST204"]);

function schemaMismatchMessage(error: { code?: string } | null | undefined) {
  return error?.code && SCHEMA_MISMATCH_CODES.has(error.code)
    ? "데이터베이스에 최신 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 대기 중인 migration을 실행한 뒤 다시 저장해주세요."
    : null;
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
    // 기존 row id를 실어 UI가 이어쓰기 링크를 제공한다 (사용자를 막지 않는 복구 UX)
    throw new DuplicateDailyLogError(input.classDate, (duplicateRows![0] as { id: string }).id);
  }

  const studentIds = input.students.map((entry) => entry.studentId);
  // 숙제 대상으로 지정된 학생도 같은 조회에 포함한다 — 숙제가 N개여도 쿼리는 이 1개뿐.
  // 이름까지 같이 받아 mirror 텍스트(지난 숙제)에 쓴다 (학생별 추가 조회 없음).
  const homeworkStudentIds = (input.homeworkAssignments ?? [])
    .map((item) => item.assignedStudentId?.trim() || null)
    .filter((id): id is string => Boolean(id));
  const lookupStudentIds = [...new Set([...studentIds, ...homeworkStudentIds])];
  const { data: ownedStudents, error: ownedError } = await supabase
    .from("students")
    .select("id, name")
    .eq("user_id", user.id)
    .in("id", lookupStudentIds);

  const ownedStudentRows = (ownedStudents ?? []) as { id: string; name: string }[];
  const ownedStudentIds = new Set(ownedStudentRows.map((row) => row.id));
  if (ownedError || !studentIds.every((id) => ownedStudentIds.has(id))) {
    throw new Error("학생 정보를 확인하지 못했어요. 다시 시도해주세요.");
  }
  const studentNameById = new Map(ownedStudentRows.map((row) => [row.id, row.name]));

  const vocabTotal = input.vocabTotal ? Number(input.vocabTotal) : null;

  // 오늘 숙제(구조화): legacy free-text가 비어 있으면 homework 필드에 파생 mirror 텍스트를
  // 기록한다 — 지난 숙제 카드/브리핑/그룹 요약 등 기존 소비처가 코드 변경 없이 계속 동작.
  // homework_due_date는 legacy 입력이 있을 때만 유지 → mirror는 Todo 연동을 발동시키지 않는다.
  // 숙제 대상: 이 강사 소유 학생일 때만 연결하고, 아니면 공통(null)으로 떨어뜨린다.
  // client가 보낸 id를 그대로 믿지 않는다 — 남의 학생 id가 들어와도 절대 연결되지 않는다.
  // (그룹에서 빠진 학생이라도 소유 학생이면 링크를 유지한다 — 과거 일지 수정 시 대상 보존)
  const homeworkAssignments = (input.homeworkAssignments ?? []).map((item) => {
    const requested = item.assignedStudentId?.trim() || null;
    const assignedStudentId = requested && ownedStudentIds.has(requested) ? requested : null;
    return {
      ...item,
      assignedStudentId,
      assignedStudentName: assignedStudentId ? studentNameById.get(assignedStudentId) ?? null : null,
    };
  });
  const legacyHomework = input.homework?.trim() || "";

  // 해야 할 일 다중 항목 정규화 — 내용 없는 항목(교재/날짜만)은 저장/Todo 대상이 아니다
  const taskItems = meaningfulDailyLogTasks(input.tasks ?? []).map((task) => ({
    id: task.id,
    textbook: task.textbook?.trim() || null,
    school: task.school?.trim() || null,
    content: task.content.trim(),
    dueDate: task.dueDate || null,
  }));
  const homeworkText =
    legacyHomework || (homeworkAssignments.length > 0 ? buildHomeworkMirror(homeworkAssignments) : "");
  const homeworkDueDate = legacyHomework ? input.homeworkDueDate || null : null;

  // lesson_content(legacy 수업 내용)는 payload에서 제외 — 기존 값을 덮어쓰지 않고 보존하며,
  // 신규 저장의 canonical field는 default_progress(공통 진도) 하나다.
  const headerPayload = {
    user_id: user.id,
    group_id: input.groupId,
    class_date: input.classDate,
    title: input.title?.trim() || null,
    default_progress: input.defaultProgress?.trim() || null,
    memo: input.memo?.trim() || null,
    homework: homeworkText || null,
    homework_due_date: homeworkDueDate,
    next_lesson_plan: input.nextLessonPlan?.trim() || null,
    next_plan_date: input.nextPlanDate || null,
    // 해야 할 일 — 일지 row가 폼 복원의 source (Todo는 완료 시에만 sync).
    // 다중 항목(tasks jsonb)이 canonical이고, legacy task_* 컬럼에는 첫 항목을 미러한다
    // (tasks 미전송 legacy 경로에서는 기존 단일 필드 동작 그대로).
    tasks: taskItems.length > 0 ? taskItems : null,
    task_content: input.tasks
      ? taskItems[0]?.content ?? null
      : input.taskContent?.trim() || null,
    task_due_date: input.tasks
      ? taskItems[0]
        ? resolveDailyLogTaskDueDate(taskItems[0].dueDate, input.classDate)
        : null
      : input.taskContent?.trim()
        ? input.taskDate || null
        : null,
    task_textbook: input.tasks
      ? taskItems[0]?.textbook ?? null
      : input.taskContent?.trim()
        ? input.taskTextbook?.trim() || null
        : null,
    // 교재별 진도/계획 스냅샷 — default_progress/next_lesson_plan에는 폼이 합성한
    // "교재명 - 내용" mirror(+기타 메모)가 담겨 legacy 소비처와 호환된다
    textbook_progress: (input.textbookProgress ?? []).length > 0 ? input.textbookProgress : null,
    textbook_plans: (input.textbookPlans ?? []).length > 0 ? input.textbookPlans : null,
    school_progress: (input.schoolProgress ?? []).length > 0 ? input.schoolProgress : null,
    school_plans: (input.schoolPlans ?? []).length > 0 ? input.schoolPlans : null,
    vocab_total: vocabTotal,
    reflection_good: input.reflectionGood?.trim() || null,
    reflection_hard: input.reflectionHard?.trim() || null,
    reflection_next: input.reflectionNext?.trim() || null,
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
      throw new Error(
        schemaMismatchMessage(updateError) ?? "수업 기록을 저장하지 못했어요. 다시 시도해주세요.",
      );
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
      throw new Error(
        schemaMismatchMessage(insertError) ?? "수업 기록을 저장하지 못했어요. 다시 시도해주세요.",
      );
    }

    dailyLogId = created.id;
  }

  // linked 준비 항목(To Do) 동기화 (일지당 source별 1개 upsert — 중복/재시도 안전).
  // 다음 수업 계획은 이제 "계획 데이터" — legacy nlp Todo가 이미 있는 일지만 계속 갱신/제거하고
  // 새로 만들지 않는다 (Todo 생성은 아래 "해야 할 일"이 담당).
  await syncLinkedPreparation(
    supabase,
    user.id,
    input.groupId,
    dailyLogId!,
    "daily_log_next_plan",
    input.nextLessonPlan?.trim() ?? "",
    input.nextPlanDate || null,
    false,
  );
  await syncLinkedPreparation(
    supabase,
    user.id,
    input.groupId,
    dailyLogId!,
    "daily_log_homework",
    homeworkText,
    homeworkDueDate,
  );

  // 해야 할 일 → 공용 Todo. [수업 기록 완료]에서만 생성/갱신한다 —
  // 임시저장(draft)은 Todo side effect 없이 일지 데이터만 저장 (autosave는 애초에 이 경로를 안 탐).
  // 삭제된 항목은 dismissed tombstone이라 내용/날짜가 그대로면 단순 재저장으로 부활하지 않는다.
  if (input.status === "completed") {
    if (input.tasks) {
      // 다중 항목 경로: meaningful 항목당 Todo 1개 (stable id — Final Save에서만, idempotent)
      await syncDailyLogTaskTodos(
        supabase,
        user.id,
        input.groupId,
        dailyLogId!,
        input.classDate,
        taskItems,
      );
    } else {
      // legacy 단일 경로 (tasks 미전송 소비처 호환 — 기존 동작 그대로)
      const taskText = input.taskContent?.trim() ?? "";
      await syncLinkedPreparation(
        supabase,
        user.id,
        input.groupId,
        dailyLogId!,
        "daily_log_task",
        taskText,
        taskText ? input.taskDate || null : null,
        true,
        taskText ? input.taskTextbook?.trim() || null : null,
      );
    }
  }

  // 오늘 숙제(구조화) row sync — id 기반 idempotent (재시도/저장 버튼 중복에도 안전)
  await syncHomeworkAssignments(supabase, user.id, dailyLogId!, homeworkAssignments);

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

  // 틀린 단어 동기화: 이 일지의 오답 rows를 폼 상태 그대로 교체한다 (멱등 — 재저장에도 중복 없음).
  // Draft autosave는 daily_log_drafts payload에만 담기고, 실제 rows는 이 final 저장에서만 반영된다.
  // - 같은 일지 안에서는 정규화(소문자/공백) 기준 dedupe, 결석 학생은 기록하지 않는다.
  // - 다른 날짜 일지의 같은 단어는 별개 occurrence (반복 오답 집계용).
  const mistakeBaseTime = Date.now();
  const mistakeRows = input.students.flatMap((entry, studentIndex) => {
    if (entry.attendance === "absent") {
      return [];
    }

    return dedupeVocabWords(entry.vocabMistakes ?? []).map((word, index) => ({
      user_id: user.id,
      student_id: entry.studentId,
      daily_log_id: dailyLogId,
      word,
      // batch insert는 created_at default가 전부 같은 값이라 입력 순서 보존용 ms 오프셋
      // (단어는 시험당 최대 50개 — 학생 간 100ms 간격이면 겹치지 않는다)
      created_at: new Date(mistakeBaseTime + studentIndex * 100 + index).toISOString(),
    }));
  });

  // migration 미적용(테이블 없음)이어도 오답을 안 쓴 저장은 막지 않는다 — 지울 rows도 없기 때문.
  // 오답을 입력했다면 조용히 사라지지 않게 명확한 안내로 실패시킨다.
  const MISSING_TABLE = new Set(["42P01", "PGRST205"]);
  const mistakeMigrationMessage =
    "틀린 단어 저장에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260906_create_vocab_mistakes.sql을 실행한 뒤 다시 저장해주세요.";

  const { error: mistakeDeleteError } = await supabase
    .from("vocab_mistakes")
    .delete()
    .eq("user_id", user.id)
    .eq("daily_log_id", dailyLogId);

  if (mistakeDeleteError) {
    const missingTable = MISSING_TABLE.has(mistakeDeleteError.code ?? "");

    if (!missingTable || mistakeRows.length > 0) {
      console.error("saveDailyLog vocab mistake delete error", mistakeDeleteError);
      throw new Error(
        missingTable
          ? mistakeMigrationMessage
          : "틀린 단어를 저장하지 못했어요. 저장 버튼을 다시 눌러주세요.",
      );
    }
  } else if (mistakeRows.length > 0) {
    const { error: mistakeInsertError } = await supabase.from("vocab_mistakes").insert(mistakeRows);

    if (mistakeInsertError) {
      console.error("saveDailyLog vocab mistake insert error", mistakeInsertError);
      throw new Error(
        MISSING_TABLE.has(mistakeInsertError.code ?? "")
          ? mistakeMigrationMessage
          : "틀린 단어를 저장하지 못했어요. 저장 버튼을 다시 눌러주세요.",
      );
    }
  }

  // 참고: legacy manual 성장 체크(student_growth_checks)는 더 이상 저장/삭제하지 않는다.
  // 기존 데이터는 보존하되, 새 Achievement 판정에는 사용하지 않는다.

  return dailyLogId;
}

// 수업일지 안전 삭제. 실제 FK 정책 기준으로 처리한다:
// - student_lesson_logs.daily_log_id = ON DELETE CASCADE → 출결/평가는 DB가 함께 삭제
// - vocab_mistakes.daily_log_id = ON DELETE CASCADE → 그 시험의 오답도 자동 삭제
// - student_growth_checks.daily_log_id = ON DELETE CASCADE → legacy 체크도 자동 삭제
// - student_praises.daily_log_id = ON DELETE SET NULL → orphan 칭찬이 남지 않게 먼저 명시 삭제
// - makeup_lessons.student_lesson_log_id = ON DELETE SET NULL → 미처리(required/scheduled)
//   보충만 함께 삭제하고, 완료/취소된 보충 이력은 링크만 해제된 채 보존한다
// 학생/그룹/스케줄/교재/캘린더 일정은 건드리지 않는다.
// [임시저장 삭제] 전용: status='draft'인 일지 row만 삭제한다.
// 완료(completed)된 수업일지는 이 경로로 절대 삭제 불가 — UI에서 버튼을 숨기는 것과 별개로
// 서버에서 status를 재검증한다 (버튼을 누르는 사이 다른 탭에서 완료된 경우 포함).
// child 정리는 검증된 기존 deleteDailyLog 경로 재사용 (미처리 보충만 삭제, 완료 이력 보존).
export async function deleteDraftDailyLog(dailyLogId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: existing, error } = await supabase
    .from("daily_logs")
    .select("id, status")
    .eq("id", dailyLogId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("deleteDraftDailyLog read error", { code: error.code, message: error.message });
    throw new Error("임시저장을 삭제하지 못했어요. 다시 시도해주세요.");
  }
  if (!existing) {
    throw new Error("임시저장을 찾을 수 없어요.");
  }
  if (existing.status !== "draft") {
    throw new Error("이미 완료된 수업일지는 임시저장 삭제로 지울 수 없어요.");
  }

  return deleteDailyLog(dailyLogId);
}

export async function deleteDailyLog(dailyLogId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  // ownership 검증 — 다른 Teacher의 일지 id로는 삭제 불가 (RLS + 명시 확인)
  const { data: existing } = await supabase
    .from("daily_logs")
    .select("id, class_date, group_id")
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

  // 이 일지에서 생성된 linked 준비 항목만 제거 (수동 항목은 보존)
  await syncLinkedPreparation(
    supabase,
    user.id,
    existing.group_id as string,
    dailyLogId,
    "daily_log_next_plan",
    "",
    null,
  );
  await syncLinkedPreparation(
    supabase,
    user.id,
    existing.group_id as string,
    dailyLogId,
    "daily_log_homework",
    "",
    null,
  );
  // 이 일지가 소유한 해야 할 일 Todo 전부 제거 (legacy 단일 + 다중 항목 — 수동 Todo는 불변)
  await syncDailyLogTaskTodos(
    supabase,
    user.id,
    existing.group_id as string,
    dailyLogId,
    existing.class_date as string,
    [],
  );

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
  homework_due_date: string | null;
  next_lesson_plan: string | null;
  next_plan_date: string | null;
  memo: string | null;
  reflection_good: string | null;
  reflection_hard: string | null;
  reflection_next: string | null;
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
      "id, class_date, group_id, status, title, default_progress, lesson_content, homework, homework_due_date, next_lesson_plan, next_plan_date, memo, reflection_good, reflection_hard, reflection_next, updated_at, student_lesson_logs(count)",
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

export type PreviousReflectionNext = { class_date: string; reflection_next: string };

// 같은 그룹의 "직전 completed 일지"(class_date < beforeDate)의 다짐(reflection_next).
// 직전 일지에 다짐이 없으면 null — 더 과거로 거슬러 올라가지 않는다(오래된 다짐의 stale 노출 방지).
// 그룹당 하루 1일지 제약 덕분에 수정 화면에서는 자기 날짜 미만 조건만으로 자기 자신이 제외된다.
// migration 미적용 등 조회 실패 시에도 null만 반환 — 작성 화면은 항상 동작해야 한다.
export async function getPreviousReflectionNext(
  groupId: string,
  beforeDate: string,
): Promise<PreviousReflectionNext | null> {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select("class_date, reflection_next")
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .eq("status", "completed")
    .lt("class_date", beforeDate)
    .order("class_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // 0건은 maybeSingle이 error 없이 null을 주므로 여기는 진짜 쿼리 오류만 온다.
    // dev overlay에서 {}로 보이지 않게 구조화해서 남긴다 (사용자 UI에는 미노출).
    console.error("getPreviousReflectionNext error", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  const reflectionNext = (data?.reflection_next as string | null)?.trim();

  if (!data || !reflectionNext) {
    return null;
  }

  return { class_date: data.class_date as string, reflection_next: reflectionNext };
}

// ── 수업 회고 모아보기 ─────────────────────────────────────────

export const REFLECTION_NOT_EMPTY =
  "reflection_good.not.is.null,reflection_hard.not.is.null,reflection_next.not.is.null";

// 이전 일지의 공통 필드만 update (학생 평가/칭찬은 기존 전체 수정 화면 재사용).
// group/date는 바꾸지 않으므로 중복 일지 가드와 충돌할 일이 없다.
export async function updateDailyLogFields(input: {
  dailyLogId: string;
  title: string;
  defaultProgress: string;
  memo: string;
  homework: string;
  homeworkDueDate: string | null;
  nextLessonPlan: string;
  nextPlanDate: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요해요.");
  }

  // 다음 수업 계획은 내용+날짜 쌍 검증 (날짜는 수업일 이후)
  const planText = input.nextLessonPlan.trim();
  const planDate = input.nextPlanDate || null;
  if (planText && !planDate) {
    throw new Error("다음 수업 계획 날짜를 선택해주세요.");
  }
  const homeworkText = input.homework.trim();
  const homeworkDate = homeworkText ? input.homeworkDueDate || null : null;
  const { data: existingRow } = await supabase
    .from("daily_logs")
    .select("class_date")
    .eq("id", input.dailyLogId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existingRow) {
    throw new Error("수업일지를 찾을 수 없어요.");
  }
  if (planDate && planDate <= (existingRow.class_date as string)) {
    throw new Error("다음 수업 계획 날짜는 수업일 이후로 선택해주세요.");
  }
  if (homeworkDate && homeworkDate <= (existingRow.class_date as string)) {
    throw new Error("숙제 날짜는 수업일 이후로 선택해주세요.");
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .update({
      title: input.title.trim() || null,
      default_progress: input.defaultProgress.trim() || null,
      memo: input.memo.trim() || null,
      homework: homeworkText || null,
      homework_due_date: homeworkDate,
      next_lesson_plan: planText || null,
      next_plan_date: planDate,
    })
    .eq("id", input.dailyLogId)
    .eq("user_id", user.id)
    .select(
      "id, class_date, group_id, status, title, default_progress, lesson_content, homework, homework_due_date, next_lesson_plan, next_plan_date, memo, reflection_good, reflection_hard, reflection_next, updated_at",
    )
    .single();

  if (error || !data) {
    console.error("updateDailyLogFields error", error);
    throw new Error("이전 수업 기록을 저장하지 못했어요. 다시 시도해주세요.");
  }

  // linked 준비 항목도 동일 identity로 갱신/제거 (nlp는 기존 항목이 있을 때만 — 신규 생성 없음)
  await syncLinkedPreparation(
    supabase,
    user.id,
    (data as { group_id: string }).group_id,
    input.dailyLogId,
    "daily_log_next_plan",
    planText,
    planDate,
    false,
  );
  await syncLinkedPreparation(
    supabase,
    user.id,
    (data as { group_id: string }).group_id,
    input.dailyLogId,
    "daily_log_homework",
    homeworkText,
    homeworkDate,
  );

  return data as unknown as Omit<DailyLogHistorySummary, "studentCount">;
}
