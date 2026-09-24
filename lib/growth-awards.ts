// 성장노트 "이번 기간의 왕" 6종 — DERIVED ONLY (DB 저장 없음, 기간을 열 때마다 source 데이터로 재계산).
//
//   🔥 꾸준왕        출결·숙제·복습 category별 수행률의 동일 비중 평균
//   📚 숙제왕        배정 숙제 완료율
//   💻 복습왕        온라인 복습 완료율 (null=미평가는 분모 제외)
//   ⏰ 시간약속왕    정시(present) 출석률 — 지각/조퇴/결석은 모두 non-success, 출결 사유는 무관
//   📝 과제꾸준왕    숙제 마감일(opportunity date) 기준 최장 연속 "그날 숙제 전부 완료"
//   🚀 도약왕        학습 실행률(숙제+복습)의 직전 기간 대비 향상(%p, 양수만)
//
// 원칙:
// - Winner 선정과 근거(evidence) 표시는 같은 normalized metric 객체를 쓴다 (따로 재계산 금지).
// - 비교는 반올림된 % 가 아니라 분수(num/den) cross-multiply — 부동소수 오차로 승자가 갈리지 않는다.
// - 동점은 전부 winner (이름/id/개수로 한 명 고르기 금지). eligible 0명 또는 최고 점수가 0이면 winner 없음.
// - 기존 9개 성장 배지(lib/growth.ts)는 건드리지 않고, 왕중왕 count에 새 왕을 +1씩 더할 뿐이다.
// - 모든 날짜는 KST date-only 문자열(YYYY-MM-DD) 비교. 숙제 완료 시각은 kstDateOfTimestamp로 KST 날짜화.

import type { GrowthViewMode } from "@/lib/growth-note";
import { kstDateOfTimestamp } from "@/lib/preparation";
import type { AttendanceStatus } from "@/lib/supabase/types";

export type GrowthAwardKey =
  | "consistency"
  | "homework"
  | "review"
  | "punctuality"
  | "homeworkStreak"
  | "improvement";

export const growthAwardKeys: readonly GrowthAwardKey[] = [
  "consistency",
  "homework",
  "review",
  "punctuality",
  "homeworkStreak",
  "improvement",
];

export const growthAwardMeta: Record<GrowthAwardKey, { emoji: string; label: string; description: string }> = {
  consistency: { emoji: "🔥", label: "꾸준왕", description: "출결·숙제·복습을 꾸준히 해낸 학생" },
  homework: { emoji: "📚", label: "숙제왕", description: "숙제 완료율이 가장 높은 학생" },
  review: { emoji: "💻", label: "복습왕", description: "온라인 복습 완료율이 가장 높은 학생" },
  punctuality: { emoji: "⏰", label: "시간약속왕", description: "정시 출석률이 가장 높은 학생" },
  homeworkStreak: { emoji: "📝", label: "과제꾸준왕", description: "숙제를 가장 오래 연속으로 완료한 학생" },
  improvement: { emoji: "🚀", label: "도약왕", description: "이전 기간보다 학습 수행률이 가장 많이 오른 학생" },
};

// ---- Eligibility minimums (주/월별 최소 표본 — 컴포넌트에 숫자 하드코딩 금지) ----
export type GrowthAwardMinimums = {
  attendance: number;
  homework: number;
  review: number;
  consistencyCategories: number;
  consistencyOpportunities: number;
  homeworkStreakDates: number;
  improvementPrevious: number;
  improvementCurrent: number;
};

export function getGrowthAwardMinimums(mode: GrowthViewMode): GrowthAwardMinimums {
  if (mode === "month") {
    return {
      attendance: 4,
      homework: 4,
      review: 4,
      consistencyCategories: 2,
      consistencyOpportunities: 8,
      homeworkStreakDates: 3,
      improvementPrevious: 6,
      improvementCurrent: 6,
    };
  }
  return {
    attendance: 2,
    homework: 2,
    review: 2,
    consistencyCategories: 2,
    consistencyOpportunities: 4,
    homeworkStreakDates: 2,
    improvementPrevious: 3,
    improvementCurrent: 3,
  };
}

// 근거 패널의 "선정 기준" 한 줄
export function growthAwardMinimumLabel(key: GrowthAwardKey, mode: GrowthViewMode): string {
  const min = getGrowthAwardMinimums(mode);
  const unit = mode === "month" ? "이번 달" : "이번 주";
  switch (key) {
    case "homework":
      return `${unit} 숙제 ${min.homework}개 이상`;
    case "review":
      return `${unit} 온라인 복습 평가 ${min.review}회 이상`;
    case "punctuality":
      return `${unit} 출결 기록 ${min.attendance}회 이상`;
    case "consistency":
      return `출결 ${min.attendance}회·숙제 ${min.homework}개·복습 ${min.review}회 중 2가지 이상, 기록 합계 ${min.consistencyOpportunities}개 이상`;
    case "homeworkStreak":
      return `${unit} 숙제 마감일 ${min.homeworkStreakDates}일 이상`;
    case "improvement":
      return `이전 기간·이번 기간 각각 숙제+복습 기록 ${min.improvementPrevious}개 이상`;
  }
}

// ---- 정확한 비교용 분수 ----
export type Fraction = { num: number; den: number };

export function compareFractions(a: Fraction, b: Fraction): number {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left === right ? 0 : left > right ? 1 : -1;
}

export function fractionPercent(fraction: Fraction | null): number | null {
  if (!fraction || fraction.den === 0) {
    return null;
  }
  return (fraction.num / fraction.den) * 100;
}

// "100%", "83.3%", "75%" — 표시 단계에서만 반올림 (소수 1자리, 불필요한 .0 제거)
export function formatPercent(value: number | null): string {
  if (value === null) {
    return "–";
  }
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

// "+27.5%p" / "-10%p"
export function formatPointDelta(points: number): string {
  const rounded = Math.round(points * 10) / 10;
  const text = Number.isInteger(rounded) ? String(Math.abs(rounded)) : Math.abs(rounded).toFixed(1);
  return `${rounded >= 0 ? "+" : "-"}${text}%p`;
}

// ---- 입력 (배치 조회 row → 최소 필드) ----
export type AwardLessonRecord = {
  studentId: string;
  classDate: string; // KST date-only
  attendance: AttendanceStatus;
  onlineReviewCompleted: boolean | null; // null = 미평가
};

export type AwardHomeworkRecord = {
  id: string;
  dueDate: string; // canonical effective due date (date-only)
  completed: boolean;
  completedAt: string | null; // ISO timestamp (없으면 legacy 완료)
  assignedStudentId: string | null; // null = 그 수업의 공통 숙제
  // 공통 숙제 대상: 그 수업 일지에 기록이 있는 학생들 (현재 반 소속으로 과거를 재계산하지 않는다)
  attendeeStudentIds: readonly string[];
};

export type AwardPeriod = { start: string; end: string }; // end = effective end (이미 min(기간 끝, 오늘) 적용)

// 기간 종료 시점 기준 완료 판정: completed_at이 있으면 그 KST 날짜가 기간 안이어야 완료,
// legacy(completed=true, completed_at null)는 완료로 호환. 미래 완료는 "당시 미완료".
export function isHomeworkCompletedAsOf(record: Pick<AwardHomeworkRecord, "completed" | "completedAt">, periodEnd: string) {
  if (!record.completed) {
    return false;
  }
  if (!record.completedAt) {
    return true;
  }
  return kstDateOfTimestamp(record.completedAt) <= periodEnd;
}

export function homeworkAppliesToStudent(record: Pick<AwardHomeworkRecord, "assignedStudentId" | "attendeeStudentIds">, studentId: string) {
  return record.assignedStudentId
    ? record.assignedStudentId === studentId
    : record.attendeeStudentIds.includes(studentId);
}

// ---- normalized metrics (winner 선정과 근거 표시가 공유) ----
export type StudentGrowthMetrics = {
  studentId: string;
  attendance: { present: number; late: number; earlyLeave: number; absent: number; evaluated: number };
  homework: {
    applicable: number;
    completed: number;
    // 마감일별 (date ASC) — 과제꾸준왕의 opportunity date 단위
    byDate: { date: string; total: number; completed: number }[];
  };
  review: { completed: number; incomplete: number; evaluated: number; unevaluated: number };
  previous: {
    homework: { applicable: number; completed: number };
    review: { evaluated: number; completed: number };
  };
};

function inPeriod(date: string, period: AwardPeriod) {
  return date >= period.start && date <= period.end;
}

export function buildStudentGrowthMetrics(input: {
  studentIds: readonly string[];
  lessons: readonly AwardLessonRecord[];
  homework: readonly AwardHomeworkRecord[];
  current: AwardPeriod;
  previous: AwardPeriod;
}): Map<string, StudentGrowthMetrics> {
  const map = new Map<string, StudentGrowthMetrics>();
  for (const studentId of input.studentIds) {
    map.set(studentId, {
      studentId,
      attendance: { present: 0, late: 0, earlyLeave: 0, absent: 0, evaluated: 0 },
      homework: { applicable: 0, completed: 0, byDate: [] },
      review: { completed: 0, incomplete: 0, evaluated: 0, unevaluated: 0 },
      previous: { homework: { applicable: 0, completed: 0 }, review: { evaluated: 0, completed: 0 } },
    });
  }

  // 출결 / 온라인 복습 — 수업 기록(class_date) 기준 귀속. 미래 수업/기간 밖은 제외.
  for (const lesson of input.lessons) {
    const metrics = map.get(lesson.studentId);
    if (!metrics) {
      continue;
    }
    if (inPeriod(lesson.classDate, input.current)) {
      metrics.attendance.evaluated += 1;
      if (lesson.attendance === "present") metrics.attendance.present += 1;
      else if (lesson.attendance === "late") metrics.attendance.late += 1;
      else if (lesson.attendance === "early_leave") metrics.attendance.earlyLeave += 1;
      else metrics.attendance.absent += 1;

      if (lesson.onlineReviewCompleted === null) {
        metrics.review.unevaluated += 1;
      } else {
        metrics.review.evaluated += 1;
        if (lesson.onlineReviewCompleted) metrics.review.completed += 1;
        else metrics.review.incomplete += 1;
      }
    } else if (inPeriod(lesson.classDate, input.previous) && lesson.onlineReviewCompleted !== null) {
      metrics.previous.review.evaluated += 1;
      if (lesson.onlineReviewCompleted) metrics.previous.review.completed += 1;
    }
  }

  // 숙제 — canonical due date 기준 귀속, 학생에게 적용되는 숙제만 (개인/다중 배정/공통-출석)
  const byDateMap = new Map<string, Map<string, { total: number; completed: number }>>();
  for (const record of input.homework) {
    const inCurrent = inPeriod(record.dueDate, input.current);
    const inPrevious = !inCurrent && inPeriod(record.dueDate, input.previous);
    if (!inCurrent && !inPrevious) {
      continue;
    }
    const periodEnd = inCurrent ? input.current.end : input.previous.end;
    const completed = isHomeworkCompletedAsOf(record, periodEnd);
    const targets = record.assignedStudentId ? [record.assignedStudentId] : record.attendeeStudentIds;
    for (const studentId of new Set(targets)) {
      const metrics = map.get(studentId);
      if (!metrics) {
        continue;
      }
      if (inCurrent) {
        metrics.homework.applicable += 1;
        if (completed) metrics.homework.completed += 1;
        const dates = byDateMap.get(studentId) ?? new Map();
        const bucket = dates.get(record.dueDate) ?? { total: 0, completed: 0 };
        bucket.total += 1;
        if (completed) bucket.completed += 1;
        dates.set(record.dueDate, bucket);
        byDateMap.set(studentId, dates);
      } else {
        metrics.previous.homework.applicable += 1;
        if (completed) metrics.previous.homework.completed += 1;
      }
    }
  }
  for (const [studentId, dates] of byDateMap) {
    const metrics = map.get(studentId)!;
    metrics.homework.byDate = [...dates.entries()]
      .map(([date, bucket]) => ({ date, total: bucket.total, completed: bucket.completed }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return map;
}

// ---- Evidence (표시용 — 숫자는 metrics에서 그대로) ----
export type ConsistencyCategoryKey = "attendance" | "homework" | "review";

export type GrowthAwardEvidence =
  | { kind: "homework"; completed: number; applicable: number; incomplete: number; percent: number | null }
  | { kind: "review"; completed: number; evaluated: number; incomplete: number; unevaluated: number; percent: number | null }
  | { kind: "punctuality"; present: number; evaluated: number; late: number; earlyLeave: number; absent: number; percent: number | null }
  | {
      kind: "consistency";
      categories: { key: ConsistencyCategoryKey; label: string; success: number; total: number; percent: number | null; counted: boolean }[];
      percent: number | null;
    }
  | { kind: "homeworkStreak"; longest: number; streakStart: string | null; streakEnd: string | null; opportunityDates: number }
  | {
      kind: "improvement";
      previous: { success: number; total: number; percent: number | null };
      current: { success: number; total: number; percent: number | null };
      deltaPoints: number | null;
      currentHomework: { completed: number; applicable: number };
      currentReview: { completed: number; evaluated: number };
    };

export type GrowthAwardMetric = {
  studentId: string;
  eligible: boolean;
  // eligible일 때만 의미 있는 정확한 점수 (winner 비교용)
  score: Fraction | null;
  evidence: GrowthAwardEvidence;
};

export type GrowthAwardResult = {
  key: GrowthAwardKey;
  winners: GrowthAwardMetric[];
  eligibleCount: number;
  // winner가 없는 이유 — 표시 문구 결정용
  emptyReason: "none" | "no_eligible" | "no_positive";
};

const categoryLabels: Record<ConsistencyCategoryKey, string> = {
  attendance: "출석",
  homework: "숙제",
  review: "온라인 복습",
};

function rate(num: number, den: number): Fraction | null {
  return den > 0 ? { num, den } : null;
}

// 분수 평균 — 공통 분모(den 곱)로 정확히 (부동소수 평균 금지)
function averageFractions(fractions: readonly Fraction[]): Fraction | null {
  if (fractions.length === 0) {
    return null;
  }
  const den = fractions.reduce((product, fraction) => product * fraction.den, 1);
  const num = fractions.reduce(
    (sum, fraction) => sum + fraction.num * (den / fraction.den),
    0,
  );
  return { num, den: den * fractions.length };
}

export function computeGrowthAwardMetric(
  key: GrowthAwardKey,
  metrics: StudentGrowthMetrics,
  min: GrowthAwardMinimums,
): GrowthAwardMetric {
  switch (key) {
    case "homework": {
      const { applicable, completed } = metrics.homework;
      const score = rate(completed, applicable);
      return {
        studentId: metrics.studentId,
        eligible: applicable >= min.homework,
        score,
        evidence: { kind: "homework", completed, applicable, incomplete: applicable - completed, percent: fractionPercent(score) },
      };
    }
    case "review": {
      const { evaluated, completed, incomplete, unevaluated } = metrics.review;
      const score = rate(completed, evaluated);
      return {
        studentId: metrics.studentId,
        eligible: evaluated >= min.review,
        score,
        evidence: { kind: "review", completed, evaluated, incomplete, unevaluated, percent: fractionPercent(score) },
      };
    }
    case "punctuality": {
      const { present, evaluated, late, earlyLeave, absent } = metrics.attendance;
      const score = rate(present, evaluated);
      return {
        studentId: metrics.studentId,
        eligible: evaluated >= min.attendance,
        score,
        evidence: { kind: "punctuality", present, evaluated, late, earlyLeave, absent, percent: fractionPercent(score) },
      };
    }
    case "consistency": {
      const raw: { key: ConsistencyCategoryKey; success: number; total: number; minimum: number }[] = [
        { key: "attendance", success: metrics.attendance.present, total: metrics.attendance.evaluated, minimum: min.attendance },
        { key: "homework", success: metrics.homework.completed, total: metrics.homework.applicable, minimum: min.homework },
        { key: "review", success: metrics.review.completed, total: metrics.review.evaluated, minimum: min.review },
      ];
      const categories = raw.map((category) => ({
        key: category.key,
        label: categoryLabels[category.key],
        success: category.success,
        total: category.total,
        percent: fractionPercent(rate(category.success, category.total)),
        counted: category.total >= category.minimum,
      }));
      const counted = categories.filter((category) => category.counted);
      const opportunities = counted.reduce((sum, category) => sum + category.total, 0);
      const eligible = counted.length >= min.consistencyCategories && opportunities >= min.consistencyOpportunities;
      const score = averageFractions(counted.map((category) => ({ num: category.success, den: category.total })));
      return {
        studentId: metrics.studentId,
        eligible,
        score,
        evidence: { kind: "consistency", categories, percent: fractionPercent(score) },
      };
    }
    case "homeworkStreak": {
      const dates = metrics.homework.byDate;
      let longest = 0;
      let run = 0;
      let runStart: string | null = null;
      let best: { start: string; end: string } | null = null;
      for (const day of dates) {
        if (day.completed === day.total && day.total > 0) {
          run += 1;
          runStart = runStart ?? day.date;
          if (run > longest) {
            longest = run;
            best = { start: runStart, end: day.date };
          }
        } else {
          run = 0;
          runStart = null;
        }
      }
      return {
        studentId: metrics.studentId,
        eligible: dates.length >= min.homeworkStreakDates,
        score: { num: longest, den: 1 },
        evidence: {
          kind: "homeworkStreak",
          longest,
          streakStart: best?.start ?? null,
          streakEnd: best?.end ?? null,
          opportunityDates: dates.length,
        },
      };
    }
    case "improvement": {
      const previousTotal = metrics.previous.homework.applicable + metrics.previous.review.evaluated;
      const previousSuccess = metrics.previous.homework.completed + metrics.previous.review.completed;
      const currentTotal = metrics.homework.applicable + metrics.review.evaluated;
      const currentSuccess = metrics.homework.completed + metrics.review.completed;
      const previous = rate(previousSuccess, previousTotal);
      const current = rate(currentSuccess, currentTotal);
      const eligible = previousTotal >= min.improvementPrevious && currentTotal >= min.improvementCurrent;
      // 향상 = current - previous (분수 차) — 정확 비교용. 표시는 %p로 반올림.
      const score =
        previous && current
          ? { num: current.num * previous.den - previous.num * current.den, den: current.den * previous.den }
          : null;
      const deltaPoints = score ? (score.num / score.den) * 100 : null;
      return {
        studentId: metrics.studentId,
        eligible,
        score,
        evidence: {
          kind: "improvement",
          previous: { success: previousSuccess, total: previousTotal, percent: fractionPercent(previous) },
          current: { success: currentSuccess, total: currentTotal, percent: fractionPercent(current) },
          deltaPoints,
          currentHomework: { completed: metrics.homework.completed, applicable: metrics.homework.applicable },
          currentReview: { completed: metrics.review.completed, evaluated: metrics.review.evaluated },
        },
      };
    }
  }
}

// eligible 학생 중 최고 점수 전원 (동점 전부). 최고 점수가 0 이하면 winner 없음.
export function computeGrowthAward(
  key: GrowthAwardKey,
  metricsList: readonly StudentGrowthMetrics[],
  min: GrowthAwardMinimums,
): GrowthAwardResult {
  const seen = new Set<string>();
  const candidates: GrowthAwardMetric[] = [];
  for (const metrics of metricsList) {
    if (seen.has(metrics.studentId)) {
      continue; // 같은 학생 중복 row → title +2 방지
    }
    seen.add(metrics.studentId);
    const metric = computeGrowthAwardMetric(key, metrics, min);
    if (metric.eligible && metric.score) {
      candidates.push(metric);
    }
  }
  if (candidates.length === 0) {
    return { key, winners: [], eligibleCount: 0, emptyReason: "no_eligible" };
  }
  let best: Fraction | null = null;
  for (const candidate of candidates) {
    if (!best || compareFractions(candidate.score!, best) > 0) {
      best = candidate.score!;
    }
  }
  if (!best || best.num <= 0) {
    return { key, winners: [], eligibleCount: candidates.length, emptyReason: "no_positive" };
  }
  return {
    key,
    winners: candidates.filter((candidate) => compareFractions(candidate.score!, best!) === 0),
    eligibleCount: candidates.length,
    emptyReason: "none",
  };
}

export function computeGrowthAwards(
  metricsList: readonly StudentGrowthMetrics[],
  mode: GrowthViewMode,
): Record<GrowthAwardKey, GrowthAwardResult> {
  const min = getGrowthAwardMinimums(mode);
  const out = {} as Record<GrowthAwardKey, GrowthAwardResult>;
  for (const key of growthAwardKeys) {
    out[key] = computeGrowthAward(key, metricsList, min);
  }
  return out;
}

// 학생별 새 왕 목록 (왕중왕 count용 — award당 최대 1개, stable id 기준)
export function awardsWonByStudent(results: Record<GrowthAwardKey, GrowthAwardResult>): Map<string, GrowthAwardKey[]> {
  const map = new Map<string, GrowthAwardKey[]>();
  for (const key of growthAwardKeys) {
    for (const winner of results[key].winners) {
      const list = map.get(winner.studentId) ?? [];
      if (!list.includes(key)) {
        list.push(key);
      }
      map.set(winner.studentId, list);
    }
  }
  return map;
}

// winner 없음 안내 문구
export function growthAwardEmptyText(key: GrowthAwardKey, reason: GrowthAwardResult["emptyReason"], mode: GrowthViewMode): string {
  const unit = mode === "month" ? "이번 달" : "이번 주";
  if (key === "improvement" && reason === "no_positive") {
    return `${unit}은 이전 기간보다 학습 수행률이 오른 학생이 아직 없어요.`;
  }
  const subject: Record<GrowthAwardKey, string> = {
    consistency: "출결·숙제·복습 기록",
    homework: "숙제 기록",
    review: "온라인 복습 기록",
    punctuality: "출결 기록",
    homeworkStreak: "숙제 기록",
    improvement: "이전 기간과 비교할 기록",
  };
  return reason === "no_positive"
    ? `${unit}은 ${subject[key]}은 있지만 아직 왕을 정할 만한 성과가 없어요.`
    : `${unit}은 아직 ${subject[key]}이 충분하지 않아요.`;
}

// ---- 안내 카드 문구 ("이 왕은 무엇인가?" — winner 근거(왜 이 학생인가)와 역할 분리) ----
// 숫자는 전부 getGrowthAwardMinimums / growthAwardMinimumLabel에서 파생한다.
// 설명용 minimum을 따로 하드코딩하면 계산과 drift가 생기므로 금지.
export type GrowthAwardGuideItem = {
  key: GrowthAwardKey;
  emoji: string;
  label: string;
  primary: string; // 이 왕이 누구인지
  secondary: string; // 어떤 기준으로 계산하는지 (실제 알고리즘과 일치)
  minimum: string; // 최소 기록 기준 — growthAwardMinimumLabel 그대로 (근거 패널과 같은 문구)
};

function growthPeriodWords(mode: GrowthViewMode) {
  return mode === "month"
    ? { unit: "이번 달", previous: "지난달" }
    : { unit: "이번 주", previous: "지난주" };
}

export function growthAwardGuideItem(key: GrowthAwardKey, mode: GrowthViewMode): GrowthAwardGuideItem {
  const { unit, previous } = growthPeriodWords(mode);
  const min = getGrowthAwardMinimums(mode);
  const base = { key, emoji: growthAwardMeta[key].emoji, label: growthAwardMeta[key].label, minimum: growthAwardMinimumLabel(key, mode) };
  switch (key) {
    case "consistency":
      return {
        ...base,
        primary: "출석 · 숙제 · 온라인 복습을 전반적으로 꾸준히 해낸 학생이에요.",
        secondary: `세 영역의 수행률을 같은 비중으로 평균 내서 비교해요. 기록이 부족한 영역은 평균에서 빼고, 남은 영역이 ${min.consistencyCategories}가지 이상일 때만 후보가 돼요.`,
      };
    case "homework":
      return {
        ...base,
        primary: "배정된 숙제를 가장 성실하게 완료한 학생이에요.",
        secondary: `${unit}이 마감인 숙제 중 완료한 비율(숙제 완료율)을 기준으로 선정해요.`,
      };
    case "review":
      return {
        ...base,
        primary: "온라인 복습을 가장 꾸준히 완료한 학생이에요.",
        secondary: "완료 · 미완료로 평가한 기록만으로 완료율을 계산해요. 아직 평가하지 않은 복습은 미완료가 아니라 계산에서 제외돼요.",
      };
    case "punctuality":
      return {
        ...base,
        primary: "수업 시간 약속을 가장 잘 지킨 학생이에요.",
        secondary: "정시 출석률을 기준으로 선정해요. 지각 · 조퇴 · 결석은 사유를 적었더라도 정시 출석으로 계산되지 않아요.",
      };
    case "homeworkStreak":
      return {
        ...base,
        primary: "숙제를 한 번에 많이 한 학생보다, 여러 번 연속으로 빠짐없이 완료한 학생이에요.",
        secondary: "숙제 마감일이 있는 날만 이어서 세고, 그날 숙제를 전부 완료해야 연속으로 인정해요. 숙제가 없는 날 때문에 연속이 끊기지는 않아요.",
      };
    case "improvement":
      return {
        ...base,
        primary: "이전 기간보다 학습 습관이 가장 많이 좋아진 학생이에요.",
        secondary: `${previous}보다 ${unit}의 숙제 · 온라인 복습 수행률이 얼마나 올랐는지 비교해요. 실제로 수행률이 오른 학생이 있을 때만 선정돼요.`,
      };
  }
}

export function growthAwardGuideItems(mode: GrowthViewMode): GrowthAwardGuideItem[] {
  return growthAwardKeys.map((key) => growthAwardGuideItem(key, mode));
}

// 왕중왕 = 9개 성장왕 + 6개 왕 합산 최다 (동점 전원, 전원 0개면 없음) — lib/growth-note의 isKingOfKings와 동일 의미.
// 9+6에 포함되지 않는 별도 종합 타이틀.
export function growthAwardGuideKingText(mode: GrowthViewMode): string {
  const { unit } = growthPeriodWords(mode);
  return `${unit} 받은 성장왕과 왕을 모두 더해 가장 많이 받은 학생이에요. 동점이면 모두 함께 왕중왕이 되고, 아무도 받지 못했다면 왕중왕도 없어요.`;
}

// 공통 선정 정책 — 3개 이내
export function growthAwardGuideNotes(): readonly string[] {
  return [
    "왕은 기록이 충분한 학생끼리만 비교해요. 기록이 너무 적으면 100%여도 선정되지 않을 수 있어요.",
    "점수가 같으면 여러 학생이 함께 왕이 돼요. 성장왕은 비교 없이 기준을 넘긴 학생 모두 받아요.",
    "평가하지 않은 항목은 계산에서 제외되고, 왕은 오늘까지의 기록만 봐요. 마감일이 지나지 않은 숙제는 계산하지 않아요.",
  ];
}
