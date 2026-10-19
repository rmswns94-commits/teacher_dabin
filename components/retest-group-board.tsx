"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { setRetestResultAction } from "@/app/retests/actions";
import { ASSESSMENT_CATEGORIES, type AssessmentCategory } from "@/lib/assessments";
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

// 반 상세 — 학생별로 묶은 진행중 재시험. [통과]/[미통과]는 확인창 없이 바로 반영(낙관적)하고,
// 저장에 실패하면 원래 상태로 되돌린다. 종류 filter는 이미 읽은 목록에서만 거른다 (DB 조회 없음).
type Filter = "all" | AssessmentCategory;

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

  const run = async (item: RetestView, result: "passed" | "failed") => {
    if (busyRef.current.has(item.id)) {
      return;
    }
    setBusy(item.id, true);
    if (result === "passed") {
      setItems((prev) => prev.filter((row) => row.id !== item.id));
    } else {
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, status: "failed" } : row)));
    }
    const response = await setRetestResultAction(item.id, result).catch(() => ({ error: "재시험 결과를 저장하지 못했어요. 다시 시도해주세요." }));
    if ("error" in response) {
      // rollback — 이 item만 원래대로 (그 사이 다른 item 변경은 유지)
      setItems((prev) =>
        [...prev.filter((row) => row.id !== item.id), item].sort(compareActiveRetests),
      );
      showToast(response.error, "error");
    } else {
      showToast(result === "passed" ? "재시험을 통과 처리했어요." : "미통과로 표시했어요. 목록에 계속 남아요.", "ok");
    }
    setBusy(item.id, false);
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
          .concat(ASSESSMENT_CATEGORIES.map((meta) => ({ key: meta.key, label: meta.label, count: summary.byCategory[meta.key] })))
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
                        className="flex flex-col gap-3 rounded-2xl bg-[#faf8fd] p-3 md:flex-row md:items-start"
                      >
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
                            onClick={() => run(item, "passed")}
                            className="min-h-11 rounded-xl border border-[#bfe3d2] bg-[#edf9f3] px-3 text-sm font-semibold text-[#2f6d54] transition hover:bg-[#e2f4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9fd3bb] disabled:opacity-50"
                          >
                            통과
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`${name} ${category} ${retestDateLabel(item.classDate)} 재시험 미통과`}
                            onClick={() => run(item, "failed")}
                            className="min-h-11 rounded-xl border border-[#ecd9b4] bg-white px-3 text-sm font-semibold text-[#8a6828] transition hover:bg-[#fdf6ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c98f] disabled:opacity-50"
                          >
                            미통과
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

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
