// AUTO EXAM MODE OFF — 순수 resolver (DB/시각 접근 없음).
//
// 원칙
// - 자동화는 OFF만. is_exam_period=false인 그룹에는 아무것도 하지 않는다 (자동 ON 없음).
// - 판단 대상 학생 = 현재 roster(students.archived=false — 앱 전체의 현재 roster 마스터 플래그). 퇴원/이동 학생 제외.
// - 학교 = 현재 학생들의 student.school을 uniqueSchoolList(trim + 정확 일치 dedupe)로 모은 집합 전부.
//   target_schools는 판단에 쓰지 않는다 ("반 학생들의 모든 학교"가 사용자 요구) — fuzzy 매칭 없음.
// - 학교 정보가 없는 학생이 1명이라도 있으면 보류. 학생 0명이면 보류 (vacuous truth 금지).
// - 현재 시험 cycle = ON한 날짜(exam_period_started_on, KST) 이후에 끝나는 시험 중 가장 먼저 끝나는 record의
//   (연도, 학기, 종류). 같은 cycle의 record만 학교별로 본다 → 몇 달 뒤 기말고사(다른 cycle)는 무시,
//   자동 OFF 뒤 다시 ON하면 새 anchor 기준으로 다음 cycle을 본다. "모든 미래 시험 중 max(end_date)"는 쓰지 않는다.
// - 학교별 종료: 그 학교의 cycle record(그룹 학년 record가 있으면 그것만, 없으면 그 학교의 같은 cycle 전부) 중
//   가장 늦은 end_date가 today(KST)보다 과거여야 ended. end_date 당일은 유지.
// - 학교에 cycle record가 없으면 unknown → 보류. 불확실하면 ON 유지가 기본값.
// - anchor(exam_period_started_on)가 없으면(legacy ON / migration 전) 자동 OFF하지 않는다.

import { addDaysStr } from "@/lib/calendar";
import type { SchoolExamType } from "@/lib/supabase/types";
import { uniqueSchoolList } from "@/lib/textbooks";

export type ExamCycleKey = { examYear: number; semester: 1 | 2; examType: SchoolExamType };

export type AutoOffExamSource = {
  id: string;
  schoolName: string;
  grade: string;
  examYear: number;
  semester: 1 | 2;
  examType: SchoolExamType;
  startDate: string; // calendar_events.start_date (date-only)
  endDate: string; // calendar_events.end_date (date-only)
};

export type ExamAutoOffSchoolStatus = {
  school: string;
  status: "ended" | "not_ended" | "unknown";
  startDate: string | null;
  endDate: string | null;
};

export type ExamAutoOffBlocker =
  | "exam_mode_off"
  | "no_started_on"
  | "no_students"
  | "unknown_school_student"
  | "no_cycle"
  | "school_unknown"
  | "school_not_ended";

export type ExamAutoOffResult = {
  eligible: boolean;
  cycle: ExamCycleKey | null;
  schools: ExamAutoOffSchoolStatus[];
  latestResolvedEndDate: string | null; // 모든 학교가 resolve됐을 때만
  autoOffDate: string | null; // latestResolvedEndDate + 1 (KST)
  blockers: ExamAutoOffBlocker[];
  unknownSchoolStudents: number;
};

export function sameCycle(a: ExamCycleKey, b: ExamCycleKey) {
  return a.examYear === b.examYear && a.semester === b.semester && a.examType === b.examType;
}

const cycleOf = (exam: AutoOffExamSource): ExamCycleKey => ({
  examYear: exam.examYear,
  semester: exam.semester,
  examType: exam.examType,
});

const schoolMatches = (exam: AutoOffExamSource, school: string) => exam.schoolName.trim() === school;

export function resolveExamModeAutoOff(input: {
  isExamPeriod: boolean;
  startedOn: string | null | undefined;
  groupGrade: string | null | undefined;
  students: readonly { school: string | null | undefined; archived: boolean }[];
  exams: readonly AutoOffExamSource[];
  today: string; // KST date-only
}): ExamAutoOffResult {
  const blockers: ExamAutoOffBlocker[] = [];
  const empty = (cycle: ExamCycleKey | null, schools: ExamAutoOffSchoolStatus[], unknownSchoolStudents: number): ExamAutoOffResult => ({
    eligible: false,
    cycle,
    schools,
    latestResolvedEndDate: null,
    autoOffDate: null,
    blockers,
    unknownSchoolStudents,
  });

  if (!input.isExamPeriod) {
    blockers.push("exam_mode_off");
    return empty(null, [], 0);
  }

  const roster = input.students.filter((student) => !student.archived);
  const unknownSchoolStudents = roster.filter((student) => !student.school?.trim()).length;
  const schools = uniqueSchoolList(roster.map((student) => student.school));

  if (roster.length === 0) {
    blockers.push("no_students");
  }
  if (unknownSchoolStudents > 0) {
    blockers.push("unknown_school_student");
  }
  if (!input.startedOn) {
    blockers.push("no_started_on");
  }

  const unknownAll = () => schools.map((school) => ({ school, status: "unknown" as const, startDate: null, endDate: null }));

  if (!input.startedOn || roster.length === 0) {
    return empty(null, unknownAll(), unknownSchoolStudents);
  }

  // 현재 cycle — anchor 이후에 끝나는(아직 유효했던) 시험 중 가장 먼저 끝나는 record
  const startedOn = input.startedOn;
  const anchored = input.exams.filter(
    (exam) => schools.some((school) => schoolMatches(exam, school)) && exam.endDate >= startedOn,
  );
  anchored.sort((a, b) => a.endDate.localeCompare(b.endDate) || a.startDate.localeCompare(b.startDate));
  const cycle = anchored[0] ? cycleOf(anchored[0]) : null;
  if (!cycle) {
    blockers.push("no_cycle");
    return empty(null, unknownAll(), unknownSchoolStudents);
  }

  const statuses: ExamAutoOffSchoolStatus[] = schools.map((school) => {
    const inCycle = input.exams.filter((exam) => schoolMatches(exam, school) && sameCycle(cycleOf(exam), cycle));
    // 그룹 학년 record가 있으면 그것만 (resolveExamForSchool과 같은 학년 우선), 없으면 그 학교의 같은 cycle 전부
    const preferred = inCycle.filter((exam) => exam.grade === input.groupGrade);
    const relevant = preferred.length > 0 ? preferred : inCycle;
    if (relevant.length === 0) {
      return { school, status: "unknown", startDate: null, endDate: null };
    }
    const startDate = relevant.map((exam) => exam.startDate).sort()[0];
    const endDate = relevant.map((exam) => exam.endDate).sort().at(-1) ?? null;
    return {
      school,
      status: endDate && input.today > endDate ? "ended" : "not_ended",
      startDate,
      endDate,
    };
  });

  if (statuses.some((status) => status.status === "unknown")) {
    blockers.push("school_unknown");
  }
  if (statuses.some((status) => status.status === "not_ended")) {
    blockers.push("school_not_ended");
  }

  const allResolved = statuses.length > 0 && statuses.every((status) => status.status !== "unknown");
  const latestResolvedEndDate = allResolved
    ? statuses.map((status) => status.endDate!).sort().at(-1) ?? null
    : null;
  const eligible = blockers.length === 0 && statuses.length > 0 && statuses.every((status) => status.status === "ended");

  return {
    eligible,
    cycle,
    schools: statuses,
    latestResolvedEndDate,
    autoOffDate: latestResolvedEndDate ? addDaysStr(latestResolvedEndDate, 1) : null,
    blockers,
    unknownSchoolStudents,
  };
}

// 그룹 상세의 compact 상태 문구 — resolver 결과만 사용 (UI와 mutation이 같은 계산)
export function describeExamAutoOff(result: ExamAutoOffResult): { headline: string; detail: string | null } {
  if (result.blockers.includes("exam_mode_off")) {
    return { headline: "", detail: null };
  }
  if (result.blockers.includes("no_started_on")) {
    return {
      headline: "자동 종료 안 함",
      detail: "시험 대비 시작일 정보가 없어요 — 시험이 끝나면 직접 꺼주세요.",
    };
  }
  if (result.blockers.includes("no_students")) {
    return { headline: "자동 종료 보류", detail: "반에 학생이 없어요." };
  }
  if (result.blockers.includes("unknown_school_student")) {
    return {
      headline: "자동 종료 보류",
      detail: `학교 정보가 없는 학생이 ${result.unknownSchoolStudents}명 있어요.`,
    };
  }
  if (result.blockers.includes("no_cycle") || result.blockers.includes("school_unknown")) {
    return { headline: "자동 종료 · 시험 일정 확인 필요", detail: "시험이 등록되지 않은 학교가 있어요." };
  }
  if (result.autoOffDate) {
    const [, month, day] = result.autoOffDate.split("-");
    return {
      headline: result.eligible ? "자동 종료 대상" : `자동 종료 예정 · ${Number(month)}/${Number(day)}`,
      detail: "모든 학교의 시험이 끝난 다음 날 자동으로 꺼져요.",
    };
  }
  return { headline: "자동 종료 예정", detail: null };
}
