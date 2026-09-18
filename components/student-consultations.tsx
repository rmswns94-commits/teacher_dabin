"use client";

import { Plus, SquarePen, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import {
  createConsultationAction,
  deleteConsultationAction,
  updateConsultationAction,
} from "@/app/students/consultation-actions";
import { TimeSelect } from "@/components/time-select";
import { ConfirmDiscardDialog, useBeforeUnloadWarning } from "@/components/unsaved-guard";
import { Button } from "@/components/ui/button";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import {
  CONSULTATION_CONTENT_MAX,
  CONSULTATION_FOLLOW_UP_MAX,
  CONSULTATION_SUMMARY_MAX,
  consultationMethodLabels,
  consultationMethodValues,
  consultationTargetLabels,
  consultationTargetValues,
  type ConsultationMethod,
  type ConsultationTarget,
} from "@/lib/validation/consultation";
import { cn } from "@/lib/utils";

// 학생/학부모 상담 기록 — 학생 상세의 [상담 기록] 탭.
// 저장/수정/조회만 한다: 할 일·알림·리마인더를 만들지 않는다.
// 입력 중에는 값을 다듬지 않는다 (한글 조합이 끊기지 않게) — trim은 저장할 때 서버가 한다.

export type ConsultationItem = {
  id: string;
  consultationDate: string;
  consultationTime: string | null; // "HH:MM" (없으면 null)
  target: ConsultationTarget;
  method: ConsultationMethod;
  summary: string;
  content: string;
  followUpNote: string | null;
};

type FormValues = {
  consultationDate: string;
  consultationTime: string;
  target: ConsultationTarget;
  method: ConsultationMethod;
  summary: string;
  content: string;
  followUpNote: string;
};

const TARGET_BADGE: Record<ConsultationTarget, string> = {
  student: "bg-[#f3eefa] text-[#5c4ca8]",
  parent: "bg-[#fdf3e4] text-[#94702f]",
};

function emptyValues(): FormValues {
  return {
    consultationDate: todayDateString(),
    consultationTime: "",
    target: "student",
    method: "in_person",
    summary: "",
    content: "",
    followUpNote: "",
  };
}

function valuesOf(item: ConsultationItem): FormValues {
  return {
    consultationDate: item.consultationDate,
    consultationTime: item.consultationTime ?? "",
    target: item.target,
    method: item.method,
    summary: item.summary,
    content: item.content,
    followUpNote: item.followUpNote ?? "",
  };
}

function ConsultationFormDialog({
  studentName,
  mode,
  initial,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  studentName: string;
  mode: "create" | "edit";
  initial: FormValues;
  isPending: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const isDirty = (Object.keys(initial) as (keyof FormValues)[]).some(
    (key) => values[key] !== initial[key],
  );

  useBeforeUnloadWarning(isDirty);

  const requestClose = () => {
    if (isPending) {
      return;
    }
    if (isDirty) {
      setConfirmOpen(true);
      return;
    }
    onCancel();
  };

  const canSave = values.summary.trim().length > 0 && values.content.trim().length > 0;
  const label = mode === "create" ? "상담 기록 추가" : "상담 기록 수정";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={(event) => {
        // 한글 조합 중 Escape가 입력을 끊지 않게 한다
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
        <div className="card-title text-[#2a2323]">{label}</div>
        <p className="mt-1 text-sm text-[#8a7b77]">{studentName} 학생의 상담 기록이에요.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">상담 날짜</span>
            <input
              type="date"
              value={values.consultationDate}
              onChange={(event) => set("consultationDate", event.target.value)}
              aria-label="상담 날짜"
              className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none focus:border-[#e3b9c9]"
            />
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">상담 시간 (선택)</span>
            <TimeSelect
              value={values.consultationTime}
              onChange={(next) => set("consultationTime", next)}
              ariaLabel="상담 시간"
              allowEmpty
              emptyLabel="시간 모름"
              className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none"
            />
          </label>
        </div>

        <div className="mt-3">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">상담 대상</span>
          <div className="flex flex-wrap gap-1.5">
            {consultationTargetValues.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={values.target === value}
                onClick={() => set("target", value)}
                className={cn(
                  "min-h-10 rounded-xl px-3.5 py-2 text-sm font-medium transition",
                  values.target === value
                    ? "bg-[#f3eefa] text-[#5c4ca8]"
                    : "bg-white text-[#8a7b77] ring-1 ring-[#ece0db] hover:text-[#564d4d]",
                )}
              >
                {consultationTargetLabels[value]}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">상담 방식</span>
          <select
            value={values.method}
            onChange={(event) => set("method", event.target.value as ConsultationMethod)}
            aria-label="상담 방식"
            className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none"
          >
            {consultationMethodValues.map((value) => (
              <option key={value} value={value}>
                {consultationMethodLabels[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">상담 요약</span>
          <input
            value={values.summary}
            onChange={(event) => set("summary", event.target.value)}
            maxLength={CONSULTATION_SUMMARY_MAX}
            placeholder="최근 숙제 미완료 관련 상담"
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none focus:border-[#e3b9c9]"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">상담 내용</span>
          <textarea
            value={values.content}
            onChange={(event) => set("content", event.target.value)}
            rows={6}
            maxLength={CONSULTATION_CONTENT_MAX}
            placeholder={"어떤 이야기를 나눴는지 적어주세요.\n여러 줄로 적어도 그대로 저장돼요."}
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base leading-6 outline-none focus:border-[#e3b9c9]"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">후속 메모 (선택)</span>
          <textarea
            value={values.followUpNote}
            onChange={(event) => set("followUpNote", event.target.value)}
            rows={3}
            maxLength={CONSULTATION_FOLLOW_UP_MAX}
            placeholder="다음 주 숙제 수행 여부 확인"
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base leading-6 outline-none focus:border-[#e3b9c9]"
          />
          <span className="secondary-text mt-1 block text-[#a79996]">
            메모만 남습니다. 할 일이나 알림은 만들지 않아요.
          </span>
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
            disabled={isPending || !canSave}
            onClick={() => onSubmit(values)}
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

function ConsultationDetailDialog({
  item,
  studentName,
  isPending,
  error,
  onClose,
  onEdit,
  onDelete,
}: {
  item: ConsultationItem;
  studentName: string;
  isPending: boolean;
  error: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="상담 기록 상세"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isPending) {
          onClose();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="card-title tabular-nums text-[#2a2323]">
          {formatKoreanDate(item.consultationDate, true)}
          {item.consultationTime ? ` ${item.consultationTime}` : ""}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", TARGET_BADGE[item.target])}>
            {consultationTargetLabels[item.target]}
          </span>
          <span className="rounded-full bg-[#f5f1eb] px-2 py-0.5 text-xs font-semibold text-[#6f625f]">
            {consultationMethodLabels[item.method]}
          </span>
          <span className="secondary-text text-[#8a7b77]">{studentName}</span>
        </div>

        <div className="mt-4">
          <div className="secondary-text font-semibold text-[#8a7b77]">상담 요약</div>
          <p className="whitespace-pre-wrap break-words text-sm text-[#2b2323]">{item.summary}</p>
        </div>

        <div className="mt-3">
          <div className="secondary-text font-semibold text-[#8a7b77]">상담 내용</div>
          <p className="whitespace-pre-wrap break-words text-sm text-[#33333b]">{item.content}</p>
        </div>

        {item.followUpNote ? (
          <div className="mt-3">
            <div className="secondary-text font-semibold text-[#8a7b77]">후속 메모</div>
            <p className="whitespace-pre-wrap break-words text-sm text-[#33333b]">{item.followUpNote}</p>
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mr-auto gap-1.5 text-[#a2564d]"
            disabled={isPending}
            aria-label="상담 기록 삭제"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> 삭제
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
            닫기
          </Button>
          <Button type="button" size="sm" className="gap-1.5" disabled={isPending} onClick={onEdit}>
            <SquarePen className="h-3.5 w-3.5" aria-hidden /> 수정
          </Button>
        </div>
      </div>

      {confirmDelete ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="상담 기록 삭제 확인"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isPending) {
              setConfirmDelete(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            <div className="text-lg font-semibold text-[#2a2323]">이 상담 기록을 삭제할까요?</div>
            <p className="mt-3 text-sm leading-5 text-[#7f5d57]">
              삭제하면 복구할 수 없어요. 학생 정보와 수업 기록은 그대로예요.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => setConfirmDelete(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={onDelete}
                className="gap-1.5 bg-[#a2564d] text-white hover:bg-[#8f4a42]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {isPending ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StudentConsultations({
  studentId,
  studentName,
  items,
}: {
  studentId: string;
  studentName: string;
  items: ConsultationItem[];
}) {
  const [mode, setMode] = useState<"none" | "create" | "edit" | "detail">("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const busyRef = useRef(false);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  const run = (task: () => Promise<{ error: string } | { success: true }>, done: () => void) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await task();
        if ("error" in result) {
          setError(result.error);
          return;
        }
        done();
      } finally {
        busyRef.current = false;
      }
    });
  };

  const closeAll = () => {
    setMode("none");
    setSelectedId(null);
    setError("");
  };

  const showNotice = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 2500);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="card-title text-[#2d2928]">상담 기록 {items.length}건</h2>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setError("");
            setSelectedId(null);
            setMode("create");
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> 상담 기록 추가
        </Button>
      </div>

      {notice ? (
        <p role="status" className="mb-3 text-sm text-[#3d7f64]">
          {notice}
        </p>
      ) : null}
      {error && mode === "none" ? (
        <p role="status" className="mb-3 text-sm text-[#a05252]">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-[#f0e8e4] bg-[#fdfbf8] px-4 py-8 text-center text-sm text-[#8a7b77]">
          아직 상담 기록이 없어요.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li
              key={item.id}
              data-consultation-item
              className="min-w-0 rounded-2xl border border-[#f0e8e4] bg-white/90 px-3.5 py-3"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold tabular-nums text-[#2d2928]">
                  {formatKoreanDate(item.consultationDate)}
                  {item.consultationTime ? ` ${item.consultationTime}` : ""}
                </span>
                <span
                  className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", TARGET_BADGE[item.target])}
                >
                  {consultationTargetLabels[item.target]}
                </span>
                <span className="rounded-full bg-[#f5f1eb] px-2 py-0.5 text-xs font-semibold text-[#6f625f]">
                  {consultationMethodLabels[item.method]}
                </span>
              </div>

              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm font-medium text-[#2b2323]">
                {item.summary}
              </p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-[#564d4d]">
                {item.content}
              </p>

              {item.followUpNote ? (
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-[#33333b]">
                  <span className="secondary-text font-semibold text-[#8a7b77]">후속 메모 </span>
                  {item.followUpNote}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label={`${formatKoreanDate(item.consultationDate)} 상담 기록 상세 보기`}
                  onClick={() => {
                    setError("");
                    setSelectedId(item.id);
                    setMode("detail");
                  }}
                >
                  상세 보기
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  aria-label={`${formatKoreanDate(item.consultationDate)} 상담 기록 수정`}
                  onClick={() => {
                    setError("");
                    setSelectedId(item.id);
                    setMode("edit");
                  }}
                >
                  <SquarePen className="h-3.5 w-3.5" aria-hidden /> 수정
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mode === "create" ? (
        <ConsultationFormDialog
          studentName={studentName}
          mode="create"
          initial={emptyValues()}
          isPending={isPending}
          error={error}
          onCancel={closeAll}
          onSubmit={(values) =>
            run(
              () => createConsultationAction(studentId, values),
              () => {
                closeAll();
                showNotice("상담 기록을 저장했어요.");
              },
            )
          }
        />
      ) : null}

      {mode === "edit" && selected ? (
        <ConsultationFormDialog
          studentName={studentName}
          mode="edit"
          initial={valuesOf(selected)}
          isPending={isPending}
          error={error}
          onCancel={closeAll}
          onSubmit={(values) =>
            run(
              () => updateConsultationAction(selected.id, values),
              () => {
                closeAll();
                showNotice("상담 기록을 수정했어요.");
              },
            )
          }
        />
      ) : null}

      {mode === "detail" && selected ? (
        <ConsultationDetailDialog
          item={selected}
          studentName={studentName}
          isPending={isPending}
          error={error}
          onClose={closeAll}
          onEdit={() => setMode("edit")}
          onDelete={() =>
            run(
              () => deleteConsultationAction(selected.id),
              () => {
                closeAll();
                showNotice("상담 기록을 삭제했어요.");
              },
            )
          }
        />
      ) : null}
    </div>
  );
}
