import Link from "next/link";
import { School, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  SchoolExamCreateButton,
  type ExamStudentOption,
} from "@/components/school-exam-dialog";
import { SchoolExamFilters } from "@/components/school-exam-controls";
import { Card, CardContent } from "@/components/ui/card";
import { todayDateString } from "@/lib/dates";
import { gradeDisplay } from "@/lib/grades";
import {
  examDdayInfo,
  examTypeBadgeClass,
  formatExamPeriod,
  planProgressPercent,
} from "@/lib/school-exam-display";
import {
  getExamPlanCountsByExamIds,
  type ExamPlanCounts,
} from "@/lib/supabase/queries/exam-plans";
import { getSchoolExams, type SchoolExamListItem } from "@/lib/supabase/queries/school-exams";
import { getCurrentUserStudents } from "@/lib/supabase/queries/students";
import { examTypeLabels, semesterLabels } from "@/lib/validation/school-exam";
import type { SchoolExamType } from "@/lib/supabase/types";

// 현재 날짜 기준 자연스러운 학기 기본값 (3~8월=1학기, 9~12월=그 해 2학기, 1~2월=전년도 2학기)
function currentTermDefaults(today: string) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  if (month >= 3 && month <= 8) {
    return { year, semester: 1 as const };
  }

  return month >= 9 ? { year, semester: 2 as const } : { year: year - 1, semester: 2 as const };
}

function ExamCard({
  exam,
  today,
  planCounts,
}: {
  exam: SchoolExamListItem;
  today: string;
  planCounts: ExamPlanCounts | null;
}) {
  if (!exam.event) {
    return null;
  }

  const dday = examDdayInfo(today, exam.event.start_date, exam.event.end_date);
  // 준비 상태(준비 전/중/완료) 단계 표시는 제거 — Planner 완료 개수가 준비 상태의 source of truth
  const planTotal = planCounts?.total ?? 0;
  const planDone = planCounts?.done ?? 0;
  const percent = planProgressPercent(planDone, planTotal);
  const previewNames = exam.students.slice(0, 3).map((student) => student.name);
  const restCount = exam.students.length - previewNames.length;
  const scopeSummary = exam.scope_text?.split("\n").map((line) => line.trim()).filter(Boolean)[0];

  return (
    <Link href={`/exams/${exam.id}`} className="block min-w-0">
      <Card
        className={`h-full transition hover:-translate-y-0.5 hover:shadow-md ${dday.ended ? "opacity-75" : ""}`}
      >
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3eefa] text-[#6d5aa8]">
                <School className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <div className="card-title truncate text-[#2b2323]">
                  {exam.school_name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="text-[#786d6b]">{gradeDisplay[exam.grade]}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${examTypeBadgeClass[exam.exam_type]}`}
                  >
                    {examTypeLabels[exam.exam_type]}
                  </span>
                  <span className="text-sm text-[#a79996]">
                    {exam.exam_year}년 {semesterLabels[exam.semester]}
                  </span>
                </div>
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${dday.className}`}
            >
              {dday.label}
            </span>
          </div>

          <div className="mt-3 text-sm tabular-nums text-[#564d4d]">
            {formatExamPeriod(exam.event.start_date, exam.event.end_date)}
          </div>

          <div className="mt-2 flex items-center gap-1.5 text-sm text-[#564d4d]">
            <Users className="h-3.5 w-3.5 shrink-0 text-[#7c6d69]" />
            학생 {exam.students.length}명
            {previewNames.length > 0 ? (
              <span className="min-w-0 truncate text-[#8a7b77]">
                · {previewNames.join(" · ")}
                {restCount > 0 ? ` +${restCount}명` : ""}
              </span>
            ) : null}
          </div>

          <div className="mt-2 text-sm">
            <span className="block min-w-0 truncate text-[#786d6b]">
              {scopeSummary ? `범위 ${scopeSummary}` : "시험 범위 미등록"}
            </span>
          </div>

          {/* 시험 준비 진행률 — Planner 완료 개수 기준 (상세 플래너와 같은 공식) */}
          <div className="mt-3 border-t border-dashed border-[#f0e3dc] pt-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-[#786d6b]">시험 준비 진행률</span>
              <span className="font-semibold tabular-nums text-[#5c4ca8]">{percent}%</span>
            </div>
            <div
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#f0eae4]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={`시험 준비 진행률 ${percent}%`}
            >
              <div
                className="h-full rounded-full bg-[#b3a5ec]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-1 text-sm tabular-nums text-[#a79996]">
              {planTotal > 0 ? `${planDone} / ${planTotal} 완료` : "아직 등록된 준비 계획이 없어요"}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function SchoolExamsPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string; semester?: string; type?: string; deleted?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const today = todayDateString();
  const defaults = currentTermDefaults(today);

  const year = /^\d{4}$/.test(params.year ?? "") ? Number(params.year) : defaults.year;
  // 학기: 기본은 현재 학기, "all"이면 전체 (과거 시험 history 접근용)
  const semester =
    params.semester === "all"
      ? null
      : params.semester === "1" || params.semester === "2"
        ? (Number(params.semester) as 1 | 2)
        : defaults.semester;
  const examType =
    params.type === "midterm" || params.type === "final" || params.type === "other"
      ? (params.type as SchoolExamType)
      : null;

  const [exams, students] = await Promise.all([
    getSchoolExams({
      examYear: year,
      semester: semester ?? undefined,
      examType: examType ?? undefined,
    }),
    // 등록 다이얼로그의 학생 selector + 학교 suggestion용 (이름/학교/학년만 사용)
    getCurrentUserStudents(),
  ]);

  // 카드 진행률: 표시되는 모든 시험의 계획 개수를 1쿼리 batch (카드별 쿼리 N+1 금지)
  const planCountsByExam = await getExamPlanCountsByExamIds(exams.rows.map((exam) => exam.id));

  // 다가오는 시험(시작일 ASC) 먼저, 끝난 시험은 그 아래(최근 종료 순)
  const upcoming = exams.rows
    .filter((exam) => exam.event && exam.event.end_date >= today)
    .sort((a, b) => a.event!.start_date.localeCompare(b.event!.start_date));
  const past = exams.rows
    .filter((exam) => exam.event && exam.event.end_date < today)
    .sort((a, b) => b.event!.start_date.localeCompare(a.event!.start_date));

  const studentOptions: ExamStudentOption[] = students.map((student) => ({
    id: student.id,
    name: student.name,
    school: student.school?.trim() || null,
    grade: student.grade,
  }));
  // 학교명 suggestion: Student.school distinct (null 제외 — 임의 학교명 생성 금지)
  const schoolSuggestions = [
    ...new Set(studentOptions.map((student) => student.school).filter(Boolean) as string[]),
  ].sort((a, b) => a.localeCompare(b, "ko"));
  // 중복 등록 soft warning용 identity 목록 (강제 unique 아님 — 분리 일정 허용)
  const duplicateKeys = exams.rows.map(
    (exam) =>
      `${exam.exam_year}|${exam.semester}|${exam.exam_type}|${exam.school_name}|${exam.grade}`,
  );

  const yearOptions = [
    ...new Set([defaults.year - 1, defaults.year, defaults.year + 1, year]),
  ].sort();

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title="시험 관리"
          description="학교별 시험 일정을 정리해요. 등록한 시험은 캘린더와 대시보드에도 함께 보여요."
        />

        {params.deleted === "1" ? (
          <div className="mb-4 rounded-2xl bg-[#edf9f3] px-4 py-2.5 text-sm text-[#2f6d54]">
            시험을 삭제했어요. 캘린더 일정도 함께 정리됐어요.
          </div>
        ) : null}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <SchoolExamFilters
            year={year}
            semester={semester}
            examType={examType}
            yearOptions={yearOptions}
          />
          <SchoolExamCreateButton
            schools={schoolSuggestions}
            students={studentOptions}
            defaults={{ examYear: String(defaults.year), semester: String(defaults.semester) }}
            duplicateKeys={duplicateKeys}
          />
        </div>

        {exams.failed ? (
          <Card>
            <CardContent className="p-5 text-sm leading-5 text-[#7f5d57]">
              시험 관리 기능의 데이터베이스 변경(migration)이 아직 적용되지 않았어요.
              <br />
              Supabase SQL Editor에서 <code>20260907_create_school_exams.sql</code>을 실행한 뒤
              새로고침해주세요.
            </CardContent>
          </Card>
        ) : exams.rows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-[#655d5d]">
              {year}년 {semester ? semesterLabels[semester] : ""}에 등록된 시험이 없어요.
              <div className="mt-1 text-sm text-[#a79996]">
                오른쪽 위 [학교 시험 등록]으로 학교별 시험을 정리해보세요.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6 pb-8">
            {upcoming.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {upcoming.map((exam) => (
                  <ExamCard
                    key={exam.id}
                    exam={exam}
                    today={today}
                    planCounts={planCountsByExam.get(exam.id) ?? null}
                  />
                ))}
              </div>
            ) : null}

            {past.length > 0 ? (
              <div>
                <div className="caption-text mb-2 font-semibold uppercase tracking-[0.06em] text-[#a8968f]">
                  지난 시험
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {past.map((exam) => (
                    <ExamCard
                      key={exam.id}
                      exam={exam}
                      today={today}
                      planCounts={planCountsByExam.get(exam.id) ?? null}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </AppShell>
  );
}
