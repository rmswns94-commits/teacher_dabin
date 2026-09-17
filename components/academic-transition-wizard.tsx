"use client";

// 학기·학년 전환 마법사 — 여러 학생의 "현재 학년 + 현재 소속"을 한 번에 검토/적용한다.
//
// 원칙:
// - 1~3단계(대상 선택 → 학년·반 변경 → 미리보기)는 전부 로컬 state다. DB 호출 0.
//   마지막 [적용] confirm에서만 단일 RPC(트랜잭션)로 batch 적용한다.
// - 과거 기록(일지/출결/평가/숙제/보충/성장/시험)은 이 화면의 계산에도, 적용에도 없다.
// - 반 이동은 PHASE 1과 같은 semantics: 선택한 기존 소속 1건만 종료 + 새 소속 추가.
//   학생의 다른 동시 소속(특강 등)은 절대 건드리지 않는다.
// - 학년 제안은 enum 순서 기반(lib/academic-transition)이고, 마지막 학년/알 수 없는 값은
//   자동 변경하지 않는다. 제안은 로컬 state일 뿐 적용이 아니다.
// - 학생 status(재원/휴원/퇴원)는 이 마법사에서 절대 바꾸지 않는다.

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, GraduationCap } from "lucide-react";

import { applyAcademicTransitionAction } from "@/app/students/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  KEEP_GROUP,
  UNASSIGNED_GROUP,
  nextGradeSuggestion,
  planTransition,
  summarizeTransition,
  type TransitionSelection,
  type TransitionStudentState,
} from "@/lib/academic-transition";
import { gradeDisplay, gradeOptions } from "@/lib/grades";
import type { StudentGrade } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export type TransitionStudent = {
  studentId: string;
  name: string;
  school: string | null;
  grade: StudentGrade;
  groupIds: string[];
};

export type TransitionGroup = { id: string; name: string; grade: string | null };

type Step = "select" | "edit" | "preview" | "done";

export function AcademicTransitionWizard({
  students,
  groups,
}: {
  students: TransitionStudent[];
  groups: TransitionGroup[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selections, setSelections] = useState<Record<string, TransitionSelection>>(() =>
    Object.fromEntries(
      students.map((student) => [
        student.studentId,
        {
          grade: student.grade,
          fromGroupId: student.groupIds[0] ?? "",
          toGroupId: KEEP_GROUP,
        } satisfies TransitionSelection,
      ]),
    ),
  );
  const [bulkGrade, setBulkGrade] = useState("");
  const [bulkGroup, setBulkGroup] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [appliedCount, setAppliedCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const busyRef = useRef(false);

  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );
  const states: TransitionStudentState[] = useMemo(
    () =>
      students.map((student) => ({
        studentId: student.studentId,
        currentGrade: student.grade,
        currentGroupIds: student.groupIds,
      })),
    [students],
  );

  const groupName = (groupId: string | null | undefined) =>
    groupId ? groupById.get(groupId)?.name ?? "알 수 없는 반" : "미배정";

  // 검색은 기존 학생 목록과 같은 기준 (이름 / 학교, 부분 일치)
  const visibleStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return students;
    }
    return students.filter(
      (student) =>
        student.name.toLowerCase().includes(q) ||
        (student.school ?? "").toLowerCase().includes(q),
    );
  }, [students, query]);

  const selectedStudents = useMemo(
    () => students.filter((student) => selectedIds.includes(student.studentId)),
    [students, selectedIds],
  );

  const changes = useMemo(
    () => planTransition(states, selections, selectedIds),
    [states, selections, selectedIds],
  );
  const summary = summarizeTransition(changes, selectedIds.length);
  const changeByStudent = useMemo(
    () => new Map(changes.map((change) => [change.studentId, change])),
    [changes],
  );

  const updateSelection = (studentId: string, patch: Partial<TransitionSelection>) => {
    setSelections((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  };

  const toggleStudent = (studentId: string) => {
    setSelectedIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId],
    );
  };

  // [선택 학생 다음 학년으로] — 안전하게 다음 학년이 정해지는 학생만 로컬 state 변경.
  // 새 학년과 같은 grade를 가진 그룹이 정확히 1개일 때만 반도 함께 제안한다.
  const suggestNextGrades = () => {
    setSelections((prev) => {
      const next = { ...prev };
      for (const student of selectedStudents) {
        const suggestion = nextGradeSuggestion(student.grade);
        if (!suggestion) {
          continue; // 고1/알 수 없는 학년 — 직접 선택
        }
        const candidates = groups.filter((group) => group.grade === suggestion);
        const current = next[student.studentId];
        next[student.studentId] = {
          ...current,
          grade: suggestion,
          toGroupId:
            candidates.length === 1 && !student.groupIds.includes(candidates[0].id)
              ? candidates[0].id
              : current.toGroupId,
        };
      }
      return next;
    });
  };

  const applyBulkGrade = () => {
    if (!bulkGrade) return;
    setSelections((prev) => {
      const next = { ...prev };
      for (const student of selectedStudents) {
        next[student.studentId] = { ...next[student.studentId], grade: bulkGrade as StudentGrade };
      }
      return next;
    });
  };

  const applyBulkGroup = () => {
    if (!bulkGroup) return;
    setSelections((prev) => {
      const next = { ...prev };
      for (const student of selectedStudents) {
        next[student.studentId] = { ...next[student.studentId], toGroupId: bulkGroup };
      }
      return next;
    });
  };

  const runApply = () => {
    if (busyRef.current || changes.length === 0) {
      return;
    }
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await applyAcademicTransitionAction(
          changes.map((change) => ({
            studentId: change.studentId,
            grade: change.grade,
            fromGroupId: change.fromGroupId,
            toGroupId: change.toGroupId,
          })),
        );
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setAppliedCount(result.applied);
        setConfirmOpen(false);
        setStep("done");
        router.refresh();
      } finally {
        busyRef.current = false;
      }
    });
  };

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="body-text p-6 text-[#655d5d]">
          전환할 재원 학생이 없어요.
        </CardContent>
      </Card>
    );
  }

  if (step === "done") {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="card-title flex items-center gap-2 text-[#2f6d54]">
            <Check className="h-5 w-5" aria-hidden /> 새 학기 정보를 적용했어요
          </div>
          <p className="mt-2 text-sm leading-5 text-[#655d5d]">
            학생 {appliedCount}명의 현재 학년과 수업 그룹 소속을 변경했어요. 지난 수업일지와
            출결, 숙제, 보충, 성장 기록은 그대로예요.
          </p>
          <div className="mt-4">
            <Button type="button" onClick={() => router.push("/students")}>
              학생 목록으로
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 단계 표시 */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {[
          { key: "select", label: "1. 대상 선택" },
          { key: "edit", label: "2. 학년 · 반" },
          { key: "preview", label: "3. 미리보기" },
        ].map((item) => (
          <li
            key={item.key}
            aria-current={step === item.key ? "step" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 font-medium",
              step === item.key
                ? "border-[#d3c8ec] bg-[#f2edf9] text-[#5c4ca8]"
                : "border-[#ece0db] bg-white text-[#a89a95]",
            )}
          >
            {item.label}
          </li>
        ))}
      </ol>

      {step === "select" ? (
        <Card>
          <CardContent className="p-4">
            <p className="secondary-text text-[#8a7b77]">
              전환할 학생을 선택해주세요. 재원 학생만 표시돼요 — 휴원·퇴원 학생은 자동으로
              승급되지 않아요.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="학생 이름 또는 학교 검색"
                placeholder="이름 · 학교 검색"
                className="min-h-[42px] min-w-0 flex-1 rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-base outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setSelectedIds((prev) => [
                    ...new Set([...prev, ...visibleStudents.map((s) => s.studentId)]),
                  ])
                }
              >
                전체 선택
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                전체 해제
              </Button>
            </div>

            <div className="mt-3 space-y-1.5">
              {visibleStudents.length === 0 ? (
                <p className="rounded-2xl bg-[#faf4ef] px-3 py-3 text-sm text-[#8a7b77]">
                  검색 결과가 없어요.
                </p>
              ) : (
                visibleStudents.map((student) => {
                  const checked = selectedIds.includes(student.studentId);
                  return (
                    <button
                      key={student.studentId}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleStudent(student.studentId)}
                      className={cn(
                        "flex min-h-[46px] w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition",
                        checked
                          ? "border-[#d8cdf0] bg-[#f5f1fb]"
                          : "border-[#f0e6e0] bg-white hover:bg-[#faf7ff]",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold text-[#2d2928]">
                          {student.name}
                        </span>
                        <span className="secondary-text block truncate text-[#8a7b77]">
                          {[student.school, gradeDisplay[student.grade]].filter(Boolean).join(" · ")}
                          {student.groupIds.length > 0
                            ? ` · ${student.groupIds.map((id) => groupName(id)).join(", ")}`
                            : " · 미배정"}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                          checked
                            ? "border-[#8f7bc4] bg-[#8f7bc4] text-white"
                            : "border-[#ddcfc9] bg-white text-transparent",
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="secondary-text text-[#8a7b77]">
                {selectedIds.length}명 선택
              </span>
              <Button
                type="button"
                className="gap-1.5"
                disabled={selectedIds.length === 0}
                onClick={() => setStep("edit")}
              >
                다음 <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "edit" ? (
        <Card>
          <CardContent className="p-4">
            <p className="secondary-text text-[#8a7b77]">
              학년과 수업 그룹을 확인해주세요. 지금 화면에서는 아무것도 저장되지 않아요.
            </p>

            {/* 일괄 도구 — 로컬 state만 바꾼다 */}
            <div className="mt-3 space-y-2 rounded-2xl bg-[#f8f6fc] p-3">
              <Button type="button" variant="secondary" size="sm" onClick={suggestNextGrades}>
                선택 학생 다음 학년으로
              </Button>
              <p className="caption-text text-[#8a7b77]">
                다음 학년이 분명한 학생만 바뀌어요. 고1처럼 다음 학년이 없는 경우는 직접
                선택해주세요.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={bulkGrade}
                  onChange={(event) => setBulkGrade(event.target.value)}
                  aria-label="일괄 지정할 학년"
                  className="min-h-[40px] min-w-0 rounded-xl border border-[#ece0db] bg-white px-2.5 py-1.5 text-base outline-none"
                >
                  <option value="">학년 일괄 지정</option>
                  {gradeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!bulkGrade}
                  onClick={applyBulkGrade}
                >
                  적용
                </Button>
                <select
                  value={bulkGroup}
                  onChange={(event) => setBulkGroup(event.target.value)}
                  aria-label="일괄 지정할 반"
                  className="min-h-[40px] min-w-0 rounded-xl border border-[#ece0db] bg-white px-2.5 py-1.5 text-base outline-none"
                >
                  <option value="">새 반 일괄 지정</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                  <option value={UNASSIGNED_GROUP}>미배정</option>
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!bulkGroup}
                  onClick={applyBulkGroup}
                >
                  적용
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {selectedStudents.map((student) => {
                const selection = selections[student.studentId];
                return (
                  <div
                    key={student.studentId}
                    className="min-w-0 rounded-2xl border border-[#f0e6e0] bg-white p-3"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-base font-semibold text-[#2d2928]">{student.name}</span>
                      <span className="secondary-text text-[#8a7b77]">
                        {[student.school, gradeDisplay[student.grade]].filter(Boolean).join(" · ")}
                      </span>
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="block min-w-0">
                        <span className="form-label mb-1 block font-semibold text-[#7c6d69]">
                          학년
                        </span>
                        <select
                          value={selection.grade}
                          onChange={(event) =>
                            updateSelection(student.studentId, {
                              grade: event.target.value as StudentGrade,
                            })
                          }
                          aria-label={`${student.name} 새 학년`}
                          className="min-h-[40px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-2.5 py-1.5 text-base outline-none"
                        >
                          {gradeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block min-w-0">
                        <span className="form-label mb-1 block font-semibold text-[#7c6d69]">
                          이동할 기존 반
                        </span>
                        <select
                          value={selection.fromGroupId}
                          onChange={(event) =>
                            updateSelection(student.studentId, { fromGroupId: event.target.value })
                          }
                          disabled={student.groupIds.length === 0}
                          aria-label={`${student.name} 이동할 기존 반`}
                          className="min-h-[40px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-2.5 py-1.5 text-base outline-none disabled:bg-[#f6f2ef] disabled:text-[#a89a95]"
                        >
                          {student.groupIds.length === 0 ? (
                            <option value="">미배정</option>
                          ) : (
                            student.groupIds.map((id) => (
                              <option key={id} value={id}>
                                {groupName(id)}
                              </option>
                            ))
                          )}
                        </select>
                      </label>

                      <label className="block min-w-0 sm:col-span-2">
                        <span className="form-label mb-1 block font-semibold text-[#7c6d69]">
                          새 반
                        </span>
                        <select
                          value={selection.toGroupId}
                          onChange={(event) =>
                            updateSelection(student.studentId, { toGroupId: event.target.value })
                          }
                          aria-label={`${student.name} 새 반`}
                          className="min-h-[40px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-2.5 py-1.5 text-base outline-none"
                        >
                          <option value={KEEP_GROUP}>반 변경 없음</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                          <option value={UNASSIGNED_GROUP}>미배정 (기존 반에서 나가기)</option>
                        </select>
                      </label>
                    </div>

                    {student.groupIds.length > 1 ? (
                      <p className="caption-text mt-1.5 text-[#8a7b77]">
                        다른 소속({student.groupIds
                          .filter((id) => id !== selection.fromGroupId)
                          .map((id) => groupName(id))
                          .join(", ")})은 그대로 유지돼요.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                className="gap-1.5"
                onClick={() => setStep("select")}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden /> 이전
              </Button>
              <Button type="button" className="gap-1.5" onClick={() => setStep("preview")}>
                미리보기 <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "preview" ? (
        <Card>
          <CardContent className="p-4">
            <div className="card-title text-[#2a2323]">변경사항 미리보기</div>
            <p className="secondary-text mt-1 text-[#8a7b77]">
              선택 {summary.selected}명 · 학년 변경 {summary.gradeChanged}명 · 반 이동{" "}
              {summary.groupChanged}명 · 변경 없음 {summary.unchanged}명
            </p>
            <p className="secondary-text mt-1 text-[#8a7b77]">
              적용하면 지금부터 현재 학년과 수업 그룹 소속이 바뀌어요. 지난 수업일지와 출결,
              숙제, 보충, 성장 기록은 변경되지 않아요.
            </p>

            <div className="mt-3 space-y-2">
              {selectedStudents.map((student) => {
                const change = changeByStudent.get(student.studentId);
                return (
                  <div
                    key={student.studentId}
                    className="min-w-0 rounded-2xl border border-[#f0e6e0] bg-white px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-base font-semibold text-[#2d2928]">{student.name}</span>
                      {!change ? (
                        <span className="rounded-full bg-[#f4f1ee] px-2 py-0.5 text-xs font-medium text-[#8a7b77]">
                          변경 없음
                        </span>
                      ) : null}
                    </div>
                    {change ? (
                      <div className="secondary-text mt-1 space-y-0.5 text-[#564d4d]">
                        {change.grade ? (
                          <div>
                            학년: {gradeDisplay[student.grade]} → {gradeDisplay[change.grade]}
                          </div>
                        ) : (
                          <div className="text-[#8a7b77]">학년 변경 없음</div>
                        )}
                        {change.fromGroupId || change.toGroupId ? (
                          <div>
                            반: {groupName(change.fromGroupId)} → {groupName(change.toGroupId)}
                          </div>
                        ) : (
                          <div className="text-[#8a7b77]">반 변경 없음</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {error ? (
              <p role="status" className="mt-3 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                className="gap-1.5"
                onClick={() => setStep("edit")}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden /> 이전
              </Button>
              <Button
                type="button"
                className="gap-1.5"
                disabled={changes.length === 0}
                onClick={() => setConfirmOpen(true)}
              >
                <GraduationCap className="h-4 w-4" aria-hidden />
                {changes.length === 0 ? "변경사항 없음" : `전환 적용 (${changes.length}명)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {confirmOpen ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="학기·학년 전환 적용 확인"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isPending) {
              event.stopPropagation();
              setConfirmOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            <div className="card-title text-[#2a2323]">새 학기 정보를 적용할까요?</div>
            <p className="mt-2 text-sm leading-5 text-[#655d5d]">
              {changes.length}명의 현재 학생 정보와 수업 그룹 소속이 변경돼요.
              <br />
              과거 수업일지와 출결, 숙제, 보충 수업 및 성장 기록은 변경되지 않아요.
            </p>
            {error ? (
              <p role="status" className="mt-2 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={isPending}
                onClick={() => setConfirmOpen(false)}
              >
                취소
              </Button>
              <Button type="button" className="flex-1" disabled={isPending} onClick={runApply}>
                {isPending ? "적용 중…" : "적용"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
