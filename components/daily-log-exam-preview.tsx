"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, GraduationCap } from "lucide-react";

import { ExamPlanner } from "@/components/exam-planner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gradeDisplay } from "@/lib/grades";
import { examDdayInfo, formatExamPeriod } from "@/lib/school-exam-display";
import type { ExamPrepPlanRecord, SchoolExamType, StudentGrade } from "@/lib/supabase/types";
import { examTypeLabels, semesterLabels } from "@/lib/validation/school-exam";

// 시험 기간 ON Daily Log 상단의 학교별 시험 대비 미리보기.
// - 학교 목록 = 현재 그룹 학생들의 Student.school (서버가 계산해 props로 — 추가 fetch 없음)
// - 시험/계획 데이터는 기존 시험 대비(school_exam_details + exam_prep_plans) row를 그대로 —
//   Daily Log에 복제 저장하지 않고, ExamPlanner를 read-only로 재사용한다 (완료 상태 공유).
// - 학교/월 선택은 이 컴포넌트의 local UI 상태 — Daily Log 폼과 형제 트리라
//   무엇을 바꿔도 폼(진도/숙제/계획/할일/평가)이 remount/변경되지 않는다.
export type DailyLogExamPreviewEntry = {
  school: string;
  exam: {
    id: string;
    grade: StudentGrade;
    examYear: number;
    semester: 1 | 2;
    examType: SchoolExamType;
    startDate: string;
    endDate: string;
    plans: ExamPrepPlanRecord[];
    plansFailed: boolean;
  } | null;
};

export function DailyLogExamPreview({
  entries,
  today,
}: {
  entries: DailyLogExamPreviewEntry[];
  today: string;
}) {
  const schools = entries.map((entry) => entry.school);
  // 학교가 정확히 1개면 자동 선택, 여러 개면 명시적으로 고르게 한다
  // (어느 학교 캘린더를 보고 있는지 항상 명확하게)
  const [selectedSchool, setSelectedSchool] = useState(schools.length === 1 ? schools[0] : "");
  const [collapsed, setCollapsed] = useState(false);

  if (entries.length === 0) {
    return null;
  }

  const selected = entries.find((entry) => entry.school === selectedSchool) ?? null;
  const exam = selected?.exam ?? null;
  const dday = exam ? examDdayInfo(today, exam.startDate, exam.endDate) : null;

  return (
    <Card className="mb-5 border-[#e8d5c4] bg-[#fffaf4]">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-[#a2643c]" /> 시험 대비
          </CardTitle>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="flex min-h-[40px] items-center gap-1 rounded-xl px-2 text-xs font-medium text-[#a2643c] transition hover:bg-[#fdf1e6]"
          >
            {collapsed ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> 시험 대비 일정 보기
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5" /> 시험 대비 일정 접기
              </>
            )}
          </button>
        </div>
      </CardHeader>

      {!collapsed ? (
        <CardContent className="space-y-3">
          <label className="flex max-w-[420px] items-center gap-2 text-xs font-medium text-[#7c6d69]">
            <span className="shrink-0">학교</span>
            {schools.length === 1 ? (
              <span className="flex min-h-[40px] w-full min-w-0 items-center truncate rounded-xl border border-[#e8c9b0] bg-[#fdf1e6] px-3 text-sm font-medium text-[#a2643c]">
                {schools[0]}
              </span>
            ) : (
              <select
                value={selectedSchool}
                onChange={(event) => setSelectedSchool(event.target.value)}
                aria-label="시험 대비 학교 선택"
                className="min-h-[40px] w-full min-w-0 rounded-xl border border-[#e8c9b0] bg-[#fdf1e6] px-3 text-sm font-medium text-[#a2643c] outline-none"
              >
                <option value="">학교 선택</option>
                {schools.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </label>

          {!selected ? (
            <p className="rounded-2xl bg-[#fdf1e6] px-4 py-3 text-sm text-[#8a6a4f]">
              학교를 선택하면 그 학교의 시험 대비 일정을 볼 수 있어요.
            </p>
          ) : exam ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-[#564d4d]">
                <span className="font-semibold text-[#2b2323]">{selected.school}</span>
                <span>
                  {gradeDisplay[exam.grade]} · {exam.examYear}년 {semesterLabels[exam.semester]}{" "}
                  {examTypeLabels[exam.examType]}
                </span>
                <span className="text-xs tabular-nums text-[#8a7b77]">
                  {formatExamPeriod(exam.startDate, exam.endDate)}
                </span>
                {dday ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${dday.className}`}>
                    {dday.label}
                  </span>
                ) : null}
                <Link
                  href={`/exams/${exam.id}`}
                  className="ml-auto flex min-h-[40px] shrink-0 items-center gap-1 text-xs text-[#5c4ca8] hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> 시험 대비에서 보기
                </Link>
              </div>

              {/* 기존 시험 대비 플래너 그대로 — read-only (완료/추가/수정/삭제 없음).
                  key로 학교 전환 시 캘린더 상태(월/Sheet)만 초기화 — Daily Log 폼과 무관 */}
              <ExamPlanner
                key={exam.id}
                readOnly
                examId={exam.id}
                examStart={exam.startDate}
                examEnd={exam.endDate}
                examTypeLabel={examTypeLabels[exam.examType]}
                today={today}
                initialPlans={exam.plans}
                plansFailed={exam.plansFailed}
              />
              {exam.plans.length === 0 && !exam.plansFailed ? (
                <p className="text-xs text-[#8a7b77]">아직 등록된 준비 일정이 없어요.</p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#fdf1e6] px-4 py-3 text-sm text-[#8a6a4f]">
              <span>
                {selected.school}에 등록된 시험 대비 일정이 없어요. (수업일지 작성은 그대로 가능해요)
              </span>
              <Link href="/exams" className="shrink-0 text-xs text-[#5c4ca8] hover:underline">
                시험 대비에서 등록하기 →
              </Link>
            </div>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
