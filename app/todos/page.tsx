import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { TodayRefresher } from "@/components/today-refresher";
import { TodoCreateDialog } from "@/components/todo-create-dialog";
import { TodoDeleteButton } from "@/components/todo-delete-button";
import { Card, CardContent } from "@/components/ui/card";
import { togglePreparationItemAction } from "@/app/groups/actions";
import {
  addMonths,
  buildMonthGrid,
  dayOfWeekOf,
  monthLabel,
  monthRange,
  parseMonthParam,
} from "@/lib/calendar";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { groupIconOf } from "@/lib/group-icons";
import { activePreparationItems, isCompletedToday } from "@/lib/preparation";
import { formatTimeRange } from "@/lib/schedule";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import type { PreparationItem } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

// 오늘 할 일 = "완료할 때까지 놓치지 않는 작업함" + 월간 캘린더 탐색.
// Todo data model은 그대로 (class_groups.preparation_items 공용 — Dashboard/그룹 상세와 같은 row).
// - 오늘 선택(기본): 기존 정책 그대로 — 미완료 + (무날짜 수동 항목 또는 due<=오늘 carry-over)
//   + 오늘(KST) 완료한 항목은 취소선으로 유지.
// - 다른 날짜 선택: 그 날짜에 due_date가 지정된 Todo의 historical/미리보기 (완료 포함).
// - 캘린더 marker/상세 모두 이미 fetch한 preparation_items를 JS에서 접는다 (추가 쿼리 0, N+1 없음).
// - 날짜는 항상 Todo.due_date 기준 (created_at/completed_at 아님), URL ?month&date로 상태 유지.

// 스프링 노트 달력 디자인 (시험 대비 플래너와 동일 계열): 일요일 시작 SUN~SAT, 주말 웜 레드
const WEEKDAY_HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WEEKEND_TEXT = "text-[#d95f4c]";

// 상단 스프링 코일 장식 (시험 대비 플래너와 동일 — 순수 decoration)
function SpringCoils() {
  return (
    <div aria-hidden className="pointer-events-none absolute -top-3.5 left-0 right-0 flex justify-around px-5">
      {Array.from({ length: 11 }, (_, i) => (
        <span
          key={i}
          className="h-7 w-2.5 rounded-full border border-[#a9c8e4] bg-gradient-to-b from-[#dcecf9] to-[#aecde9] shadow-[0_1px_2px_rgba(120,150,180,0.35)]"
        />
      ))}
    </div>
  );
}

type TodayTodoItem = {
  item: PreparationItem;
  isPastDue: boolean;
};

function sourceLabelOf(item: PreparationItem) {
  return item.source === "daily_log_next_plan"
    ? "다음 수업 계획"
    : item.source === "daily_log_homework"
      ? "숙제"
      : item.source === "daily_log_task"
        ? "해야 할 일"
        : "직접 등록";
}

// 공용 Todo row — 오늘/과거/미래 상세가 같은 markup을 쓴다 (완료=체크+취소선, 전체 multiline)
function TodoItemRow({
  groupId,
  item,
  checked,
  meta,
  metaClass,
}: {
  groupId: string;
  item: PreparationItem;
  checked: boolean;
  meta: string;
  metaClass: string;
}) {
  return (
    <li className="flex items-center gap-1">
      {/* 완료 toggle = completed 저장 (row 유지) — Dashboard/그룹 상세와 같은 항목이 함께 바뀐다 */}
      <form
        action={togglePreparationItemAction.bind(null, groupId, item.id)}
        className="min-w-0 flex-1"
      >
        <button
          type="submit"
          aria-pressed={checked}
          className={cn(
            "flex min-h-11 w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-left transition",
            checked ? "hover:bg-[#f4f9f6]" : "hover:bg-[#f8f3fb]",
          )}
        >
          {checked ? (
            <span
              aria-hidden
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#8fc7ab]"
            >
              <Check className="h-3 w-3 text-white" strokeWidth={3} />
            </span>
          ) : (
            <span
              aria-hidden
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#d9c8f0] bg-white"
            >
              <Check className="h-3 w-3 text-transparent" strokeWidth={3} />
            </span>
          )}
          <span className={cn("min-w-0 flex-1", checked && "opacity-75")}>
            <span
              className={cn(
                "block whitespace-pre-wrap break-words text-sm",
                checked ? "text-[#8a7b77] [text-decoration:line-through]" : "text-[#2d2928]",
              )}
            >
              {item.text}
            </span>
            <span className={cn("mt-0.5 block text-[11px]", metaClass)}>{meta}</span>
          </span>
        </button>
      </form>
      <TodoDeleteButton groupId={groupId} itemId={item.id} text={item.text} />
    </li>
  );
}

export default async function TodayTodosPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; date?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const today = todayDateString();
  // 기본 선택 = 오늘 (기존 UX: 진입하자마자 오늘 할 일 표시). URL date는 reload/PWA 복구용
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today;
  const month = parseMonthParam(params.month, selectedDate.slice(0, 7));
  const range = monthRange(month);
  const isTodaySelected = selectedDate === today;

  // 그룹(준비 항목/아이콘)+시간표 — 2쿼리 batch, 항목/날짜별 반복 쿼리 없음
  const [groups, schedules] = await Promise.all([
    getCurrentUserGroups(),
    getCurrentUserSchedulesWithGroup(),
  ]);
  const activeGroups = groups.filter((group) => !group.archived);

  // 요일별 그룹 수업 시간 (표시/정렬용) — 오늘·선택 날짜에서 공유
  const timeByGroupForDow = (dow: number) => {
    const map = new Map<string, { start: string; end: string }>();
    for (const row of schedules) {
      if (row.day_of_week !== dow) {
        continue;
      }
      const current = map.get(row.group_id);
      map.set(row.group_id, {
        start: !current || row.start_time < current.start ? row.start_time : current.start,
        end: !current || row.end_time > current.end ? row.end_time : current.end,
      });
    }
    return map;
  };

  // ── 캘린더 marker: 표시 월의 due_date별 Todo 수 (완료 포함 — 그 날짜에 있었던 기록 유지,
  //    dismissed 삭제 항목 제외). 이미 받은 preparation_items를 접을 뿐 추가 쿼리 없음 ──
  const markerByDate = new Map<string, { total: number; done: number }>();
  for (const group of activeGroups) {
    for (const item of activePreparationItems(group.preparation_items)) {
      if (!item.dueDate || item.dueDate < range.start || item.dueDate > range.end) {
        continue;
      }
      const marker = markerByDate.get(item.dueDate) ?? { total: 0, done: 0 };
      marker.total += 1;
      if (item.completed) {
        marker.done += 1;
      }
      markerByDate.set(item.dueDate, marker);
    }
  }
  const weeks = buildMonthGrid(month);

  // ── 오늘 상세 (기존 정책 그대로) ──
  const todayTimeByGroup = timeByGroupForDow(dayOfWeekOf(today));
  const sections = activeGroups
    .map((group) => {
      const visible = activePreparationItems(group.preparation_items);
      const items: TodayTodoItem[] = visible
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
      // 오늘(KST) 완료한 항목은 당일 동안 취소선으로 유지 — 다시 눌러 즉시 원복 가능.
      // legacy(completed=true, completedAt 없음)는 완료 이력으로 취급해 표시하지 않는다.
      const doneToday = visible.filter((item) => isCompletedToday(item, today));

      return { group, items, doneToday, time: todayTimeByGroup.get(group.id) ?? null };
    })
    .filter((section) => section.items.length > 0 || section.doneToday.length > 0)
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
  const doneTodayCount = sections.reduce((sum, section) => sum + section.doneToday.length, 0);

  // ── 과거/미래 선택 날짜 상세: "그 날짜로 예정했던 Todo" (due_date=선택일, 완료 포함) ──
  const selectedTimeByGroup = timeByGroupForDow(dayOfWeekOf(selectedDate));
  const dateSections = isTodaySelected
    ? []
    : activeGroups
        .map((group) => {
          const items = activePreparationItems(group.preparation_items).filter(
            (item) => item.dueDate === selectedDate,
          );
          return { group, items, time: selectedTimeByGroup.get(group.id) ?? null };
        })
        .filter((section) => section.items.length > 0)
        .sort((a, b) => {
          const timeA = a.time?.start ?? "99:99";
          const timeB = b.time?.start ?? "99:99";
          return timeA.localeCompare(timeB) || a.group.name.localeCompare(b.group.name, "ko");
        });
  const dateTotal = dateSections.reduce((sum, section) => sum + section.items.length, 0);

  const dateHref = (date: string) => `/todos?month=${date.slice(0, 7)}&date=${date}`;
  // month만 이동하면 선택은 해제되고 아래는 오늘 상세로 복귀 (임의 날짜 자동 open 없음)
  const monthHref = (value: string) => `/todos?month=${value}`;
  const navButton =
    "flex h-9 min-w-9 items-center justify-center rounded-xl border border-[#c9dcee] bg-white px-2 text-sm font-medium text-[#4a6f96] transition hover:bg-[#f3f8fd]";

  const groupHeader = (group: { id: string; name: string; icon?: string | null }, time: { start: string; end: string } | null, timeLabel: string) => (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-dashed border-[#f0e3dc] pb-2.5">
      <Link
        href={`/groups/${group.id}`}
        className="flex min-w-0 items-center gap-1.5 font-semibold text-[#2d2928] hover:underline"
      >
        <span aria-hidden className="shrink-0">
          {groupIconOf(group.icon ?? null)}
        </span>
        <span className="min-w-0 truncate">{group.name}</span>
      </Link>
      {time ? (
        <span className="text-xs tabular-nums text-[#8a7b77]">
          {timeLabel} {formatTimeRange(time.start, time.end)}
        </span>
      ) : null}
    </div>
  );

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[1000px]">
          <TodayRefresher />
          <PageHeader
            title="오늘 할 일"
            description={`${formatKoreanDate(today, true)} · 캘린더에서 날짜를 고르면 그날의 할 일을 볼 수 있어요.`}
            action={
              <TodoCreateDialog
                // key: 날짜 선택(soft nav) 시 기본 날짜가 새 선택을 따르도록 remount
                key={selectedDate}
                groups={activeGroups.map((group) => ({ id: group.id, name: group.name, icon: group.icon ?? null }))}
                // 선택한 날짜가 새 할 일의 기본 날짜 (오늘 선택이면 기존처럼 오늘)
                defaultDate={selectedDate}
              />
            }
          />

          {/* ── 월간 캘린더 (시험 대비 플래너와 동일한 스프링 노트 디자인) — 날짜는 due_date 기준 ── */}
          <section
            aria-label="할 일 월간 캘린더"
            className="mb-5 rounded-3xl border border-[#d5e6f3] bg-gradient-to-b from-[#e2f0fa] via-[#edf5fb] to-[#eef6ef] p-3 shadow-sm sm:p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pb-1">
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-[#2b2323]">
                {monthLabel(month)}
              </h2>
              <div className="flex items-center gap-1">
                <Link href={monthHref(addMonths(month, -1))} aria-label="이전 달" className={navButton}>
                  <ChevronLeft className="h-4 w-4" />
                </Link>
                <Link href={dateHref(today)} className={navButton}>
                  오늘
                </Link>
                <Link href={monthHref(addMonths(month, 1))} aria-label="다음 달" className={navButton}>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* 스프링 노트 sheet — 코일 장식이 상단에 걸리도록 위 여백 확보 */}
            <div className="relative mt-4 rounded-2xl border border-[#dfe7ef] bg-white px-1.5 pb-2 pt-6 shadow-[0_12px_28px_rgba(120,150,180,0.14)] sm:px-2">
              <SpringCoils />

              {/* 요일 헤더 (일요일 시작 — SUN/SAT 웜 레드) */}
              <div className="grid grid-cols-7 border-b-2 border-[#eef1f5] pb-2">
                {WEEKDAY_HEADERS.map((label, index) => (
                  <div
                    key={label}
                    className={cn(
                      "px-1 text-center text-[10px] font-bold tracking-[0.08em] sm:text-[11px]",
                      index === 0 || index === 6 ? WEEKEND_TEXT : "text-[#4a4a55]",
                    )}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7">
                  {week.map((date, dayIndex) => {
                    if (!date) {
                      return (
                        <div
                          key={`empty-${dayIndex}`}
                          className="min-h-[64px] border-b border-r border-[#eef1f5] bg-[#f8fafc]/70 first:border-l sm:min-h-[76px]"
                        />
                      );
                    }

                    const marker = markerByDate.get(date) ?? null;
                    const allDone = Boolean(marker && marker.done === marker.total);
                    const isToday = date === today;
                    const isSelected = date === selectedDate;
                    const isWeekend = dayIndex === 0 || dayIndex === 6;

                    return (
                      <Link
                        key={date}
                        href={dateHref(date)}
                        aria-label={`${formatKoreanDate(date, true)} 할 일 ${marker?.total ?? 0}개`}
                        aria-current={isSelected ? "date" : undefined}
                        className={cn(
                          "min-h-[64px] min-w-0 border-b border-r border-[#eef1f5] px-1 py-1 transition first:border-l sm:min-h-[76px]",
                          "bg-white hover:bg-[#f7fafd]",
                          isSelected && "ring-1 ring-inset ring-[#a9c8e8]",
                        )}
                      >
                        {/* 날짜 숫자 가운데 정렬 — 플래너와 동일 */}
                        <div className="flex min-w-0 flex-col items-center gap-0.5">
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums",
                              isToday
                                ? "bg-[#8b7ae6] text-white"
                                : isWeekend
                                  ? WEEKEND_TEXT
                                  : "text-[#3f3f49]",
                            )}
                          >
                            {Number(date.slice(8))}
                          </span>
                          {marker ? (
                            // 전부 완료된 날은 muted + ✓ (기록은 유지 — history 성격),
                            // 나머지는 플래너의 민트 oval marker와 동일 계열
                            <span
                              className={cn(
                                "inline-flex max-w-full items-center gap-0.5 truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                                allDone
                                  ? "bg-[#f0eae4] text-[#8a7b77]"
                                  : "bg-[#d9efe3] text-[#3d7f64]",
                              )}
                            >
                              {allDone ? "✓ " : null}
                              <span className="hidden sm:inline">할 일 </span>
                              {marker.total}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ))}

              {/* 하단 꽃 장식 (플래너와 동일한 마무리) */}
              <div aria-hidden className="flex items-center justify-center gap-2 pt-2 text-sm">
                <span>🌼</span>
                <span>🌿</span>
                <span>🌼</span>
              </div>
            </div>
          </section>

          {/* ── 선택 날짜 상세 ── */}
          <h2 className="mb-3 text-base font-bold text-[#2b2323]">
            {isTodaySelected
              ? `오늘 할 일 · ${formatKoreanDate(today, true)}`
              : `${formatKoreanDate(selectedDate, true)} · 할 일 ${dateTotal}개`}
          </h2>

          {isTodaySelected ? (
            <>
              {totalCount > 0 || doneTodayCount > 0 ? (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-[#655d5d]">
                  <span className="rounded-full bg-[#efe8fb] px-2.5 py-1 text-xs font-medium tabular-nums text-[#5d4ba5]">
                    남은 할 일 {totalCount}개
                  </span>
                  {pastDueCount > 0 ? (
                    <span className="rounded-full bg-[#fdf3e4] px-2.5 py-1 text-xs font-medium tabular-nums text-[#94702f]">
                      지난 할 일 {pastDueCount}개
                    </span>
                  ) : null}
                  {doneTodayCount > 0 ? (
                    <span className="rounded-full bg-[#e4f4ec] px-2.5 py-1 text-xs font-medium tabular-nums text-[#3d7f64]">
                      오늘 완료 {doneTodayCount}개
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
                  {sections.map(({ group, items, doneToday, time }) => (
                    <Card key={group.id}>
                      <CardContent className="p-4">
                        {groupHeader(group, time, "오늘 수업")}
                        <ul className="mt-1 divide-y divide-dashed divide-[#f4e2e8]">
                          {items.map(({ item, isPastDue }) => (
                            <TodoItemRow
                              key={item.id}
                              groupId={group.id}
                              item={item}
                              checked={false}
                              meta={`${sourceLabelOf(item)}${
                                item.dueDate
                                  ? isPastDue
                                    ? ` · ${formatKoreanDate(item.dueDate)} · 미완료`
                                    : " · 오늘"
                                  : ""
                              }`}
                              metaClass={isPastDue ? "text-[#a5854a]" : "text-[#a79996]"}
                            />
                          ))}
                          {doneToday.map((item) => (
                            <TodoItemRow
                              key={item.id}
                              groupId={group.id}
                              item={item}
                              checked={true}
                              meta={`${sourceLabelOf(item)} · 완료`}
                              metaClass="text-[#b0a39f]"
                            />
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : dateSections.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-[#655d5d]">
                이날 예정된 할 일이 없어요.
              </CardContent>
            </Card>
          ) : (
            // historical/미래 미리보기: 그 날짜로 예정했던 Todo (완료 포함 — carry-over 재구성 없음)
            <div className="space-y-4">
              {dateSections.map(({ group, items, time }) => (
                <Card key={group.id}>
                  <CardContent className="p-4">
                    {groupHeader(group, time, "이날 수업")}
                    <ul className="mt-1 divide-y divide-dashed divide-[#f4e2e8]">
                      {items.map((item) => (
                        <TodoItemRow
                          key={item.id}
                          groupId={group.id}
                          item={item}
                          checked={item.completed}
                          meta={`${sourceLabelOf(item)}${item.completed ? " · 완료" : ""}`}
                          metaClass={item.completed ? "text-[#b0a39f]" : "text-[#a79996]"}
                        />
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
