// 단어시험 연속 만점(streak) + 통과율 — DB에 저장하지 않고 완료된 수업일지의 단어시험 결과에서 매번 계산한다.
//
// - 대상: 정규 수업일지의 단어시험(category vocabulary)만. 문법/독해/월말평가, 재시험 시도 점수는 무관하다.
// - 순서: 실제로 본 시험 순서 — 수업일 → 같은 날이면 일지 생성 순서 → 일지 안에서는 시험 목록 순서(추가한 순서).
//   달력상 연속 여부는 보지 않고, 달이 바뀌어도 이어진다.
// - 만점: 맞은 개수 = 총 문항 (총 문항 ≥ 1). 미입력(null) 시험은 순서에서 빠질 뿐 streak를 끊지 않는다.
// - 만점이면 +1, 아니면 0. 3에 도달하면 3연속 1회(유지), 5에 도달하면 5연속 1회 + 0으로 reset.
//   → 만점 10회 연속 = 3연속 2회 · 5연속 2회 · 현재 0.
// - 달성은 그 시험의 수업일에 귀속된다 (월간 집계는 그 날짜의 달).
// 같은 입력이면 항상 같은 결과라, 일지를 다시 저장하거나 과거 점수를 고치면 그대로 다시 계산된다 (counter drift 없음).
import { lessonAssessmentsOf, studentScoreFor, type LessonAssessmentSource, type StudentAssessmentSource } from "@/lib/assessments";

export const VOCAB_STREAK_MILESTONES = { three: 3, five: 5 } as const;

export function isPerfectScore(correct: number, total: number) {
  return total > 0 && correct === total;
}

export type VocabularyTest = {
  studentId: string;
  date: string; // 수업일 (KST date-only)
  logOrder: string; // 같은 날 여러 일지의 순서 (일지 생성 시각) — 없으면 ""
  logId: string;
  assessmentId: string; // 일지 안 stable 시험 id
  index: number; // 일지 안 시험 목록 순서
  correct: number;
  total: number;
  perfect: boolean;
  // 통과 = 강사가 [재시험 필요]를 표시하지 않은 시험 (재시험 관리와 같은 판단)
  passed: boolean;
};

export type VocabularyHistoryRow = LessonAssessmentSource &
  StudentAssessmentSource & {
    student_id: string;
    daily_log_id: string;
    class_date: string;
    log_created_at?: string | null;
    attendance?: string | null;
  };

export function compareVocabularyTests(
  a: Pick<VocabularyTest, "date" | "logOrder" | "logId" | "index">,
  b: Pick<VocabularyTest, "date" | "logOrder" | "logId" | "index">,
) {
  return a.date.localeCompare(b.date) || a.logOrder.localeCompare(b.logOrder) || a.logId.localeCompare(b.logId) || a.index - b.index;
}

// 완료된 수업일지 row들 → 학생별 단어시험 결과 (시간순). 점수가 확정된 시험만 (미입력 제외).
export function vocabularyTestsOf(rows: readonly VocabularyHistoryRow[]): Map<string, VocabularyTest[]> {
  const out = new Map<string, VocabularyTest[]>();
  for (const row of rows) {
    if (row.attendance === "absent") {
      continue;
    }
    lessonAssessmentsOf(row).forEach((assessment, index) => {
      if (assessment.category !== "vocabulary") {
        return;
      }
      const score = studentScoreFor(row, assessment);
      if (!score) {
        return;
      }
      const list = out.get(row.student_id) ?? [];
      list.push({
        studentId: row.student_id,
        date: row.class_date,
        logOrder: row.log_created_at ?? "",
        logId: row.daily_log_id,
        assessmentId: assessment.id,
        index,
        correct: score.correct,
        total: assessment.total,
        perfect: isPerfectScore(score.correct, assessment.total),
        passed: !score.retest,
      });
      out.set(row.student_id, list);
    });
  }
  for (const list of out.values()) {
    list.sort(compareVocabularyTests);
  }
  return out;
}

// 달성 기록 1건 — 어느 일지(수업)의 어느 시험에서 3/5연속이 됐는지.
// 최종 current streak와는 다른 개념이다: 같은 수업 뒤쪽 시험이 만점이 아니어도(→ current 0),
// 앞쪽 시험에서 생긴 달성은 그대로 남는다. 5연속 달성 후 current가 0이 되는 것도 마찬가지.
export type VocabularyMilestone = { milestone: 3 | 5; date: string; logId: string | null; assessmentId: string | null };

export type VocabularyStreak = {
  current: number;
  // 달성한 시험의 수업일 (시간순) — 월간/누적 집계는 이 날짜로
  threes: string[];
  fives: string[];
  // 달성 기록 (시간순) — 성장노트·수업 브리핑·학생 카드가 같은 source를 쓴다
  events: VocabularyMilestone[];
};

// 핵심 알고리즘 — perfect 여부의 시간순 나열만 본다
export function computeVocabularyStreak(
  tests: readonly (Pick<VocabularyTest, "date" | "perfect"> & Partial<Pick<VocabularyTest, "logId" | "assessmentId">>)[],
): VocabularyStreak {
  let current = 0;
  const events: VocabularyMilestone[] = [];
  for (const test of tests) {
    if (!test.perfect) {
      current = 0;
      continue;
    }
    current += 1;
    const at = { date: test.date, logId: test.logId ?? null, assessmentId: test.assessmentId ?? null };
    if (current === VOCAB_STREAK_MILESTONES.three) {
      events.push({ milestone: 3, ...at });
    }
    if (current === VOCAB_STREAK_MILESTONES.five) {
      events.push({ milestone: 5, ...at });
      current = 0;
    }
  }
  return {
    current,
    threes: events.filter((event) => event.milestone === 3).map((event) => event.date),
    fives: events.filter((event) => event.milestone === 5).map((event) => event.date),
    events,
  };
}

// ── 수업 브리핑 (학생 체크) ──
// 1) 현재 수업: 브리핑 기준 시점(cutoff) 이전 완료 기록의 streak가 2 → "이번 수업 만점이면 3연속 달성 예정",
//    4 → "5연속 달성 예정". cutoff 이전 기록만 보므로 오늘 점수를 입력/완료해도 수업이 끝날 때까지 그대로다.
// 2) 다음 실제 수업: 같은 반의 직전 완료 일지(브리핑 lastLog — class-end lock/휴강 건너뛰기 그대로)에서
//    생긴 달성만 "지난 수업에서 N연속 만점을 달성했어요!". 그 다음 수업부터는 lastLog가 바뀌어 사라진다.
// 3) 마무리: 오늘 완료된 일지(todayLogId)에서 생긴 달성.
export type VocabularyBriefingState = {
  challenge: 3 | 5 | null;
  achievedLast: (3 | 5)[];
  achievedToday: (3 | 5)[];
};

export function vocabularyBriefingStates(input: {
  studentIds: readonly string[];
  testsByStudent: ReadonlyMap<string, readonly VocabularyTest[]>;
  cutoff: string; // 이 날짜 이전 수업만 "지난 기록" (브리핑 previousBefore)
  previousLogId: string | null;
  todayLogId: string | null;
}): Map<string, VocabularyBriefingState> {
  const out = new Map<string, VocabularyBriefingState>();
  for (const studentId of input.studentIds) {
    const tests = input.testsByStudent.get(studentId) ?? [];
    const before = computeVocabularyStreak(tests.filter((test) => test.date < input.cutoff));
    const all = input.todayLogId ? computeVocabularyStreak(tests) : null;
    const challenge = before.current === 2 ? 3 : before.current === 4 ? 5 : null;
    const achievedLast = input.previousLogId
      ? before.events.filter((event) => event.logId === input.previousLogId).map((event) => event.milestone)
      : [];
    const achievedToday = all ? all.events.filter((event) => event.logId === input.todayLogId).map((event) => event.milestone) : [];
    if (challenge || achievedLast.length > 0 || achievedToday.length > 0) {
      out.set(studentId, { challenge, achievedLast, achievedToday });
    }
  }
  return out;
}

export function countInPeriod(dates: readonly string[], start: string, end: string) {
  return dates.filter((date) => date >= start && date <= end);
}

// 기간 안 단어시험 통과 집계 (단어왕)
export function vocabularyPassStats(tests: readonly Pick<VocabularyTest, "date" | "passed">[], start: string, end: string) {
  const inPeriod = tests.filter((test) => test.date >= start && test.date <= end);
  return { evaluated: inPeriod.length, passed: inPeriod.filter((test) => test.passed).length };
}

// ── 수업일지 학생 카드 미리보기 ──
// 이 수업 이전까지의 streak(before)에 지금 입력 중인 단어시험 점수를 시험 목록 순서대로 이어 붙인다.
// 저장 전 미리보기일 뿐 — 실제 기록은 [수업 기록 완료] 후 완료된 일지에서 다시 계산된다.
export type VocabularyStreakPreview = { streak: number; milestone: 3 | 5 | null };

export function previewVocabularyStreak(
  before: number,
  assessments: readonly { id: string; category: string; total: string }[],
  scores: Readonly<Record<string, { correct: string } | undefined>>,
): Record<string, VocabularyStreakPreview> {
  // 같은 핵심 알고리즘(computeVocabularyStreak)을 그대로 쓴다 — 직전 streak는 그만큼의 만점 기록(prefix)으로 이어 붙인다.
  // (before는 항상 0~4라 prefix 안에서 생긴 달성은 assessmentId가 없어 이번 수업 결과에서 빠진다)
  const prefix = Array.from({ length: before }, () => ({ date: "", perfect: true }));
  const current = assessments.flatMap((assessment) => {
    if (assessment.category !== "vocabulary") {
      return [];
    }
    const correctInput = scores[assessment.id]?.correct ?? "";
    const total = Number(assessment.total);
    if (!correctInput || !(total > 0) || Number(correctInput) > total) {
      return []; // 미입력/잘못된 입력은 순서에서 빠진다 (streak를 끊지 않음)
    }
    return [{ date: "", perfect: isPerfectScore(Number(correctInput), total), assessmentId: assessment.id }];
  });
  const out: Record<string, VocabularyStreakPreview> = {};
  current.forEach((test, index) => {
    const result = computeVocabularyStreak([...prefix, ...current.slice(0, index + 1)]);
    const event = result.events.find((item) => item.assessmentId === test.assessmentId);
    out[test.assessmentId] = { streak: event?.milestone === 5 ? 5 : result.current, milestone: event?.milestone ?? null };
  });
  return out;
}

// 이 수업 직전까지의 현재 streak — 지금 일지(logId)는 빼고, 그보다 앞선 시험만 (수정 화면이면 같은 날 앞선 일지 포함)
export function vocabularyStreakBefore(
  tests: readonly VocabularyTest[],
  current: { date: string; logOrder: string; logId: string | null },
) {
  const earlier = tests.filter((test) => {
    if (current.logId && test.logId === current.logId) {
      return false;
    }
    if (test.date !== current.date) {
      return test.date < current.date;
    }
    // 같은 날 다른 일지: 새 일지(아직 저장 전)면 이미 완료된 일지는 모두 앞선 것으로 본다
    return current.logId ? test.logOrder < current.logOrder || (test.logOrder === current.logOrder && test.logId < current.logId) : true;
  });
  return computeVocabularyStreak(earlier).current;
}
