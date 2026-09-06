import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import { examTypeLabels } from "@/lib/validation/school-exam";
import { gradeDisplay } from "@/lib/grades";
import type {
  SchoolExamDetailRecord,
  SchoolExamType,
  StudentGrade,
} from "@/lib/supabase/types";

// 학교별 시험 관리. 시험 날짜의 single source는 calendar_events(event_type='exam') —
// 여기서는 event 생성/수정/삭제와 metadata(school_exam_details)·학생 relation을 함께 다룬다.
// Calendar/Dashboard D-30/시험 관리가 전부 같은 event row를 바라본다 (중복 event 생성 금지).

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

// migration 미적용(테이블 없음) 안내
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

const MIGRATION_MESSAGE =
  "시험 관리 기능의 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260907_create_school_exams.sql을 실행한 뒤 다시 시도해주세요.";

export type SchoolExamEventInfo = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
};

export type SchoolExamListItem = SchoolExamDetailRecord & {
  event: SchoolExamEventInfo | null;
  students: { id: string; name: string }[];
};

// 캘린더 event title은 파생 표기 (source of truth 아님 — 표시는 detail 기준)
export function schoolExamEventTitle(input: {
  schoolName: string;
  grade: StudentGrade;
  examType: SchoolExamType;
}) {
  return `${input.schoolName} ${gradeDisplay[input.grade]} ${examTypeLabels[input.examType]}`;
}

// 시험 관리 목록: metadata + event + 학생 이름을 embed 한 번으로 (시험당 반복 쿼리 금지).
// D-30 제한 없음 — Teacher가 등록한 미래/과거 시험 전부 조회 가능 (필터는 연도/학기/종류).
export async function getSchoolExams(filters?: {
  examYear?: number;
  semester?: 1 | 2;
  examType?: SchoolExamType;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { rows: [] as SchoolExamListItem[], failed: false };
  }

  let query = supabase
    .from("school_exam_details")
    .select(
      "*, calendar_events(id, title, start_date, end_date), school_exam_students(student_id, students(id, name))",
    )
    .eq("user_id", user.id);

  if (filters?.examYear) {
    query = query.eq("exam_year", filters.examYear);
  }

  if (filters?.semester) {
    query = query.eq("semester", filters.semester);
  }

  if (filters?.examType) {
    query = query.eq("exam_type", filters.examType);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getSchoolExams error", { code: error.code, message: error.message });
    return { rows: [] as SchoolExamListItem[], failed: true };
  }

  const rows = (data ?? []).map((row) => mapExamRow(row));

  return { rows, failed: false };
}

function mapExamRow(row: Record<string, unknown>): SchoolExamListItem {
  const relations = (row.school_exam_students ?? []) as { students: unknown }[];

  return {
    ...(row as unknown as SchoolExamDetailRecord),
    event: pickOne<SchoolExamEventInfo>(row.calendar_events),
    students: relations
      .map((relation) => pickOne<{ id: string; name: string }>(relation.students))
      .filter((student): student is { id: string; name: string } => Boolean(student))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
  };
}

export async function getSchoolExamById(examId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("school_exam_details")
    .select(
      "*, calendar_events(id, title, start_date, end_date), school_exam_students(student_id, students(id, name))",
    )
    .eq("id", examId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getSchoolExamById error", { code: error.code, message: error.message });
    return null;
  }

  return data ? mapExamRow(data as Record<string, unknown>) : null;
}

type SchoolExamWriteInput = {
  schoolName: string;
  grade: StudentGrade;
  examYear: number;
  semester: 1 | 2;
  examType: SchoolExamType;
  startDate: string;
  endDate: string | null; // 없으면 시작일 = 대표 시험일
  scopeText: string | null;
  memo: string | null;
  studentIds: string[];
};

async function assertOwnedStudents(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  userId: string,
  studentIds: string[],
) {
  if (studentIds.length === 0) {
    return;
  }

  const { data, error } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .in("id", studentIds);

  if (error || (data ?? []).length !== new Set(studentIds).size) {
    throw new Error("학생 정보를 확인하지 못했어요. 다시 시도해주세요.");
  }
}

export async function createSchoolExam(input: SchoolExamWriteInput) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const studentIds = [...new Set(input.studentIds)];
  await assertOwnedStudents(supabase, user.id, studentIds);

  // 1) 시험 날짜의 single source — calendar exam event 생성 (Calendar/Dashboard 자동 반영)
  const { data: event, error: eventError } = await supabase
    .from("calendar_events")
    .insert({
      user_id: user.id,
      title: schoolExamEventTitle(input),
      event_type: "exam",
      start_date: input.startDate,
      end_date: input.endDate || input.startDate,
      group_id: null,
      memo: null,
    })
    .select("id")
    .single();

  if (eventError || !event) {
    console.error("createSchoolExam event error", eventError);
    throw new Error("시험 일정을 저장하지 못했어요. 다시 시도해주세요.");
  }

  // 2) 학교/학년/학기 metadata (school_name은 등록 시점 snapshot)
  const { data: detail, error: detailError } = await supabase
    .from("school_exam_details")
    .insert({
      user_id: user.id,
      calendar_event_id: event.id,
      school_name: input.schoolName.trim(),
      grade: input.grade,
      exam_year: input.examYear,
      semester: input.semester,
      exam_type: input.examType,
      scope_text: input.scopeText?.trim() || null,
      memo: input.memo?.trim() || null,
    })
    .select("id")
    .single();

  if (detailError || !detail) {
    console.error("createSchoolExam detail error", detailError);
    // metadata 없는 exam event가 캘린더에 남지 않게 정리 (best effort)
    await supabase.from("calendar_events").delete().eq("id", event.id).eq("user_id", user.id);
    throw new Error(
      MISSING_TABLE_CODES.has(detailError?.code ?? "")
        ? MIGRATION_MESSAGE
        : "시험 정보를 저장하지 못했어요. 다시 시도해주세요.",
    );
  }

  // 3) 대상 학생 relation (Teacher가 최종 선택한 학생만 — group membership은 건드리지 않는다)
  if (studentIds.length > 0) {
    const { error: studentsError } = await supabase.from("school_exam_students").insert(
      studentIds.map((studentId) => ({
        user_id: user.id,
        school_exam_id: detail.id,
        student_id: studentId,
      })),
    );

    if (studentsError) {
      console.error("createSchoolExam students error", studentsError);
      throw new Error("시험은 등록됐지만 학생 연결에 실패했어요. 시험 상세에서 다시 선택해주세요.");
    }
  }

  return detail.id as string;
}

export async function updateSchoolExam(examId: string, input: SchoolExamWriteInput) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: existing } = await supabase
    .from("school_exam_details")
    .select("id, calendar_event_id")
    .eq("id", examId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    throw new Error("시험 정보를 찾을 수 없어요.");
  }

  const studentIds = [...new Set(input.studentIds)];
  await assertOwnedStudents(supabase, user.id, studentIds);

  // 날짜/제목은 underlying calendar event에 반영 (single source 유지)
  const { error: eventError } = await supabase
    .from("calendar_events")
    .update({
      title: schoolExamEventTitle(input),
      start_date: input.startDate,
      end_date: input.endDate || input.startDate,
    })
    .eq("id", existing.calendar_event_id)
    .eq("user_id", user.id);

  if (eventError) {
    console.error("updateSchoolExam event error", eventError);
    throw new Error("시험 일정을 수정하지 못했어요. 다시 시도해주세요.");
  }

  const { error: detailError } = await supabase
    .from("school_exam_details")
    .update({
      school_name: input.schoolName.trim(),
      grade: input.grade,
      exam_year: input.examYear,
      semester: input.semester,
      exam_type: input.examType,
      scope_text: input.scopeText?.trim() || null,
      memo: input.memo?.trim() || null,
    })
    .eq("id", examId)
    .eq("user_id", user.id);

  if (detailError) {
    console.error("updateSchoolExam detail error", detailError);
    throw new Error("시험 정보를 수정하지 못했어요. 다시 시도해주세요.");
  }

  // 학생 relation 동기화 — 선택 집합과 비교해 추가/제거만 (전체 delete+insert 아님)
  const { data: currentRows, error: relationError } = await supabase
    .from("school_exam_students")
    .select("id, student_id")
    .eq("user_id", user.id)
    .eq("school_exam_id", examId);

  if (relationError) {
    console.error("updateSchoolExam relation read error", relationError);
    throw new Error("시험 정보는 수정했지만 학생 목록을 확인하지 못했어요.");
  }

  const selected = new Set(studentIds);
  const current = new Set((currentRows ?? []).map((row) => row.student_id as string));
  const toAdd = studentIds.filter((id) => !current.has(id));
  const toRemove = (currentRows ?? [])
    .filter((row) => !selected.has(row.student_id as string))
    .map((row) => row.id as string);

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("school_exam_students")
      .delete()
      .eq("user_id", user.id)
      .in("id", toRemove);

    if (error) {
      console.error("updateSchoolExam relation remove error", error);
      throw new Error("시험 정보는 수정했지만 학생 변경에 실패했어요.");
    }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from("school_exam_students").insert(
      toAdd.map((studentId) => ({ user_id: user.id, school_exam_id: examId, student_id: studentId })),
    );

    if (error) {
      console.error("updateSchoolExam relation add error", error);
      throw new Error("시험 정보는 수정했지만 학생 변경에 실패했어요.");
    }
  }

  return true;
}

export async function updateSchoolExamPrepStatus(
  examId: string,
  prepStatus: "not_started" | "preparing" | "ready",
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("school_exam_details")
    .update({ prep_status: prepStatus })
    .eq("id", examId)
    .eq("user_id", user.id);

  if (error) {
    console.error("updateSchoolExamPrepStatus error", error);
    throw new Error("준비 상태를 바꾸지 못했어요. 다시 시도해주세요.");
  }

  return true;
}

// 시험 삭제 = underlying calendar event 삭제 (single source — Calendar/Dashboard에서도 함께 사라진다).
// metadata/학생 relation은 FK cascade가 정리한다. 다른 시험/학생/일지에는 영향 없음.
export async function deleteSchoolExam(examId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: existing } = await supabase
    .from("school_exam_details")
    .select("id, calendar_event_id")
    .eq("id", examId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    throw new Error("시험 정보를 찾을 수 없어요.");
  }

  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", existing.calendar_event_id)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteSchoolExam error", error);
    throw new Error("시험을 삭제하지 못했어요. 다시 시도해주세요.");
  }

  return true;
}

// ── 시험 상세의 Phase 1/2 참고 데이터 (read-only, batch — 자동 생성 없음) ──

export type ExamStudentWeaknessRow = {
  student_id: string;
  title: string;
  category: string;
};

// 대상 학생들의 active 약점 (Phase 1). 실패 시 빈 배열 — 시험 관리 자체는 깨지지 않는다.
export async function getActiveWeaknessesForStudents(studentIds: string[]) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user || studentIds.length === 0) {
    return [] as ExamStudentWeaknessRow[];
  }

  const { data, error } = await supabase
    .from("student_weaknesses")
    .select("student_id, title, category")
    .eq("user_id", user.id)
    .eq("status", "active")
    .in("student_id", studentIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getActiveWeaknessesForStudents error", {
      code: error.code,
      message: error.message,
    });
    return [] as ExamStudentWeaknessRow[];
  }

  return (data ?? []) as ExamStudentWeaknessRow[];
}

export type ExamStudentMistakeRow = { student_id: string; word: string; created_at: string };

// 대상 학생들의 최근 오답 (Phase 2). 실패 시 빈 배열.
export async function getRecentMistakesForStudents(studentIds: string[], sinceIso: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user || studentIds.length === 0) {
    return [] as ExamStudentMistakeRow[];
  }

  const { data, error } = await supabase
    .from("vocab_mistakes")
    .select("student_id, word, created_at")
    .eq("user_id", user.id)
    .gte("created_at", sinceIso)
    .in("student_id", studentIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getRecentMistakesForStudents error", {
      code: error.code,
      message: error.message,
    });
    return [] as ExamStudentMistakeRow[];
  }

  return (data ?? []) as ExamStudentMistakeRow[];
}
