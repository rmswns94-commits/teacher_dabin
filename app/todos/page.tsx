import Link from "next/link";
import { Check, ListChecks } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { TodayRefresher } from "@/components/today-refresher";
import { TodoCreateDialog } from "@/components/todo-create-dialog";
import { TodoDeleteButton } from "@/components/todo-delete-button";
import { Card, CardContent } from "@/components/ui/card";
import { togglePreparationItemAction } from "@/app/groups/actions";
import { dayOfWeekOf } from "@/lib/calendar";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { groupIconOf } from "@/lib/group-icons";
import { activePreparationItems } from "@/lib/preparation";
import { formatTimeRange } from "@/lib/schedule";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import type { PreparationItem } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

// 오늘 할 일 = "완료할 때까지 놓치지 않는 작업함".
// Dashboard(수업 시간 20분 전~종료의 실시간 상황판)와 같은 preparation row를 쓰고
// 필터만 다르다: 미완료 + (무날짜 수동 항목 또는 due가 오늘 이하). 미래 항목은 그 날짜부터.
// 수업이 끝나 Dashboard에서 숨어도, 날짜가 지나도, 완료/삭제 전까지 여기 남는다.

type TodayTodoItem = {
  item: PreparationItem;
  isPastDue: boolean;
};

export default async function TodayTodosPage() {
  const today = todayDateString();
  const todayDow = dayOfWeekOf(today);

  // 그룹(준비 항목/아이콘)+시간표 — 2쿼리 batch, 항목별 반복 쿼리 없음
  const [groups, schedules] = await Promise.all([
    getCurrentUserGroups(),
    getCurrentUserSchedulesWithGroup(),
  ]);

  // 그룹별 오늘 수업 시간 (표시/정렬용 — 노출 제한에는 쓰지 않는다)
  const todayTimeByGroup = new Map<string, { start: string; end: string }>();
  for (const row of schedules) {
    if (row.day_of_week !== todayDow) {
      continue;
    }
    const current = todayTimeByGroup.get(row.group_id);
    todayTimeByGroup.set(row.group_id, {
      start: !current || row.start_time < current.start ? row.start_time : current.start,
      end: !current || row.end_time > current.end ? row.end_time : current.end,
    });
  }

  const sections = groups
    .filter((group) => !group.archived)
    .map((group) => {
      const items: TodayTodoItem[] = activePreparationItems(group.preparation_items)
        .filter(
          (item) => !item.completed && (!item.dueDate || item.dueDate <= today),
        )
        .map((item) => ({
          item,
          isPastDue: Boolean(item.dueDate && item.dueDate < today),
        }))
        // 지난 할 일 먼저(날짜 오름차순) → 오늘 → 무날짜 수동 항목(등록 순)
        .sort((a, b) => {
          const keyA = a.item.dueDate ?? "9999-12-31";
          const keyB = b.item.dueDate ?? "9999-12-31";
          return keyA.localeCompare(keyB);
        });

      return { group, items, time: todayTimeByGroup.get(group.id) ?? null };
    })
    .filter((section) => section.items.length > 0)
    .sort((a, b) => {
      // 오늘 수업 있는 그룹(시작 시간순) → 나머지(가나다순)
      const timeA = a.time?.start ?? "99:99";
      const timeB = b.time?.start ?? "99:99";
      return timeA.localeCompare(timeB) || a.group.name.localeCompare(b.group.name, "ko");
    });

  const totalCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  const pastDueCount = sections.reduce(
    (sum, section) => sum + section.items.filter((entry) => entry.isPastDue).length,
    0,
  );

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <TodayRefresher />
          <PageHeader
            title="오늘 할 일"
            description={`${formatKoreanDate(today, true)} · 오늘 해야 할 일과 아직 완료하지 않은 할 일을 확인해요.`}
            action={
              <TodoCreateDialog
                groups={groups
                  .filter((group) => !group.archived)
                  .map((group) => ({ id: group.id, name: group.name, icon: group.icon ?? null }))}
                defaultDate={today}
              />
            }
          />

          {totalCount > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-[#655d5d]">
              <span className="rounded-full bg-[#efe8fb] px-2.5 py-1 text-xs font-medium tabular-nums text-[#5d4ba5]">
                남은 할 일 {totalCount}개
              </span>
              {pastDueCount > 0 ? (
                <span className="rounded-full bg-[#fdf3e4] px-2.5 py-1 text-xs font-medium tabular-nums text-[#94702f]">
                  지난 할 일 {pastDueCount}개
                </span>
              ) : null}
            </div>
          ) : null}

          {sections.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-[#655d5d]">
                오늘 할 일을 모두 마쳤어요 ✨
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sections.map(({ group, items, time }) => (
                <Card key={group.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-dashed border-[#f0e3dc] pb-2.5">
                      <Link
                        href={`/groups/${group.id}`}
                        className="flex min-w-0 items-center gap-1.5 font-semibold text-[#2d2928] hover:underline"
                      >
                        <span aria-hidden className="shrink-0">
                          {groupIconOf(group.icon)}
                        </span>
                        <span className="min-w-0 truncate">{group.name}</span>
                      </Link>
                      {time ? (
                        <span className="text-xs tabular-nums text-[#8a7b77]">
                          오늘 수업 {formatTimeRange(time.start, time.end)}
                        </span>
                      ) : null}
                    </div>

                    <ul className="mt-1 divide-y divide-dashed divide-[#f4e2e8]">
                      {items.map(({ item, isPastDue }) => (
                        <li key={item.id} className="flex items-center gap-1">
                          {/* 완료 = completed 저장 후 active 목록에서만 제외 (row 유지) */}
                          <form
                            action={togglePreparationItemAction.bind(null, group.id, item.id)}
                            className="min-w-0 flex-1"
                          >
                            <button
                              type="submit"
                              aria-pressed={false}
                              className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-[#f8f3fb]"
                            >
                              <span
                                aria-hidden
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#d9c8f0] bg-white"
                              >
                                <Check className="h-3 w-3 text-transparent" strokeWidth={3} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block break-words text-sm text-[#2d2928]">
                                  {item.text}
                                </span>
                                <span
                                  className={cn(
                                    "mt-0.5 block text-[11px]",
                                    isPastDue ? "text-[#a5854a]" : "text-[#a79996]",
                                  )}
                                >
                                  {item.source === "daily_log_next_plan"
                                    ? "다음 수업 계획"
                                    : "직접 등록"}
                                  {item.dueDate
                                    ? isPastDue
                                      ? ` · ${formatKoreanDate(item.dueDate)} · 미완료`
                                      : " · 오늘"
                                    : ""}
                                </span>
                              </span>
                            </button>
                          </form>
                          <TodoDeleteButton groupId={group.id} itemId={item.id} text={item.text} />
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#a79996]">
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            완료한 할 일은 목록에서 사라지고, 각 수업 그룹 페이지에서 관리할 수 있어요.
          </div>

          <div className="pb-10" />
        </div>
      </main>
    </AppShell>
  );
}
