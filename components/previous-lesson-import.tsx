"use client";

import { History } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatShortMonthDay } from "@/lib/dates";
import type {
  ClassifiedHomework,
  ClassifiedPlan,
  ClassifiedTask,
} from "@/lib/lesson-import";

// [지난 수업에서 가져오기] 다이얼로그 — presentational.
// 후보는 "현재 수업일(lesson_date)로 예정된 항목"(같은 그룹 과거 Finalized의 날짜 일치 항목)이며,
// 분류(importable/conflict/duplicate/incompatible)는 폼이 lib/lesson-import로 계산해 props로 내려준다.
// 여기는 어떤 섹션(오늘 진도/숙제/할 일/날짜 미지정 계획)을 가져올지 선택만 받는다.
// [가져오기]를 눌러야만 폼 state가 바뀐다 — 자동 적용/DB 변경/Todo 생성 없음.
export type ImportSelection = { plan: boolean; homework: boolean; tasks: boolean; legacy: boolean };

const statusStyle: Record<string, { mark: string; markClass: string }> = {
  importable: { mark: "✓", markClass: "text-[#3e7d6b]" },
  conflict: { mark: "!", markClass: "text-[#a2643c]" },
  duplicate: { mark: "–", markClass: "text-[#a79996]" },
  incompatible: { mark: "!", markClass: "text-[#a79996]" },
};

// "9월 17일" — 저장된 YYYY-MM-DD에서 표시만 만든다 (라벨을 다시 파싱해 날짜를 판정하지 않는다)
function monthDayLabel(ymd: string) {
  const [, m, d] = ymd.split("-").map(Number);
  return m && d ? `${m}월 ${d}일` : ymd;
}

function CandidateRow({
  title,
  text,
  caption,
  status,
  reason,
}: {
  title: string;
  text?: string;
  caption?: string;
  status: keyof typeof statusStyle;
  reason: string;
}) {
  const style = statusStyle[status];
  const excluded = status !== "importable";
  return (
    <li className="flex items-start gap-2 rounded-xl bg-white px-2.5 py-1.5" data-import-status={status}>
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
        {caption ? <span className="caption-text block text-[#a79996]">{caption}</span> : null}
        {reason ? <span className="caption-text block text-[#a2643c]">{reason}</span> : null}
      </span>
    </li>
  );
}

export function PreviousLessonImportDialog({
  lessonDate,
  loading,
  error,
  plans,
  homework,
  tasks,
  legacyPlans,
  legacySourceDate,
  onConfirm,
  onClose,
}: {
  // 현재 폼의 수업일 — 후보는 이 날짜로 예정된 항목뿐
  lessonDate: string;
  loading: boolean;
  error: string | null;
  plans: ClassifiedPlan[];
  homework: ClassifiedHomework[];
  tasks: ClassifiedTask[];
  // dated 계획 후보가 없을 때만 — 직전 Finalized의 날짜 미지정 계획 (secondary)
  legacyPlans: ClassifiedPlan[];
  legacySourceDate: string | null;
  onConfirm: (selection: ImportSelection) => void;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState<ImportSelection>({
    plan: true,
    homework: false,
    tasks: false,
    legacy: true,
  });

  const importableCount = (list: { status: string }[]) =>
    list.filter((item) => item.status === "importable").length;
  const selectedImportable =
    (selection.plan ? importableCount(plans) : 0) +
    (selection.homework ? importableCount(homework) : 0) +
    (selection.tasks ? importableCount(tasks) : 0) +
    (selection.legacy ? importableCount(legacyPlans) : 0);
  const hasDated = plans.length > 0 || homework.length > 0 || tasks.length > 0;
  const nothingToImport = !hasDated && legacyPlans.length === 0;
  const dateLabel = monthDayLabel(lessonDate);
  const sourceCaption = (date: string) => `${formatShortMonthDay(date)} 수업에서`;

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

  const planRows = (list: ClassifiedPlan[]) => (
    <ul className="mt-1 space-y-1">
      {list.map((plan) => (
        <CandidateRow
          key={plan.id}
          title={plan.name}
          text={plan.text}
          caption={sourceCaption(plan.sourceLessonDate)}
          status={plan.status}
          reason={plan.reason}
        />
      ))}
    </ul>
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

        {loading ? (
          <div className="secondary-text mt-3 rounded-2xl bg-[#f8f3ef] px-3 py-3 text-[#7f6f68]" role="status">
            {dateLabel}로 예정된 항목을 찾는 중...
          </div>
        ) : error ? (
          <div className="secondary-text mt-3 rounded-2xl bg-[#fff0ef] px-3 py-3 text-[#a26660]" role="alert">
            {error}
          </div>
        ) : (
          <>
            {/* 왜 이 항목들이 나왔는지 — 현재 수업일로 예정(저장된 날짜 일치)된 항목만 */}
            <p className="secondary-text mt-2 text-[#655d5d]" data-import-summary>
              {hasDated
                ? `${dateLabel}에 예정된 항목이에요. 가져올 항목을 선택해주세요.`
                : `${dateLabel}로 예정된 항목이 없어요.`}
            </p>

            {hasDated ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-2xl bg-[#f5f2ff] p-2.5" data-import-section="plan">
                  {sectionToggle("plan", "오늘 진도로 가져오기", plans)}
                  {plans.length > 0 ? (
                    planRows(plans)
                  ) : (
                    <p className="caption-text px-1 pb-1 text-[#a79996]">이 날짜로 적어둔 다음 수업 계획이 없어요.</p>
                  )}
                </div>

                <div className="rounded-2xl bg-[#fdf6ee] p-2.5" data-import-section="homework">
                  {sectionToggle("homework", "숙제로 가져오기", homework)}
                  {homework.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {homework.map((item) => (
                        <CandidateRow
                          key={item.sourceId}
                          title={`${item.assignedStudentId ? item.assignedStudentName ?? "대상 학생" : "공통"}${
                            item.school || item.textbook ? ` · ${item.school || item.textbook}` : ""
                          }`}
                          text={item.content}
                          caption={`${sourceCaption(item.sourceLessonDate)} · ${formatShortMonthDay(item.dueDate)} 마감`}
                          status={item.status}
                          reason={item.reason}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="caption-text px-1 pb-1 text-[#a79996]">이 날짜가 마감인 지난 숙제가 없어요.</p>
                  )}
                </div>

                <div className="rounded-2xl bg-[#fbf9ff] p-2.5" data-import-section="tasks">
                  {sectionToggle("tasks", "해야 할 일로 가져오기", tasks)}
                  {tasks.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {tasks.map((task) => (
                        <CandidateRow
                          key={task.id}
                          title={task.school || task.textbook || "할 일"}
                          text={task.content}
                          caption={`${sourceCaption(task.sourceLessonDate)} · ${formatShortMonthDay(task.dueDate)}`}
                          status={task.status}
                          reason={task.reason}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="caption-text px-1 pb-1 text-[#a79996]">이 날짜로 적어둔 지난 해야 할 일이 없어요.</p>
                  )}
                </div>
              </div>
            ) : null}

            {/* 날짜 미지정 legacy 계획 — dated 후보가 없을 때만 secondary로 (다른 날짜로 예정된 항목은 여기 없음) */}
            {legacyPlans.length > 0 ? (
              <div className="mt-3 rounded-2xl bg-[#f8f3ef] p-2.5" data-import-section="legacy">
                {sectionToggle(
                  "legacy",
                  `직전 수업의 날짜 미지정 계획${legacySourceDate ? ` (${formatShortMonthDay(legacySourceDate)})` : ""}`,
                  legacyPlans,
                )}
                {planRows(legacyPlans)}
              </div>
            ) : null}

            {!nothingToImport ? (
              <p className="caption-text mt-2 text-[#a79996]">
                이미 작성된 내용은 덮어쓰지 않고, 같은 항목은 다시 가져오지 않아요.
              </p>
            ) : null}
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          {!loading && !error && !nothingToImport ? (
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
