"use client";

import { Check, Plus, SquarePen } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createSchoolExamAction, updateSchoolExamAction } from "@/app/exams/actions";
import { ConfirmDiscardDialog, useBeforeUnloadWarning } from "@/components/unsaved-guard";
import { Button } from "@/components/ui/button";
import { gradeDisplay, gradeOptions } from "@/lib/grades";
import { examTypeLabels, examTypeValues, semesterLabels } from "@/lib/validation/school-exam";
import { cn } from "@/lib/utils";

export type ExamStudentOption = {
  id: string;
  name: string;
  school: string | null;
  grade: string;
};

export type SchoolExamFormValues = {
  schoolName: string;
  grade: string;
  examYear: string;
  semester: string;
  examType: string;
  startDate: string;
  endDate: string;
  scopeText: string;
  memo: string;
  studentIds: string[];
};

function StudentCheckRow({
  student,
  checked,
  onToggle,
  subLabel,
}: {
  student: ExamStudentOption;
  checked: boolean;
  onToggle: () => void;
  subLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="flex min-h-10 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition hover:bg-[#faf0f2]"
    >
      {checked ? (
        <span
          aria-hidden
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md bg-[#8fc7ab]"
        >
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </span>
      ) : (
        <span
          aria-hidden
          className="h-[18px] w-[18px] shrink-0 rounded-md border-2 border-[#d9c8f0] bg-white"
        />
      )}
      <span className={cn("min-w-0 truncate", checked ? "text-[#2d2928]" : "text-[#655d5d]")}>
        {student.name}
      </span>
      {subLabel ? <span className="ml-auto shrink-0 text-sm text-[#a79996]">{subLabel}</span> : null}
    </button>
  );
}

// 학교 시험 등록/수정 공용 폼. 시험 날짜는 저장 시 calendar exam event(single source)로 반영된다.
// 학생 후보: 선택한 학교+학년과 일치하는 학생을 먼저 보여주되, Teacher가 최종 선택한다
// (문자열 매칭으로 자동 연결하지 않는다). 학교 미등록 학생도 아래 목록에서 수동 선택 가능.
function SchoolExamFormDialog({
  heading,
  schools,
  students,
  initial,
  duplicateKeys,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  heading: string;
  schools: string[];
  students: ExamStudentOption[];
  initial: SchoolExamFormValues;
  // 이미 등록된 시험 identity (연도|학기|종류|학교|학년) — 중복 등록 soft warning용 (강제 아님)
  duplicateKeys: string[];
  isPending: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (values: SchoolExamFormValues) => void;
}) {
  const [schoolName, setSchoolName] = useState(initial.schoolName);
  const [grade, setGrade] = useState(initial.grade);
  const [examYear, setExamYear] = useState(initial.examYear);
  const [semester, setSemester] = useState(initial.semester);
  const [examType, setExamType] = useState(initial.examType);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [scopeText, setScopeText] = useState(initial.scopeText);
  const [memo, setMemo] = useState(initial.memo);
  const [studentIds, setStudentIds] = useState<string[]>(initial.studentIds);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sortedIds = (ids: string[]) => [...ids].sort().join(",");
  const isDirty =
    schoolName !== initial.schoolName ||
    grade !== initial.grade ||
    examYear !== initial.examYear ||
    semester !== initial.semester ||
    examType !== initial.examType ||
    startDate !== initial.startDate ||
    endDate !== initial.endDate ||
    scopeText !== initial.scopeText ||
    memo !== initial.memo ||
    sortedIds(studentIds) !== sortedIds(initial.studentIds);

  useBeforeUnloadWarning(isDirty);

  const requestClose = () => {
    if (isPending) {
      return;
    }

    if (isDirty) {
      setConfirmOpen(true);
    } else {
      onCancel();
    }
  };

  const toggleStudent = (studentId: string) => {
    setStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    );
  };

  const trimmedSchool = schoolName.trim();
  const candidates = students.filter(
    (student) => trimmedSchool && student.school === trimmedSchool && student.grade === grade,
  );
  const others = students.filter((student) => !candidates.includes(student));
  const selectedCount = studentIds.length;

  const duplicateWarning =
    duplicateKeys.includes(`${examYear}|${semester}|${examType}|${trimmedSchool}|${grade}`) &&
    trimmedSchool.length > 0;

  const currentYear = new Date().getFullYear();
  const yearOptions = [...new Set([currentYear - 1, currentYear, currentYear + 1, Number(examYear) || currentYear])]
    .filter(Boolean)
    .sort();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) {
          return;
        }
        if (event.key === "Escape" && !confirmOpen) {
          requestClose();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isDirty && !isPending) {
          onCancel();
        }
      }}
    >
      <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="card-title text-[#2a2323]">{heading}</div>
        <p className="mt-1 text-sm text-[#8a7b77]">
          학교별 시험 일정과 대상 학생을 정리해요. 등록한 시험은 캘린더와 대시보드에도 함께 보여요.
        </p>

        {/* min-w-0: iPad Safari date/select intrinsic width 침범 방지 */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">학교</span>
            <input
              value={schoolName}
              onChange={(event) => setSchoolName(event.target.value)}
              maxLength={80}
              list="school-exam-school-suggestions"
              placeholder="동탄중학교"
              className="w-full min-w-0 rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none focus:border-[#e3b9c9]"
            />
            <datalist id="school-exam-school-suggestions">
              {schools.map((school) => (
                <option key={school} value={school} />
              ))}
            </datalist>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">학년</span>
            <select
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none"
            >
              {gradeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">연도</span>
            <select
              value={examYear}
              onChange={(event) => setExamYear(event.target.value)}
              className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none"
            >
              {yearOptions.map((year) => (
                <option key={year} value={String(year)}>{year}년</option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">학기</span>
            <select
              value={semester}
              onChange={(event) => setSemester(event.target.value)}
              className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none"
            >
              <option value="1">{semesterLabels[1]}</option>
              <option value="2">{semesterLabels[2]}</option>
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">시험 종류</span>
            <select
              value={examType}
              onChange={(event) => setExamType(event.target.value)}
              className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none"
            >
              {examTypeValues.map((value) => (
                <option key={value} value={value}>{examTypeLabels[value]}</option>
              ))}
            </select>
          </label>

          <div className="grid min-w-0 grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">시작일</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-2.5 py-2.5 text-base outline-none"
                aria-label="시험 시작일"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">종료일 (선택)</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-2.5 py-2.5 text-base outline-none"
                aria-label="시험 종료일"
              />
            </label>
          </div>
        </div>

        {duplicateWarning ? (
          <div className="mt-3 rounded-2xl bg-[#fdf8ec] px-3 py-2 text-sm leading-5 text-[#8a6828]">
            같은 연도·학기·종류의 {trimmedSchool} {gradeDisplay[grade as keyof typeof gradeDisplay] ?? ""} 시험이
            이미 등록되어 있어요. 분리 일정이 아니라면 기존 시험을 수정해주세요.
          </div>
        ) : null}

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#4d3a3a]">
              대상 학생 <span className="text-sm text-[#8a7b77]">· {selectedCount}명 선택</span>
            </span>
            {candidates.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setStudentIds((prev) => [...new Set([...prev, ...candidates.map((s) => s.id)])])
                }
                className="text-sm font-medium text-[#5c4ca8] hover:underline"
              >
                이 학교/학년 전체 선택
              </button>
            ) : null}
          </div>

          {trimmedSchool && candidates.length > 0 ? (
            <div className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto rounded-2xl border border-[#ece0db] bg-white p-2">
              {candidates.map((student) => (
                <StudentCheckRow
                  key={student.id}
                  student={student}
                  checked={studentIds.includes(student.id)}
                  onToggle={() => toggleStudent(student.id)}
                />
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-[#a79996]">
              {trimmedSchool
                ? "이 학교/학년으로 등록된 학생이 없어요. 아래에서 직접 선택할 수 있어요."
                : "학교와 학년을 고르면 해당 학생을 먼저 보여드려요."}
            </p>
          )}

          {others.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-[#8a8a93] hover:text-[#564d4d]">
                다른 학생 직접 선택 ({others.length}명)
              </summary>
              <div className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto rounded-2xl border border-[#ece0db] bg-white p-2">
                {others.map((student) => (
                  <StudentCheckRow
                    key={student.id}
                    student={student}
                    checked={studentIds.includes(student.id)}
                    onToggle={() => toggleStudent(student.id)}
                    subLabel={[gradeDisplay[student.grade as keyof typeof gradeDisplay], student.school]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">시험 범위 (선택)</span>
          <textarea
            value={scopeText}
            onChange={(event) => setScopeText(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={"교과서 Unit 3 ~ Unit 5\n부교재 p.45~72"}
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base leading-6 outline-none focus:border-[#e3b9c9]"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">강사 메모 (선택)</span>
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="서술형 대비 필요 · 관계대명사 집중"
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base leading-6 outline-none focus:border-[#e3b9c9]"
          />
        </label>

        {error ? (
          <div className="mt-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={requestClose}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !schoolName.trim() || !startDate}
            onClick={() =>
              onSubmit({
                schoolName,
                grade,
                examYear,
                semester,
                examType,
                startDate,
                endDate,
                scopeText,
                memo,
                studentIds,
              })
            }
          >
            {isPending ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>

      <ConfirmDiscardDialog
        open={confirmOpen}
        onKeepEditing={() => setConfirmOpen(false)}
        onDiscard={onCancel}
      />
    </div>
  );
}

export function SchoolExamCreateButton({
  schools,
  students,
  defaults,
  duplicateKeys,
}: {
  schools: string[];
  students: ExamStudentOption[];
  defaults: { examYear: string; semester: string };
  duplicateKeys: string[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (values: SchoolExamFormValues) => {
    setError("");
    startTransition(async () => {
      const result = await createSchoolExamAction(values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        className="gap-2"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> 학교 시험 등록
      </Button>

      {open ? (
        <SchoolExamFormDialog
          heading="학교 시험 등록"
          schools={schools}
          students={students}
          duplicateKeys={duplicateKeys}
          initial={{
            schoolName: "",
            grade: "middle_1",
            examYear: defaults.examYear,
            semester: defaults.semester,
            examType: "midterm",
            startDate: "",
            endDate: "",
            scopeText: "",
            memo: "",
            studentIds: [],
          }}
          isPending={isPending}
          error={error}
          onCancel={() => setOpen(false)}
          onSubmit={submit}
        />
      ) : null}
    </>
  );
}

export function SchoolExamEditButton({
  examId,
  schools,
  students,
  initial,
  duplicateKeys,
}: {
  examId: string;
  schools: string[];
  students: ExamStudentOption[];
  initial: SchoolExamFormValues;
  duplicateKeys: string[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (values: SchoolExamFormValues) => {
    setError("");
    startTransition(async () => {
      const result = await updateSchoolExamAction(examId, values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5 text-sm"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <SquarePen className="h-3.5 w-3.5" /> 수정
      </Button>

      {open ? (
        <SchoolExamFormDialog
          heading="시험 정보 수정"
          schools={schools}
          students={students}
          duplicateKeys={duplicateKeys}
          initial={initial}
          isPending={isPending}
          error={error}
          onCancel={() => setOpen(false)}
          onSubmit={submit}
        />
      ) : null}
    </>
  );
}
