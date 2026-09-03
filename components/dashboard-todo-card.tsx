"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ListTodo } from "lucide-react";

import { togglePreparationItemAction } from "@/app/groups/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { groupIconOf } from "@/lib/group-icons";
import {
  isDatedTodoVisible,
  isTodoWindowOpen,
  kstNowParts,
  type TodoClassWindow,
} from "@/lib/todo-window";

export type DashboardChecklistItem = { id: string; text: string; completed: boolean };

export type DashboardPlanItem = {
  groupId: string;
  groupName: string;
  groupIcon: string | null;
  id: string;
  text: string;
  completed: boolean;
  dueDate: string;
  window: TodoClassWindow | null; // 그 그룹의 오늘 수업 시간 (없으면 all-day)
};

function ToggleRow({
  groupId,
  itemId,
  completed,
  children,
}: {
  groupId: string;
  itemId: string;
  completed: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={togglePreparationItemAction.bind(null, groupId, itemId)}>
      <button
        type="submit"
        aria-pressed={completed}
        className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-left text-[13px] transition hover:bg-[#f2edf9]"
      >
        {completed ? (
          <span
            aria-hidden
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#8fc7ab]"
          >
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </span>
        ) : (
          <span
            aria-hidden
            className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-[#d9c8f0] bg-white"
          />
        )}
        {children}
      </button>
    </form>
  );
}

// Dashboard To do list — 수업 시간 기반 노출.
// 데이터는 서버에서 내려온 그대로 유지하고, client에서는 현재 시각(state)만 갱신해
// window filter를 다시 계산한다 (매분 DB polling 없음).
export function DashboardTodoCard({
  focusGroup,
  checklistItems,
  checklistWindow,
  planItems,
  initialNow,
}: {
  focusGroup: { id: string; name: string } | null;
  checklistItems: DashboardChecklistItem[];
  checklistWindow: TodoClassWindow | null;
  planItems: DashboardPlanItem[];
  initialNow: number; // 서버 렌더 시각 (hydration mismatch 방지 — mount 후 실제 시각으로 갱신)
}) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh(); // mount 직후 실제 브라우저 시각으로 동기화
    const interval = setInterval(refresh, 30_000);
    // iPad PWA background 복귀 시 stale 시각으로 잘못 표시되지 않게 즉시 재평가
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const { today, minutes } = kstNowParts(now);

  // 수동 체크리스트(focus group)는 그 반의 오늘 수업 window 동안만
  const checklistOpen = isTodoWindowOpen(checklistWindow, minutes);
  const visibleChecklist = checklistOpen ? checklistItems : [];
  const visiblePlans = planItems.filter((item) =>
    isDatedTodoVisible(item.dueDate, item.window, today, minutes),
  );

  if (!focusGroup && planItems.length === 0) {
    return null;
  }

  const checklistDone = visibleChecklist.filter((item) => item.completed).length;
  const checklistProgress =
    visibleChecklist.length > 0 ? Math.round((checklistDone / visibleChecklist.length) * 100) : 0;
  const nothingVisible = visibleChecklist.length === 0 && visiblePlans.length === 0;
  const hasHiddenItems = checklistItems.length > 0 || planItems.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-[#3e7d6b]" /> To do list
            {focusGroup ? (
              <span className="text-sm font-normal text-[#8a7b77]">· {focusGroup.name}</span>
            ) : null}
          </CardTitle>
          {visibleChecklist.length > 0 ? (
            <span className="text-xs tabular-nums text-[#8a7b77]">
              {checklistDone} / {visibleChecklist.length}
            </span>
          ) : null}
        </div>
        {visibleChecklist.length > 0 ? (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#f0eae4]">
            <div
              className="h-full rounded-full bg-[#b3a5ec] transition-all duration-300"
              style={{ width: `${checklistProgress}%` }}
            />
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {nothingVisible ? (
          <div className="rounded-2xl bg-[#faf5f0] p-3 text-sm text-[#655d5d]">
            {hasHiddenItems
              ? "준비 항목은 수업 시작 20분 전부터 표시돼요 🍃"
              : "등록된 준비 항목이 없어요 🍃"}
          </div>
        ) : null}

        {visibleChecklist.length > 0 && focusGroup ? (
          <ul className="divide-y divide-dashed divide-[#f4e2e8]">
            {visibleChecklist.map((item) => (
              <li key={item.id}>
                <ToggleRow groupId={focusGroup.id} itemId={item.id} completed={item.completed}>
                  <span
                    className={
                      item.completed
                        ? "text-[#8a7b77] [text-decoration:line-through] opacity-70"
                        : "text-[#2d2928]"
                    }
                  >
                    {item.text}
                  </span>
                </ToggleRow>
              </li>
            ))}
          </ul>
        ) : null}

        {/* 다음 수업 계획 등 dated To Do — 그 반의 수업 window(또는 all-day fallback) 동안만 */}
        {visiblePlans.length > 0 ? (
          <div
            className={
              visibleChecklist.length > 0
                ? "border-t border-dashed border-[#ece4de] pt-2.5"
                : undefined
            }
          >
            <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a7fb8]">
              다음 수업 계획
            </div>
            <ul className="divide-y divide-dashed divide-[#f4e2e8]">
              {visiblePlans.map((item) => (
                <li key={`${item.groupId}:${item.id}`}>
                  <ToggleRow groupId={item.groupId} itemId={item.id} completed={item.completed}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] text-[#8a7b77]">
                        <span aria-hidden>{groupIconOf(item.groupIcon)}</span> {item.groupName}
                        {item.window ? ` · ${item.window.start.slice(0, 5)} 수업` : ""}
                      </span>
                      <span
                        className={
                          item.completed
                            ? "text-[#8a7b77] [text-decoration:line-through] opacity-70"
                            : "text-[#2d2928]"
                        }
                      >
                        {item.text}
                      </span>
                    </span>
                  </ToggleRow>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {focusGroup ? (
          <Link
            href={`/groups/${focusGroup.id}`}
            className="block text-right text-xs text-[#5c4ca8] hover:underline"
          >
            준비 항목 관리 →
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
