"use client";

import { CalendarClock, Plus } from "lucide-react";
import { useState, useTransition } from "react";

import {
  createStudentWeaknessAction,
  deleteStudentWeaknessAction,
  reopenStudentWeaknessAction,
  resolveStudentWeaknessAction,
  updateStudentWeaknessAction,
} from "@/app/students/weakness-actions";
import { WeaknessFormDialog, type WeaknessFormValues } from "@/components/weakness-form-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKoreanDate } from "@/lib/dates";
import type { StudentWeaknessRecord, WeaknessCategory } from "@/lib/supabase/types";
import { weaknessCategoryLabels } from "@/lib/validation/weakness";

// 약점 = 문제 학생처럼 보이지 않게 soft peach/lavender/cream 계열 badge만 사용 (빨간색 금지).
const categoryBadgeClass: Record<WeaknessCategory, string> = {
  grammar: "bg-[#f0ecfb] text-[#54479c]",
  vocabulary: "bg-[#fdf3e4] text-[#8a6828]",
  reading: "bg-[#eef6fb] text-[#3c6478]",
  listening: "bg-[#e9f6ef] text-[#2f6d54]",
  writing: "bg-[#fbeef3] text-[#a05a7c]",
  pronunciation: "bg-[#f6effa] text-[#7a5a92]",
  homework: "bg-[#faf5ee] text-[#8a6f56]",
  other: "bg-[#f4f4f6] text-[#6b6b74]",
};

export function WeaknessCategoryBadge({ category }: { category: WeaknessCategory }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryBadgeClass[category]}`}
    >
      {weaknessCategoryLabels[category]}
    </span>
  );
}

export function StudentWeaknessesCard({
  studentId,
  studentName,
  weaknesses,
  today,
  defaultReviewDueDate,
}: {
  studentId: string;
  studentName: string;
  weaknesses: StudentWeaknessRecord[];
  today: string; // KST "YYYY-MM-DD" — 복습 필요 판정 기준
  // 학생이 속한 반들의 다음 실제 수업일 (시간표가 없으면 "" — 날짜 직접 선택)
  defaultReviewDueDate: string;
}) {
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; weakness: StudentWeaknessRecord }
    | null
  >(null);
  const [dialogError, setDialogError] = useState("");
  const [listError, setListError] = useState("");
  const [isPending, startTransition] = useTransition();
  // 목록의 개별 버튼(확인 완료/다시 열기/삭제)이 진행 중인 record id
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);

  const active = weaknesses.filter((weakness) => weakness.status === "active");
  const resolved = weaknesses.filter((weakness) => weakness.status === "resolved");
  const dueCount = active.filter(
    (weakness) => weakness.review_due_date && weakness.review_due_date <= today,
  ).length;

  const submitDialog = (values: WeaknessFormValues) => {
    if (!dialog) {
      return;
    }

    setDialogError("");
    startTransition(async () => {
      const result =
        dialog.mode === "create"
          ? await createStudentWeaknessAction({
              studentId,
              groupId: "",
              sourceDailyLogId: "",
              category: values.category,
              title: values.title,
              note: values.note,
              reviewDueDate: values.reviewDueDate,
            })
          : await updateStudentWeaknessAction(dialog.weakness.id, studentId, values);

      if ("error" in result) {
        setDialogError(result.error);
        return;
      }

      setDialog(null);
    });
  };

  const runRowAction = (
    weaknessId: string,
    action: () => Promise<{ error: string } | { success: true }>,
  ) => {
    setListError("");
    setPendingRowId(weaknessId);
    startTransition(async () => {
      const result = await action();
      setPendingRowId(null);

      if ("error" in result) {
        setListError(result.error);
      }
    });
  };

  const remove = (weakness: StudentWeaknessRecord) => {
    if (
      !window.confirm(
        `'${weakness.title}' 약점 기록을 삭제할까요?\n\n기록 1건만 삭제되고, 학생 정보는 그대로 남아요.`,
      )
    ) {
      return;
    }

    runRowAction(weakness.id, () => deleteStudentWeaknessAction(weakness.id, studentId));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle>약점 노트</CardTitle>
            {dueCount > 0 ? (
              <span className="flex items-center gap-1 rounded-full bg-[#fdf3e4] px-2.5 py-1 text-[11px] font-medium text-[#94702f]">
                <CalendarClock className="h-3 w-3" /> 복습 필요 {dueCount}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setDialogError("");
              setDialog({ mode: "create" });
            }}
            className="flex min-h-[36px] items-center gap-1 rounded-xl border border-[#ddd0ec] bg-[#f9f5fd] px-3 py-1.5 text-xs font-medium text-[#6d5aa8] transition hover:bg-[#f3ecfa]"
          >
            <Plus className="h-3.5 w-3.5" /> 약점 기록
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {active.length === 0 ? (
          <div className="rounded-2xl bg-[#f8f3ef] p-4 text-sm text-[#655d5d]">
            아직 기록된 약점이 없어요. 수업하다 반복해서 헷갈리는 부분을 적어두면 여기에 모여요.
          </div>
        ) : (
          active.map((weakness) => {
            const isDue = Boolean(
              weakness.review_due_date && weakness.review_due_date <= today,
            );
            const rowPending = isPending && pendingRowId === weakness.id;

            return (
              <div
                key={weakness.id}
                className="rounded-2xl border border-[#eee0dc] bg-[#fffdfb] p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <WeaknessCategoryBadge category={weakness.category} />
                  <span className="min-w-0 text-sm font-medium text-[#2b2323]">
                    {weakness.title}
                  </span>
                  {isDue ? (
                    <span className="rounded-full bg-[#fdf3e4] px-2 py-0.5 text-[10px] font-medium text-[#94702f]">
                      복습 필요
                    </span>
                  ) : null}
                </div>
                {weakness.note ? (
                  <div className="mt-1 text-xs leading-5 text-[#564d4d]">{weakness.note}</div>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-[#8a7b77]">
                  <span>{formatKoreanDate(weakness.created_at.slice(0, 10))} 기록</span>
                  <span>
                    다음 확인{" "}
                    {weakness.review_due_date
                      ? formatKoreanDate(weakness.review_due_date)
                      : "날짜 미정"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={rowPending}
                    onClick={() =>
                      runRowAction(weakness.id, () =>
                        resolveStudentWeaknessAction(weakness.id, studentId),
                      )
                    }
                    className="min-h-[34px] rounded-xl border border-[#cbe0d3] bg-[#edf9f3] px-2.5 py-1 text-xs font-medium text-[#2f6d54] transition hover:bg-[#e2f4ea] disabled:opacity-50"
                  >
                    {rowPending ? "처리 중..." : "확인 완료"}
                  </button>
                  <button
                    type="button"
                    disabled={rowPending}
                    onClick={() => {
                      setDialogError("");
                      setDialog({ mode: "edit", weakness });
                    }}
                    className="min-h-[34px] rounded-xl border border-[#ece0db] bg-white px-2.5 py-1 text-xs font-medium text-[#7c6d69] transition hover:bg-[#faf6f3] disabled:opacity-50"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    disabled={rowPending}
                    onClick={() => remove(weakness)}
                    aria-label={`${weakness.title} 약점 기록 삭제`}
                    className="ml-auto min-h-[34px] rounded-xl px-2 text-xs text-[#a79996] transition hover:bg-[#faf6f3] hover:text-[#7c6d69] disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })
        )}

        {listError ? <p className="text-xs text-[#a2665f]">{listError}</p> : null}

        {resolved.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs text-[#8a8a93]">
              해결된 기록 {resolved.length}건 보기
            </summary>
            <div className="mt-2 space-y-2">
              {resolved.map((weakness) => {
                const rowPending = isPending && pendingRowId === weakness.id;

                return (
                  <div key={weakness.id} className="rounded-2xl bg-[#f8f3ef] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <WeaknessCategoryBadge category={weakness.category} />
                      <span className="min-w-0 text-xs text-[#655d5d] line-through decoration-[#c9beb8]">
                        {weakness.title}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-[#9a8f8a]">
                      {weakness.resolved_at ? (
                        <span>{formatKoreanDate(weakness.resolved_at.slice(0, 10))} 확인 완료</span>
                      ) : null}
                      <button
                        type="button"
                        disabled={rowPending}
                        onClick={() =>
                          runRowAction(weakness.id, () =>
                            reopenStudentWeaknessAction(weakness.id, studentId),
                          )
                        }
                        className="text-[#5c4ca8] hover:underline disabled:opacity-50"
                      >
                        {rowPending ? "처리 중..." : "다시 열기"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}
      </CardContent>

      {dialog ? (
        <WeaknessFormDialog
          heading={dialog.mode === "create" ? "약점 기록" : "약점 수정"}
          studentName={studentName}
          defaultReviewDueDate={dialog.mode === "create" ? defaultReviewDueDate : ""}
          dueDateHint={dialog.mode === "create" ? "다음 수업일로 제안했어요" : undefined}
          initial={
            dialog.mode === "edit"
              ? {
                  category: dialog.weakness.category,
                  title: dialog.weakness.title,
                  note: dialog.weakness.note ?? "",
                  reviewDueDate: dialog.weakness.review_due_date ?? "",
                }
              : undefined
          }
          isPending={isPending}
          error={dialogError}
          onCancel={() => setDialog(null)}
          onSubmit={submitDialog}
        />
      ) : null}
    </Card>
  );
}
