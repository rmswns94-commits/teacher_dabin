"use client";

import { History } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatKoreanDate } from "@/lib/dates";
import type {
  ClassifiedHomework,
  ClassifiedPlan,
  ClassifiedTask,
} from "@/lib/lesson-import";

// [지난 수업에서 가져오기] 다이얼로그 — presentational.
// 후보 분류(importable/conflict/duplicate/incompatible)는 폼이 lib/lesson-import로 계산해
// props로 내려주고, 여기는 어떤 그룹(계획/숙제/할 일)을 가져올지 선택만 받는다.
// [가져오기]를 눌러야만 폼 state가 바뀐다 — 자동 적용/DB 변경/Todo 생성 없음.
export type ImportSelection = { plan: boolean; homework: boolean; tasks: boolean };

const statusStyle: Record<string, { mark: string; markClass: string }> = {
  importable: { mark: "✓", markClass: "text-[#3e7d6b]" },
  conflict: { mark: "!", markClass: "text-[#a2643c]" },
  duplicate: { mark: "–", markClass: "text-[#a79996]" },
  incompatible: { mark: "!", markClass: "text-[#a79996]" },
};

function CandidateRow({
  title,
  text,
  status,
  reason,
}: {
  title: string;
  text?: string;
  status: keyof typeof statusStyle;
  reason: string;
}) {
  const style = statusStyle[status];
  const excluded = status !== "importable";
  return (
    <li className="flex items-start gap-2 rounded-xl bg-white px-2.5 py-1.5">
      <span aria-hidden className={`shrink-0 font-semibold ${style.markClass}`}>
        {style.mark}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`secondary-text block break-words font-medium ${excluded ? "text-[#a79996]" : "text-[#2d2928]"}`}
        >
          {title}
        </span>
        {text ? (
          <span
            className={`caption-text block whitespace-pre-line break-words ${excluded ? "text-[#c0b4b0]" : "text-[#7f6f68]"}`}
          >
            {text}
          </span>
        ) : null}
        {reason ? <span className="caption-text block text-[#a2643c]">{reason}</span> : null}
      </span>
    </li>
  );
}

export function PreviousLessonImportDialog({
  sourceDate,
  plans,
  homework,
  tasks,
  onConfirm,
  onClose,
}: {
  // null = 가져올 이전 Finalized 일지 없음 (버튼은 항상 있고, 여기서 안내만)
  sourceDate: string | null;
  plans: ClassifiedPlan[];
  homework: ClassifiedHomework[];
  tasks: ClassifiedTask[];
  onConfirm: (selection: ImportSelection) => void;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState<ImportSelection>({
    plan: true,
    homework: false,
    tasks: false,
  });

  const importableCount = (list: { status: string }[]) =>
    list.filter((item) => item.status === "importable").length;
  const selectedImportable =
    (selection.plan ? importableCount(plans) : 0) +
    (selection.homework ? importableCount(homework) : 0) +
    (selection.tasks ? importableCount(tasks) : 0);
  const nothingToImport =
    plans.length === 0 && homework.length === 0 && tasks.length === 0;

  const sectionToggle = (
    key: keyof ImportSelection,
    label: string,
    list: { status: string }[],
  ) => (
    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 px-1">
      <input
        type="checkbox"
        checked={selection[key]}
        onChange={() => setSelection((prev) => ({ ...prev, [key]: !prev[key] }))}
        aria-label={label}
        className="h-4.5 w-4.5 shrink-0 accent-[#6d5aa8]"
      />
      <span className="body-text min-w-0 flex-1 font-medium text-[#2d2928]">{label}</span>
      <span className="caption-text shrink-0 tabular-nums text-[#a79996]">
        {importableCount(list)}/{list.length}개 가능
      </span>
    </label>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="지난 수업에서 가져오기"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/30 px-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 text-left shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="card-title flex items-center gap-1.5 text-[#2a2323]">
          <History className="h-4 w-4 text-[#6d5aa8]" aria-hidden /> 지난 수업에서 가져오기
        </div>

        {sourceDate === null ? (
          <div className="secondary-text mt-3 rounded-2xl bg-[#f8f3ef] px-3 py-3 text-[#7f6f68]">
            가져올 이전 수업일지가 없어요.
          </div>
        ) : nothingToImport ? (
          <>
            <p className="secondary-text mt-2 text-[#655d5d]">
              {formatKoreanDate(sourceDate, true)} 수업에서 가져옵니다.
            </p>
            <div className="secondary-text mt-3 rounded-2xl bg-[#f8f3ef] px-3 py-3 text-[#7f6f68]">
              가져올 내용이 없어요.
            </div>
          </>
        ) : (
          <>
            {/* 어느 수업에서 복사하는지 항상 표시 — 잘못된 수업에서 가져오는 실수 방지 */}
            <p className="secondary-text mt-2 text-[#655d5d]">
              {formatKoreanDate(sourceDate, true)} 수업에서 가져옵니다. 가져올 항목을
              선택해주세요.
            </p>

            <div className="mt-3 space-y-3">
              <div className="rounded-2xl bg-[#f5f2ff] p-2.5">
                {sectionToggle("plan", "다음 수업 계획 → 오늘 진도", plans)}
                {plans.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {plans.map((plan) => (
                      <CandidateRow
                        key={`${plan.kind}-${plan.name}`}
                        title={plan.name}
                        text={plan.text}
                        status={plan.status}
                        reason={plan.reason}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="caption-text px-1 pb-1 text-[#a79996]">
                    지난 수업에 적어둔 다음 수업 계획이 없어요.
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-[#fdf6ee] p-2.5">
                {sectionToggle("homework", "지난 숙제 복사", homework)}
                {selection.homework && homework.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {homework.map((item) => (
                      <CandidateRow
                        key={item.sourceId}
                        title={`${item.assignedStudentId ? item.assignedStudentName ?? "대상 학생" : "공통"}${
                          item.school || item.textbook ? ` · ${item.school || item.textbook}` : ""
                        }`}
                        text={item.content}
                        status={item.status}
                        reason={item.reason}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="rounded-2xl bg-[#fbf9ff] p-2.5">
                {sectionToggle("tasks", "지난 해야 할 일 복사", tasks)}
                {selection.tasks && tasks.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {tasks.map((task, index) => (
                      <CandidateRow
                        key={`${task.school}|${task.textbook}|${task.content}|${index}`}
                        title={task.school || task.textbook || "할 일"}
                        text={task.content}
                        status={task.status}
                        reason={task.reason}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <p className="caption-text mt-2 text-[#a79996]">
              이미 작성된 내용은 덮어쓰지 않고, 같은 항목은 다시 가져오지 않아요.
            </p>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          {sourceDate !== null && !nothingToImport ? (
            <Button
              type="button"
              size="sm"
              disabled={selectedImportable === 0}
              onClick={() => onConfirm(selection)}
            >
              가져오기
              {selectedImportable > 0 ? ` (${selectedImportable})` : ""}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
