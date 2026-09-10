import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, ListChecks, NotebookTabs } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ExpandableList } from "@/components/expandable-list";
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
import { formatTextbookLinked, linkedContextLabel } from "@/lib/textbooks";
import { formatTimeRange } from "@/lib/schedule";
import { formatHomeworkDisplay, homeworkAudienceLabel } from "@/lib/homework-assignments";
import { toggleHomeworkCompletionAction } from "@/app/daily-logs/actions";
import { getDueHomeworkForCurrentUser, type DueHomeworkItem } from "@/lib/supabase/queries/daily-logs";
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
    <div className="flex items-center gap-1">
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
                "body-text block whitespace-pre-wrap break-words",
                checked ? "text-[#8a7b77] [text-decoration:line-through]" : "text-[#2d2928]",
              )}
            >
              {formatTextbookLinked(linkedContextLabel(item), item.text)}
            </span>
            <span className={cn("secondary-text mt-0.5 block", metaClass)}>{meta}</span>
          </span>
        </button>
      </form>
      <TodoDeleteButton groupId={groupId} itemId={item.id} text={formatTextbookLinked(linkedContextLabel(item), item.text)} />
    </div>
  );
}

// 숙제 줄 — Todo가 아니라 "그 날짜가 완료일인 숙제"를 읽어 보여주는 read-only 항목이다.
// 체크박스/삭제 버튼이 없다: 숙제에는 완료 상태가 없고, Todo의 완료/삭제 핸들러를
// 숙제에 연결하지 않는다 (숙제 수정/삭제는 수업 일지 편집에서).
function HomeworkItemRow({ homework }: { homework: DueHomeworkItem }) {
  const checked = homework.completed;
  const label = formatHomeworkDisplay({
    audienceLabel: homeworkAudienceLabel(homework.assignedStudentName),
    contextLabel: linkedContextLabel(homework),
    content: homework.content,
  });

  return (
    <div className="flex items-center gap-1">
      {/* 완료 toggle은 숙제 row 자체(completed)를 바꾼다 — Todo 액션과 다른 경로.
          완료해도 목록에서 사라지지 않고 그 자리에 취소선으로 남는다 (잘못 눌러도 바로 원복). */}
      <form
        action={toggleHomeworkCompletionAction.bind(null, homework.id)}
        className="min-w-0 flex-1"
      >
        <button
          type="submit"
          aria-pressed={checked}
          className={cn(
            "flex min-h-11 w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-left transition",
            checked ? "hover:bg-[#f4f9f6]" : "hover:bg-[#fdf6ec]",
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
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#e8c9b0] bg-white"
            >
              <Check className="h-3 w-3 text-transparent" strokeWidth={3} />
            </span>
          )}
          <span className={cn("min-w-0 flex-1", checked && "opacity-75")}>
            <span
              className={cn(
                "body-text block whitespace-pre-wrap break-words",
                checked ? "text-[#8a7b77] [text-decoration:line-through]" : "text-[#2d2928]",
              )}
            >
              {label}
            </span>
            <span className={cn("secondary-text mt-0.5 block", checked ? "text-[#b0a39f]" : "text-[#a5854a]")}>
              숙제{checked ? " · 완료" : ""}
            </span>
          </span>
        </button>
      </form>
      {/* 숙제 삭제는 수업 일지 편집에서 — 여기서는 원본 일지로 가는 링크만 둔다 */}
      <Link
        href={`/daily-logs/${homework.dailyLogId}`}
        aria-label={`${label} 수업 일지 열기`}
        className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl text-[#c3b09a] transition hover:bg-[#fdf6ec] hover:text-[#94702f]"
      >
        <NotebookTabs className="h-4 w-4" aria-hidden />
      </Link>
    </div>
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

  // 그룹(준비 항목/아이콘)+시간표+숙제 — 3쿼리 batch, 항목/날짜별 반복 쿼리 없음.
  // 숙제는 이 페이지에서만 조회한다 — Dashboard의 Todo 카드 source는 건드리지 않는다.
  const [groups, schedules, dueHomework] = await Promise.all([
    getCurrentUserGroups(),
    getCurrentUserSchedulesWithGroup(),
    // 달력에 보이는 달 + 오늘/선택 날짜(다른 달일 수 있음)를 한 번에
    getDueHomeworkForCurrentUser({
      rangeStart: range.start,
      rangeEnd: range.end,
      extraDates: [today, selectedDate],
    }),
  ]);
  const activeGroups = groups.filter((group) => !group.archived);
  const activeGroupIds = new Set(activeGroups.map((group) => group.id));
  // (날짜, 그룹)별 숙제 — 보관된 그룹의 숙제는 Todo와 같은 기준으로 제외한다.
  // 저장된 sort_order 순서를 그대로 유지한다 (학생 이름으로 재정렬하지 않는다).
  const homeworkByDateGroup = new Map<string, DueHomeworkItem[]>();
  const homeworkCountByDate = new Map<string, { total: number; done: number }>();
  for (const homework of dueHomework) {
    if (!homework.groupId || !activeGroupIds.has(homework.groupId)) {
      continue;
    }
    const key = `${homework.dueDate}|${homework.groupId}`;
    homeworkByDateGroup.set(key, [...(homeworkByDateGroup.get(key) ?? []), homework]);
    // 완료해도 그 날짜에 있던 숙제이므로 total에서 빠지지 않는다
    const count = homeworkCountByDate.get(homework.dueDate) ?? { total: 0, done: 0 };
    count.total += 1;
    if (homework.completed) {
      count.done += 1;
    }
    homeworkCountByDate.set(homework.dueDate, count);
  }
  const homeworkOf = (date: string, groupId: string) => homeworkByDateGroup.get(`${date}|${groupId}`) ?? [];

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
  // 숙제도 그날 이 페이지에 뜨는 항목이므로 Todo와 함께 센다 (완료해도 total 유지).
  const markerByDate = new Map<string, { total: number; done: number }>();
  for (const [date, count] of homeworkCountByDate) {
    if (date < range.start || date > range.end) {
      continue;
    }
    markerByDate.set(date, { total: count.total, done: count.done });
  }
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
      // 오늘이 완료일인 숙제 (carry-over 없음 — 숙제는 날짜에 맞는 것만 보여준다)
      const homework = homeworkOf(today, group.id);

      return { group, items, doneToday, homework, time: todayTimeByGroup.get(group.id) ?? null };
    })
    .filter(
      (section) =>
        section.items.length > 0 || section.doneToday.length > 0 || section.homework.length > 0,
    )
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
          const homework = homeworkOf(selectedDate, group.id);
          return { group, items, homework, time: selectedTimeByGroup.get(group.id) ?? null };
        })
        .filter((section) => section.items.length > 0 || section.homework.length > 0)
        .sort((a, b) => {
          const timeA = a.time?.start ?? "99:99";
          const timeB = b.time?.start ?? "99:99";
          return timeA.localeCompare(timeB) || a.group.name.localeCompare(b.group.name, "ko");
        });
  const dateTotal = dateSections.reduce((sum, section) => sum + section.items.length, 0);
  // 숙제 개수는 "할 일 N개"와 섞지 않고 따로 센다 (기존 카운트의 의미를 바꾸지 않는다)
  const dateHomeworkTotal = dateSections.reduce((sum, section) => sum + section.homework.length, 0);
  const todayHomeworkTotal = sections.reduce((sum, section) => sum + section.homework.length, 0);
  const todayHomeworkDone = sections.reduce(
    (sum, section) => sum + section.homework.filter((hw) => hw.completed).length,
    0,
  );

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
        <span className="secondary-text tabular-nums text-[#8a7b77]">
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
              <h2 className="card-title text-[#2b2323]">
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
                      "px-1 text-center text-xs font-semibold tracking-[0.04em]",
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
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
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
                                "inline-flex max-w-full items-center gap-0.5 truncate rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
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
          <h2 className="card-title mb-3 text-[#2b2323]">
            {isTodaySelected
              ? `오늘 할 일 · ${formatKoreanDate(today, true)}`
              : `${formatKoreanDate(selectedDate, true)} · 할 일 ${dateTotal}개${
                  dateHomeworkTotal > 0 ? ` · 숙제 ${dateHomeworkTotal}개` : ""
                }`}
          </h2>

          {isTodaySelected ? (
            <>
              {totalCount > 0 || doneTodayCount > 0 || todayHomeworkTotal > 0 ? (
                <div className="secondary-text mb-4 flex flex-wrap items-center gap-2 text-[#655d5d]">
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
                  {/* 숙제는 자체 완료 상태가 있어 "완료/전체"로 보여준다.
                      위의 "할 일" 칩들은 기존 Todo 기준 그대로 (의미를 섞지 않는다). */}
                  {todayHomeworkTotal > 0 ? (
                    <span className="rounded-full bg-[#fdf3e4] px-2.5 py-1 text-xs font-medium tabular-nums text-[#94702f]">
                      숙제 {todayHomeworkDone}/{todayHomeworkTotal}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {sections.length === 0 ? (
                <Card>
                  <CardContent className="body-text p-6 text-[#655d5d]">
                    오늘 할 일을 모두 마쳤어요 ✨
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {sections.map(({ group, items, doneToday, homework, time }) => (
                    <Card key={group.id}>
                      <CardContent className="p-4">
                        {groupHeader(group, time, "오늘 수업")}
                        {/* 목록형 Card 공통 preview — 7개 초과면 접기 (미완료+완료 합산 개수 기준) */}
                        <ExpandableList className="mt-1 divide-y divide-dashed divide-[#f4e2e8]">
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
                          {/* 오늘이 완료일인 숙제 — Todo와 같은 목록에 두되 key는 source로 구분 */}
                          {homework.map((hw) => (
                            <HomeworkItemRow key={`homework:${hw.id}`} homework={hw} />
                          ))}
                        </ExpandableList>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : dateSections.length === 0 ? (
            <Card>
              <CardContent className="body-text p-6 text-[#655d5d]">
                이날 예정된 할 일과 숙제가 없어요.
              </CardContent>
            </Card>
          ) : (
            // historical/미래 미리보기: 그 날짜로 예정했던 Todo (완료 포함 — carry-over 재구성 없음)
            <div className="space-y-4">
              {dateSections.map(({ group, items, homework, time }) => (
                <Card key={group.id}>
                  <CardContent className="p-4">
                    {groupHeader(group, time, "이날 수업")}
                    <ExpandableList className="mt-1 divide-y divide-dashed divide-[#f4e2e8]">
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
                      {/* 이 날짜가 완료일인 숙제 (과거·미래 모두 그 날짜 기준으로 그대로) */}
                      {homework.map((hw) => (
                        <HomeworkItemRow key={`homework:${hw.id}`} homework={hw} />
                      ))}
                    </ExpandableList>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="secondary-text mt-6 flex items-center justify-center gap-1.5 text-[#a79996]">
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            완료한 할 일은 목록에서 사라지고, 각 수업 그룹 페이지에서 관리할 수 있어요.
          </div>

          <div className="pb-10" />
        </div>
      </main>
    </AppShell>
  );
}
