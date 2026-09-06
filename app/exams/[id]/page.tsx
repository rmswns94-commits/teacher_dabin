import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarRange, School, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  SchoolExamDeleteButton,
  SchoolExamPrepStatusControl,
} from "@/components/school-exam-controls";
import { SchoolExamEditButton, type ExamStudentOption } from "@/components/school-exam-dialog";
import { WeaknessCategoryBadge } from "@/components/student-weaknesses-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDaysStr } from "@/lib/calendar";
import { todayDateString } from "@/lib/dates";
import { gradeDisplay } from "@/lib/grades";
import { examDdayInfo, examTypeBadgeClass, formatExamPeriod } from "@/lib/school-exam-display";
import {
  getActiveWeaknessesForStudents,
  getRecentMistakesForStudents,
  getSchoolExamById,
} from "@/lib/supabase/queries/school-exams";
import { getCurrentUserStudents } from "@/lib/supabase/queries/students";
import type { WeaknessCategory } from "@/lib/supabase/types";
import {
  examTypeLabels,
  semesterLabels,
} from "@/lib/validation/school-exam";
import { aggregateVocabMistakes } from "@/lib/vocab";

// 반복 오답 참고 창 (Phase 3 브리핑과 동일한 30일)
const MISTAKE_WINDOW_DAYS = 30;

export default async function SchoolExamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const today = todayDateString();

  const [exam, students] = await Promise.all([
    getSchoolExamById(id),
    // 수정 다이얼로그의 학생 selector + 학교 suggestion용
    getCurrentUserStudents(),
  ]);

  if (!exam || !exam.event) {
    notFound();
  }

  const studentIds = exam.students.map((student) => student.id);

  // Phase 1/2 read-only 참고 (batch 2쿼리 — 자동 생성 없음, 실패해도 페이지는 뜬다)
  const [weaknesses, mistakes] = await Promise.all([
    getActiveWeaknessesForStudents(studentIds),
    getRecentMistakesForStudents(studentIds, addDaysStr(today, -MISTAKE_WINDOW_DAYS)),
  ]);

  const weaknessesByStudent = new Map<string, { title: string; category: WeaknessCategory }[]>();
  for (const weakness of weaknesses) {
    weaknessesByStudent.set(weakness.student_id, [
      ...(weaknessesByStudent.get(weakness.student_id) ?? []),
      { title: weakness.title, category: weakness.category as WeaknessCategory },
    ]);
  }

  const mistakesByStudent = new Map<string, { word: string; created_at: string }[]>();
  for (const mistake of mistakes) {
    mistakesByStudent.set(mistake.student_id, [
      ...(mistakesByStudent.get(mistake.student_id) ?? []),
      mistake,
    ]);
  }

  const dday = examDdayInfo(today, exam.event.start_date, exam.event.end_date);

  const studentOptions: ExamStudentOption[] = students.map((student) => ({
    id: student.id,
    name: student.name,
    school: student.school?.trim() || null,
    grade: student.grade,
  }));
  const schoolSuggestions = [
    ...new Set(studentOptions.map((student) => student.school).filter(Boolean) as string[]),
  ].sort((a, b) => a.localeCompare(b, "ko"));

  const examLabel = `${exam.school_name} ${gradeDisplay[exam.grade]} ${examTypeLabels[exam.exam_type]}`;

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          backHref="/exams"
          title={exam.school_name}
          description={`${gradeDisplay[exam.grade]} · ${exam.exam_year}년 ${semesterLabels[exam.semester]} ${examTypeLabels[exam.exam_type]}`}
        />

        <div className="grid gap-5 pb-8 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f3eefa] text-[#6d5aa8]">
                      <School className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold text-[#2b2323]">
                          {exam.school_name}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${examTypeBadgeClass[exam.exam_type]}`}
                        >
                          {examTypeLabels[exam.exam_type]}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-[#8a7b77]">
                        {gradeDisplay[exam.grade]} · {exam.exam_year}년 {semesterLabels[exam.semester]}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums ${dday.className}`}
                  >
                    {dday.label}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[#faf7f3] px-3.5 py-2.5 text-sm tabular-nums text-[#564d4d]">
                  <CalendarRange className="h-4 w-4 shrink-0 text-[#7c6d69]" />
                  {formatExamPeriod(exam.event.start_date, exam.event.end_date)}
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 text-xs font-semibold text-[#8a7b77]">준비 상태</div>
                  <SchoolExamPrepStatusControl examId={exam.id} value={exam.prep_status} />
                </div>

                <div className="mt-5 flex justify-end border-t border-dashed border-[#f0e7e2] pt-4">
                  <SchoolExamEditButton
                    examId={exam.id}
                    schools={schoolSuggestions}
                    students={studentOptions}
                    duplicateKeys={[]}
                    initial={{
                      schoolName: exam.school_name,
                      grade: exam.grade,
                      examYear: String(exam.exam_year),
                      semester: String(exam.semester),
                      examType: exam.exam_type,
                      startDate: exam.event.start_date,
                      endDate:
                        exam.event.end_date > exam.event.start_date ? exam.event.end_date : "",
                      scopeText: exam.scope_text ?? "",
                      memo: exam.memo ?? "",
                      studentIds: exam.students.map((student) => student.id),
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>시험 범위</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-line rounded-2xl bg-[#f8f6fc] p-4 text-sm leading-6 text-[#453b3b]">
                  {exam.scope_text || "아직 등록된 시험 범위가 없어요. [수정]에서 적어둘 수 있어요."}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>강사 메모</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-line rounded-2xl bg-[#f8f3ef] p-4 text-sm leading-6 text-[#564d4d]">
                  {exam.memo || "등록된 메모가 아직 없어요."}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>시험 대상 학생</CardTitle>
                  <span className="flex items-center gap-1 rounded-full bg-[#f3eefa] px-2.5 py-1 text-[11px] font-medium text-[#6d5aa8]">
                    <Users className="h-3 w-3" /> {exam.students.length}명
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {exam.students.length === 0 ? (
                  <div className="rounded-2xl bg-[#f8f3ef] p-4 text-sm text-[#655d5d]">
                    아직 선택된 학생이 없어요. [수정]에서 대상 학생을 골라주세요.
                  </div>
                ) : (
                  exam.students.map((student) => {
                    const studentWeaknesses = weaknessesByStudent.get(student.id) ?? [];
                    const repeated = aggregateVocabMistakes(
                      mistakesByStudent.get(student.id) ?? [],
                    ).filter((item) => item.count >= 2);

                    return (
                      <div
                        key={student.id}
                        className="rounded-2xl border border-[#eee0dc] bg-[#fffdfb] p-3"
                      >
                        <Link
                          href={`/students/${student.id}`}
                          className="text-sm font-medium text-[#2b2323] hover:underline"
                        >
                          {student.name}
                        </Link>

                        {/* Phase 1 active 약점 — read-only 참고 (여기서 새로 만들지 않는다) */}
                        {studentWeaknesses.length > 0 ? (
                          <ul className="mt-1.5 space-y-1">
                            {studentWeaknesses.slice(0, 3).map((weakness, index) => (
                              <li key={index} className="flex items-center gap-1.5 text-xs text-[#564d4d]">
                                <WeaknessCategoryBadge category={weakness.category} />
                                <span className="min-w-0 truncate">{weakness.title}</span>
                              </li>
                            ))}
                            {studentWeaknesses.length > 3 ? (
                              <li className="text-[11px] text-[#a79996]">
                                +{studentWeaknesses.length - 3}개 (학생 상세에서 확인)
                              </li>
                            ) : null}
                          </ul>
                        ) : null}

                        {/* Phase 2 반복 오답 — compact + expand */}
                        {repeated.length > 0 ? (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-xs text-[#54479c] hover:underline">
                              반복 단어 오답 {repeated.length}개
                            </summary>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {repeated.slice(0, 8).map((item) => (
                                <span
                                  key={item.word}
                                  className="rounded-full bg-[#f0ecfb] px-2 py-0.5 text-[11px] text-[#54479c]"
                                >
                                  {item.word} {item.count}회
                                </span>
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <div className="border-t border-dashed border-[#f0ddd8] pt-4">
              <SchoolExamDeleteButton examId={exam.id} label={examLabel} />
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
