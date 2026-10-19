// 재시험 관리의 단일 규칙 — DB를 모르는 순수 함수만 둔다 (화면/쿼리/일지 저장 sync가 같은 helper를 쓴다).
//
// - 재시험 1건 = (그 수업의 학생 기록 id, 그 수업 안의 시험 id). category/이름/날짜는 identity가 아니다.
// - 진행중 = pending(대기) + failed(미통과). passed(통과)는 통과 기록에만, cancelled는 어디에도 보이지 않는다.
// - 통과/미통과는 강사가 직접 고른다. 점수로 자동 판정하지 않고, 원래 시험 점수도 바꾸지 않는다.
// - 성장왕(단어왕/문법왕/독해왕)은 원래 시험 점수만 본다 — 재시험 상태는 판정에 쓰지 않는다.
import { assessmentMeta, type AssessmentCategory, type LessonAssessment } from "@/lib/assessments";

export type RetestStatus = "pending" | "failed" | "passed" | "cancelled";

export const ACTIVE_RETEST_STATUSES = ["pending", "failed"] as const satisfies readonly RetestStatus[];

export function isActiveRetest(status: RetestStatus) {
  return status === "pending" || status === "failed";
}

export const RETEST_STATUS_LABELS: Record<RetestStatus, string> = {
  pending: "대기",
  failed: "미통과",
  passed: "통과",
  cancelled: "취소",
};

export function retestCategoryLabel(category: AssessmentCategory) {
  return assessmentMeta(category).label;
}

// ── 일지 저장(Final Save) sync ──
// 이 수업에서 "재시험 필요"로 표시된 (학생 기록 × 시험). 결석 학생은 시험 결과가 없으므로 대상이 아니다.
export type RetestSource = {
  lessonLogId: string;
  studentId: string;
  assessmentId: string;
  category: AssessmentCategory;
  totalQuestions: number;
  correctCount: number | null;
  progressSnapshot: string | null;
};

export function retestSourcesOf(input: {
  assessments: readonly LessonAssessment[];
  students: readonly {
    studentId: string;
    lessonLogId: string | undefined;
    absent: boolean;
    scores: Record<string, { correct: number; retest: boolean }>;
    progress: string | null;
  }[];
}): RetestSource[] {
  const out: RetestSource[] = [];
  for (const student of input.students) {
    if (!student.lessonLogId || student.absent) {
      continue;
    }
    for (const assessment of input.assessments) {
      const score = student.scores[assessment.id];
      if (score?.retest) {
        out.push({
          lessonLogId: student.lessonLogId,
          studentId: student.studentId,
          assessmentId: assessment.id,
          category: assessment.category,
          totalQuestions: assessment.total,
          correctCount: score.correct,
          progressSnapshot: student.progress?.trim() || null,
        });
      }
    }
  }
  return out;
}

export type ExistingRetest = {
  id: string;
  student_lesson_log_id: string | null;
  assessment_id: string;
  status: RetestStatus;
  class_date: string;
  group_id: string | null;
  category: AssessmentCategory;
  total_questions: number | null;
  correct_count: number | null;
  progress_snapshot: string | null;
};

export const retestSourceKey = (lessonLogId: string, assessmentId: string) => `${lessonLogId}|${assessmentId}`;

// 저장할 일: 새 등록(insert) / 아직 대기인 등록의 source 정보 갱신 / 취소됐던 등록의 재등록 / 해제된 대기의 취소.
// 미통과·통과는 이 sync가 절대 건드리지 않는다 (상태도, snapshot도 — 이력 보존, pending으로 되돌리지 않음).
export function planRetestSync(input: {
  sources: readonly RetestSource[];
  existing: readonly ExistingRetest[];
  classDate: string;
  groupId: string;
}) {
  const existingByKey = new Map(
    input.existing
      .filter((row) => row.student_lesson_log_id)
      .map((row) => [retestSourceKey(row.student_lesson_log_id!, row.assessment_id), row]),
  );
  const snapshotOf = (source: RetestSource) => ({
    category: source.category,
    group_id: input.groupId,
    class_date: input.classDate,
    total_questions: source.totalQuestions,
    correct_count: source.correctCount,
    progress_snapshot: source.progressSnapshot,
  });
  const inserts: (ReturnType<typeof snapshotOf> & {
    student_id: string;
    student_lesson_log_id: string;
    assessment_id: string;
    status: "pending";
  })[] = [];
  const updates: { id: string; fromStatus: "pending" | "cancelled"; values: ReturnType<typeof snapshotOf> & { status: "pending" } }[] = [];
  const wanted = new Set<string>();

  for (const source of input.sources) {
    const key = retestSourceKey(source.lessonLogId, source.assessmentId);
    wanted.add(key);
    const row = existingByKey.get(key);
    const snapshot = snapshotOf(source);
    if (!row) {
      inserts.push({
        ...snapshot,
        student_id: source.studentId,
        student_lesson_log_id: source.lessonLogId,
        assessment_id: source.assessmentId,
        status: "pending",
      });
    } else if (row.status === "cancelled") {
      updates.push({ id: row.id, fromStatus: "cancelled", values: { ...snapshot, status: "pending" } });
    } else if (row.status === "pending") {
      const changed =
        row.category !== snapshot.category ||
        row.group_id !== snapshot.group_id ||
        row.class_date !== snapshot.class_date ||
        row.total_questions !== snapshot.total_questions ||
        row.correct_count !== snapshot.correct_count ||
        (row.progress_snapshot ?? null) !== snapshot.progress_snapshot;
      if (changed) {
        updates.push({ id: row.id, fromStatus: "pending", values: { ...snapshot, status: "pending" } });
      }
    }
    // failed / passed → 그대로
  }

  const cancelIds = input.existing
    .filter(
      (row) =>
        row.status === "pending" &&
        row.student_lesson_log_id &&
        !wanted.has(retestSourceKey(row.student_lesson_log_id, row.assessment_id)),
    )
    .map((row) => row.id);

  return { inserts, updates, cancelIds };
}

// ── 화면: 어느 반에서 관리하는가 ──
// 1) 학생이 지금도 등록 당시 반에 있으면 그 반.
// 2) 반을 옮겼으면 지금 소속 반 중 첫 번째(반 목록 순서) — "등록 당시 반"은 secondary로 표시.
// 3) 지금 소속 반이 없으면 등록 당시 반 (그 반이 지워졌으면 null = 반 정보 없음).
export function retestHomeGroup(sourceGroupId: string | null, currentGroupIds: readonly string[]) {
  if (sourceGroupId && currentGroupIds.includes(sourceGroupId)) {
    return { groupId: sourceGroupId, moved: false };
  }
  if (currentGroupIds.length > 0) {
    return { groupId: currentGroupIds[0], moved: sourceGroupId !== null };
  }
  return { groupId: sourceGroupId, moved: false };
}

export const NO_GROUP_KEY = "none";

// ── 집계 (반 카드 / 학생 header 공통) ──
export type RetestCountable = { studentId: string; category: AssessmentCategory; status: RetestStatus };

export function summarizeRetests(items: readonly RetestCountable[]) {
  const active = items.filter((item) => isActiveRetest(item.status));
  const byCategory: Record<AssessmentCategory, number> = { vocabulary: 0, grammar: 0, reading: 0 };
  for (const item of active) {
    byCategory[item.category] += 1;
  }
  return {
    studentCount: new Set(active.map((item) => item.studentId)).size,
    retestCount: active.length,
    byCategory,
    failedCount: active.filter((item) => item.status === "failed").length,
  };
}

// 진행중 정렬: 오래 쌓인 재시험부터 (수업일 오름차순 → 등록 순서 → id)
export function compareActiveRetests(
  a: { classDate: string; createdAt: string; id: string },
  b: { classDate: string; createdAt: string; id: string },
) {
  return a.classDate.localeCompare(b.classDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

// "18일째" — 표시 전용 (마감/연체 규칙 아님). 수업일 당일 = 0일
export function retestAgeDays(classDate: string, today: string) {
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${classDate}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

export const RETEST_AGE_NOTICE_DAYS = 7;

// "10/15" (KST date-only 문자열 그대로)
export function retestDateLabel(ymd: string) {
  const [, month, day] = ymd.split("-");
  return month && day ? `${Number(month)}/${Number(day)}` : ymd;
}

// 반 배정 (반 카드/반 상세 공통) — 학생의 현재 소속은 "보관되지 않은 반"만, 반 목록 순서대로.
export function assignRetestGroups<T extends { studentId: string; sourceGroupId: string | null }>(
  rows: readonly T[],
  context: {
    memberships: readonly { student_id: string; group_id: string }[];
    activeGroupIds: readonly string[]; // 반 목록 순서 그대로 (보관 반 제외)
  },
): (T & { homeGroupId: string | null; moved: boolean })[] {
  const order = new Map(context.activeGroupIds.map((id, index) => [id, index]));
  const groupsByStudent = new Map<string, string[]>();
  for (const membership of context.memberships) {
    if (!order.has(membership.group_id)) {
      continue;
    }
    groupsByStudent.set(membership.student_id, [...(groupsByStudent.get(membership.student_id) ?? []), membership.group_id]);
  }
  for (const list of groupsByStudent.values()) {
    list.sort((a, b) => order.get(a)! - order.get(b)!);
  }
  return rows.map((row) => {
    const home = retestHomeGroup(row.sourceGroupId, groupsByStudent.get(row.studentId) ?? []);
    return { ...row, homeGroupId: home.groupId, moved: home.moved };
  });
}

// ── 재시험 시도 점수 이력 (student_retest_attempts) ──
// 시도 1회 = row 1개 (append-only). parent는 재시험 id — 시험 종류로 묶지 않는다.
// 점수는 시도 row에 저장된 값 그대로 표시한다 (원래 시험 총 문항으로 분모를 다시 계산하지 않는다).
export type RetestAttempt = {
  id: string;
  retestId: string;
  attemptNo: number;
  result: "failed";
  correctCount: number;
  totalQuestions: number;
  attemptedAt: string;
};

// "미통과 1회 · 14/24"
export function formatRetestAttempt(attempt: Pick<RetestAttempt, "attemptNo" | "correctCount" | "totalQuestions">) {
  return `미통과 ${attempt.attemptNo}회 · ${attempt.correctCount}/${attempt.totalQuestions}`;
}

// 재시험 id별 시도 목록 (1회 → 2회 → 3회)
export function groupAttemptsByRetestId(attempts: readonly RetestAttempt[]) {
  const out = new Map<string, RetestAttempt[]>();
  for (const attempt of attempts) {
    out.set(attempt.retestId, [...(out.get(attempt.retestId) ?? []), attempt]);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.attemptNo - b.attemptNo);
  }
  return out;
}
