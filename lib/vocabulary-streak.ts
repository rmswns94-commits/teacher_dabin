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

export type VocabularyStreak = {
  current: number;
  // 달성한 시험의 수업일 (시간순) — 월간/누적 집계는 이 날짜로
  threes: string[];
  fives: string[];
};

// 핵심 알고리즘 — perfect 여부의 시간순 나열만 본다
export function computeVocabularyStreak(tests: readonly Pick<VocabularyTest, "date" | "perfect">[]): VocabularyStreak {
  let current = 0;
  const threes: string[] = [];
  const fives: string[] = [];
  for (const test of tests) {
    if (!test.perfect) {
      current = 0;
      continue;
    }
    current += 1;
    if (current === VOCAB_STREAK_MILESTONES.three) {
      threes.push(test.date);
    }
    if (current === VOCAB_STREAK_MILESTONES.five) {
      fives.push(test.date);
      current = 0;
    }
  }
  return { current, threes, fives };
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
  const out: Record<string, VocabularyStreakPreview> = {};
  let current = before;
  for (const assessment of assessments) {
    if (assessment.category !== "vocabulary") {
      continue;
    }
    const correctInput = scores[assessment.id]?.correct ?? "";
    const total = Number(assessment.total);
    if (!correctInput || !(total > 0) || Number(correctInput) > total) {
      continue; // 미입력/잘못된 입력은 순서에서 빠진다 (streak를 끊지 않음)
    }
    if (!isPerfectScore(Number(correctInput), total)) {
      current = 0;
      out[assessment.id] = { streak: 0, milestone: null };
      continue;
    }
    current += 1;
    let milestone: 3 | 5 | null = null;
    if (current === VOCAB_STREAK_MILESTONES.three) {
      milestone = 3;
    }
    if (current === VOCAB_STREAK_MILESTONES.five) {
      milestone = 5;
      out[assessment.id] = { streak: current, milestone };
      current = 0;
      continue;
    }
    out[assessment.id] = { streak: current, milestone };
  }
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
