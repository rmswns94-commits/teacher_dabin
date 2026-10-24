"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { failRetestAction, passRetestAction } from "@/app/retests/actions";
import { RetestAttemptHistory } from "@/components/retest-attempt-history";
import { Button } from "@/components/ui/button";
import { DragGrip, dialogDragHandleClass, useDraggableDialog } from "@/components/ui/draggable-dialog";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { ASSESSMENT_CATEGORIES, validateScorePair, type AssessmentCategory } from "@/lib/assessments";
import { digitsOnly, isComposingEvent } from "@/lib/numeric-input";
import {
  RETEST_AGE_NOTICE_DAYS,
  RETEST_STATUS_LABELS,
  compareActiveRetests,
  isActiveRetest,
  retestAgeDays,
  retestCategoryLabel,
  retestDateLabel,
  summarizeRetests,
} from "@/lib/retests";
import type { RetestView } from "@/lib/supabase/queries/retest-board";
import { cn } from "@/lib/utils";

// 반 상세 — 학생별로 묶은 진행중 재시험.
// - [통과]: 확인창 없이 바로 반영(낙관적), 저장 실패 시 원래대로.
// - [미통과]: 이번 재시험 점수 입력 Dialog → [미통과 저장] 성공 후에만 상태/이력을 반영한다
//   (점수 기록이라 낙관적으로 먼저 보여주지 않는다). [취소]는 아무것도 저장하지 않는다.
// - 종류 filter는 이미 읽은 목록에서만 거른다 (DB 조회 없음).
type Filter = "all" | AssessmentCategory;

type FailDraft = {
  item: RetestView;
  correct: string;
  total: string;
  requestId: string; // 이 Dialog 1회의 저장 요청 id — 같은 요청이 두 번 가도 시도는 1개
  error: { field: "correct" | "total" | null; message: string } | null;
  saving: boolean;
};

export function RetestGroupBoard({
  items: initialItems,
  studentOrder,
  today,
}: {
  items: RetestView[];
  studentOrder: string[];
  today: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const busyRef = useRef(new Set<string>()); // 같은 렌더 안의 연속 클릭도 막는다
  const [failDraft, setFailDraft] = useState<FailDraft | null>(null);
  const failSavingRef = useRef(false); // Enter/더블 클릭이 렌더 전에 두 번 와도 저장 요청은 1번
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = (text: string, tone: "ok" | "error") => {
    setToast({ text, tone });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), tone === "error" ? 5000 : 2500);
  };
  const setBusy = (id: string, busy: boolean) => {
    if (busy) busyRef.current.add(id);
    else busyRef.current.delete(id);
    setBusyIds(new Set(busyRef.current));
  };

  const pass = async (item: RetestView) => {
    if (busyRef.current.has(item.id)) {
      return;
    }
    setBusy(item.id, true);
    setItems((prev) => prev.filter((row) => row.id !== item.id));
    const response = await passRetestAction(item.id).catch(() => ({ error: "재시험 결과를 저장하지 못했어요. 다시 시도해주세요." }));
    if ("error" in response) {
      // rollback — 이 item만 원래대로 (그 사이 다른 item 변경은 유지)
      setItems((prev) => [...prev.filter((row) => row.id !== item.id), item].sort(compareActiveRetests));
      showToast(response.error, "error");
    } else {
      showToast("재시험을 통과 처리했어요.", "ok");
    }
    setBusy(item.id, false);
  };

  const openFail = (item: RetestView) => {
    if (busyRef.current.has(item.id)) {
      return;
    }
    setFailDraft({
      item,
      correct: "",
      // 원래 시험 총 문항을 기본으로 제안 — 재시험 문제 수가 다르면 고치면 된다
      total: item.totalQuestions ? String(item.totalQuestions) : "",
      requestId: globalThis.crypto.randomUUID(),
      error: null,
      saving: false,
    });
  };

  const saveFail = async () => {
    const draft = failDraft;
    if (!draft || draft.saving || failSavingRef.current) {
      return;
    }
    const score = validateScorePair(draft.correct, draft.total);
    if (!score.ok) {
      setFailDraft({ ...draft, error: { field: score.field, message: score.message } });
      return;
    }
    failSavingRef.current = true;
    setFailDraft({ ...draft, saving: true, error: null });
    setBusy(draft.item.id, true);
    const response = await failRetestAction({
      retestId: draft.item.id,
      correctCount: draft.correct,
      totalQuestions: draft.total,
      requestId: draft.requestId,
    }).catch(() => ({ error: "재시험 결과를 저장하지 못했어요. 다시 시도해주세요." }));
    failSavingRef.current = false;
    setBusy(draft.item.id, false);
    if ("error" in response) {
      // 실패: Dialog와 입력값 유지 (아무것도 반영하지 않음)
      setFailDraft((prev) => (prev ? { ...prev, saving: false, error: { field: null, message: response.error } } : prev));
      return;
    }
    const attempt = response.attempt;
    setItems((prev) =>
      prev.map((row) =>
        row.id === draft.item.id
          ? {
              ...row,
              status: "failed",
              attempts: [...row.attempts.filter((existing) => existing.id !== attempt.id), attempt].sort(
                (a, b) => a.attemptNo - b.attemptNo,
              ),
            }
          : row,
      ),
    );
    setFailDraft(null);
    showToast(`미통과 ${attempt.attemptNo}회로 기록했어요. 목록에 계속 남아요.`, "ok");
  };

  const active = items.filter((item) => isActiveRetest(item.status));
  const summary = summarizeRetests(active);
  const visible = filter === "all" ? active : active.filter((item) => item.category === filter);
  const byStudent = new Map<string, RetestView[]>();
  for (const item of visible) {
    byStudent.set(item.studentId, [...(byStudent.get(item.studentId) ?? []), item]);
  }
  const activeCountOf = (studentId: string) => active.filter((item) => item.studentId === studentId).length;
  const students = studentOrder.filter((id) => byStudent.has(id));

  return (
    <div data-retest-board>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="section-title text-[#2b2323]" data-retest-total>
          진행 중 재시험 {summary.retestCount}건
        </span>
        <span className="secondary-text text-[#8a7b77]">학생 {summary.studentCount}명</span>
      </div>

      <div role="group" aria-label="시험 종류" className="mb-4 flex flex-wrap gap-1.5">
        {([{ key: "all", label: "전체", count: summary.retestCount }] as { key: Filter; label: string; count: number }[])
          .concat(
            ASSESSMENT_CATEGORIES.filter((meta) => meta.supportsRetest).map((meta) => ({ key: meta.key, label: meta.label, count: summary.byCategory[meta.key] })),
          )
          .map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              data-retest-filter={option.key}
              onClick={() => setFilter(option.key)}
              className={cn(
                "min-h-10 rounded-xl border px-3.5 py-1.5 text-sm transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c1e8]",
                filter === option.key
                  ? "border-[#c9b9e8] bg-[#f3eefc] font-semibold text-[#5d4ba5]"
                  : "border-[#ece0db] bg-white font-medium text-[#7c6d69] hover:bg-[#faf6f3]",
              )}
            >
              {option.label} {option.count}
            </button>
          ))}
      </div>

      {active.length === 0 ? (
        <div className="rounded-3xl border border-[#efe6f7] bg-white p-8 text-center">
          <p className="text-base font-medium text-[#4d3a3a]">이 반에 진행 중인 재시험이 없어요 ✨</p>
          <Link href="/retests" className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-[#5d4ba5]">
            재시험 관리로 돌아가기
          </Link>
        </div>
      ) : students.length === 0 ? (
        <p className="secondary-text rounded-2xl bg-[#f8f6fc] px-4 py-3 text-[#8a7b77]">이 종류의 진행 중 재시험은 없어요.</p>
      ) : (
        <div className="space-y-4">
          {students.map((studentId) => {
            const list = byStudent.get(studentId)!;
            const name = list[0].studentName;
            return (
              <section
                key={studentId}
                aria-label={`${name} 재시험`}
                data-retest-student={studentId}
                className="rounded-3xl border border-[#efe6f7] bg-white p-3.5 sm:p-4"
              >
                <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-semibold text-[#2b2323]">{name}</span>
                  <span className="text-sm font-medium text-[#5d4ba5]" data-retest-student-count>
                    재시험 {activeCountOf(studentId)}건
                  </span>
                </div>
                <ul className="space-y-2.5">
                  {list.map((item) => {
                    const busy = busyIds.has(item.id);
                    const age = retestAgeDays(item.classDate, today);
                    const category = retestCategoryLabel(item.category);
                    return (
                      <li
                        key={item.id}
                        data-retest-item={item.id}
                        data-retest-status={item.status}
                        className="space-y-2.5 rounded-2xl bg-[#faf8fd] p-3"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-[#f3eefc] px-2.5 py-0.5 text-sm font-semibold text-[#5d4ba5]">
                                {category}
                              </span>
                              <span
                                className={cn(
                                  "text-sm font-medium tabular-nums",
                                  age >= RETEST_AGE_NOTICE_DAYS ? "text-[#a2643c]" : "text-[#564d4d]",
                                )}
                              >
                                {retestDateLabel(item.classDate)}
                                {age >= RETEST_AGE_NOTICE_DAYS ? ` · ${age}일째` : ""}
                              </span>
                              <span
                                data-retest-status-badge
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                                  item.status === "failed"
                                    ? "bg-[#fdf3e4] text-[#8a6828]"
                                    : "bg-[#f2f0ee] text-[#655a56]",
                                )}
                              >
                                {RETEST_STATUS_LABELS[item.status]}
                              </span>
                            </div>
                            <div className="secondary-text text-[#564d4d]">
                              <span className="text-[#8a7b77]">해당 수업 진도 </span>
                              <span className="whitespace-pre-line break-words">{item.progress ?? "진도 정보 없음"}</span>
                            </div>
                            {item.correctCount !== null && item.totalQuestions ? (
                              <div className="secondary-text tabular-nums text-[#564d4d]">
                                <span className="text-[#8a7b77]">기존 시험 </span>
                                {item.correctCount} / {item.totalQuestions}
                              </div>
                            ) : item.totalQuestions ? (
                              <div className="secondary-text text-[#8a7b77]">{item.totalQuestions}문제 시험</div>
                            ) : null}
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#8a7b77]">
                              {item.moved && item.sourceGroupName ? <span>{item.sourceGroupName}에서 등록</span> : null}
                              {item.dailyLogId ? (
                                <Link href={`/daily-logs/${item.dailyLogId}`} className="font-medium text-[#5d4ba5] underline-offset-2 hover:underline">
                                  수업일지 보기
                                </Link>
                              ) : null}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 md:w-52 md:shrink-0">
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`${name} ${category} ${retestDateLabel(item.classDate)} 재시험 통과`}
                              onClick={() => pass(item)}
                              className="min-h-11 rounded-xl border border-[#bfe3d2] bg-[#edf9f3] px-3 text-sm font-semibold text-[#2f6d54] transition hover:bg-[#e2f4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9fd3bb] disabled:opacity-50"
                            >
                              통과
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              aria-haspopup="dialog"
                              aria-label={`${name} ${category} ${retestDateLabel(item.classDate)} 재시험 미통과 — 점수 입력`}
                              onClick={() => openFail(item)}
                              className="min-h-11 rounded-xl border border-[#ecd9b4] bg-white px-3 text-sm font-semibold text-[#8a6828] transition hover:bg-[#fdf6ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c98f] disabled:opacity-50"
                            >
                              미통과
                            </button>
                          </div>
                        </div>
                        <RetestAttemptHistory attempts={item.attempts} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {failDraft ? (
        <RetestFailDialog
          draft={failDraft}
          onChange={(patch) => setFailDraft((prev) => (prev ? { ...prev, ...patch, error: null } : prev))}
          onCancel={() => (failDraft.saving ? undefined : setFailDraft(null))}
          onSave={saveFail}
        />
      ) : null}

      {toast ? (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          className={cn(
            "fixed bottom-6 left-1/2 z-[75] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl px-4 py-2.5 text-sm text-white shadow-lg",
            toast.tone === "error" ? "bg-[#9c463d]/95" : "bg-[#2b2323]/90",
          )}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

// [미통과] 점수 입력 Dialog — 공용 draggable dialog (Desktop/iPad drag, 모바일은 drag 없음, 본문 scroll).
// 입력값은 board state에 있고 이 컴포넌트는 열려 있는 동안 remount되지 않는다.
function RetestFailDialog({
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  draft: FailDraft;
  onChange: (patch: Partial<Pick<FailDraft, "correct" | "total">>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { attachPanel, handleProps } = useDraggableDialog();
  const item = draft.item;
  const category = retestCategoryLabel(item.category);
  const nextNo = item.attempts.length + 1;
  const fieldError = (field: "correct" | "total") => (draft.error?.field === field ? draft.error.message : null);
  const numberInput = (field: "correct" | "total", label: string, id: string) => (
    <label className="block min-w-0" htmlFor={id}>
      <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">{label}</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={draft[field]}
        onChange={(event) =>
          onChange({ [field]: isComposingEvent(event) ? event.target.value : digitsOnly(event.target.value) })
        }
        onCompositionEnd={(event) => onChange({ [field]: digitsOnly(event.currentTarget.value) })}
        aria-invalid={fieldError(field) ? true : undefined}
        aria-describedby={fieldError(field) ? "retest-fail-error" : undefined}
        className={cn(
          "w-full min-w-0 rounded-2xl border bg-[#fffdfb] px-3 py-2.5 text-center text-lg tabular-nums outline-none",
          fieldError(field) ? "border-[#e8b4ad] focus:border-[#d98c82]" : "border-[#ece0db] focus:border-[#c9b9e8]",
        )}
      />
    </label>
  );

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/30 px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="retest-fail-title"
        data-retest-fail-dialog
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            return;
          }
          if (event.key === "Escape") {
            onCancel();
          }
          if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
            event.preventDefault();
            onSave();
          }
        }}
      >
        <div
          ref={attachPanel}
          className="max-h-[calc(100dvh-3rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]"
        >
          <div {...handleProps} id="retest-fail-title" className={`card-title flex items-center gap-2 text-[#2a2323] ${dialogDragHandleClass}`}>
            <DragGrip />
            {item.studentName} · {category} 재시험
          </div>
          <p className="secondary-text mt-1 whitespace-pre-line break-words text-[#7c6d69]">
            {retestDateLabel(item.classDate)} 수업 · {item.progress ?? "진도 정보 없음"}
          </p>
          {item.correctCount !== null && item.totalQuestions ? (
            <p className="mt-0.5 text-sm tabular-nums text-[#8a7b77]">기존 시험 {item.correctCount} / {item.totalQuestions}</p>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            {numberInput("correct", "맞은 개수", "retest-fail-correct")}
            {numberInput("total", "총 문항", "retest-fail-total")}
          </div>
          <p className="mt-2 text-xs text-[#a79996]">
            미통과 {nextNo}회로 기록돼요. 총 문항은 원래 시험 기준으로 채워져 있어요 — 재시험 문제 수가 다르면 고쳐주세요.
          </p>
          {draft.error ? (
            <p id="retest-fail-error" role="alert" className="mt-3 rounded-2xl bg-[#fdf1f0] px-3 py-2.5 text-sm text-[#a05252]">
              {draft.error.message}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={draft.saving} onClick={onCancel}>
              취소
            </Button>
            <Button type="button" disabled={draft.saving} onClick={onSave}>
              {draft.saving ? "저장 중..." : "미통과 저장"}
            </Button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
