"use client";

import Link from "next/link";
import { BookOpen, CalendarDays, ChevronRight, Clock3, Search } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";

// 서버에서 모두 계산된 직렬화 가능한 카드 데이터.
export type GroupCardData = {
  id: string;
  name: string;
  gradeLabel: string;
  studentCount: number;
  textbooks: string[];
  scheduleLines: string[];
  hasToday: boolean;
  todayStart: string | null; // 오늘 첫 수업 시작 "HH:MM" (정렬용)
  isNow: boolean;
  nextLabel: string | null;
  nextSub: string | null;
  progressMain: string | null;
  progressSub: string | null;
  latestDateLabel: string | null;
  latestStatus: "draft" | "completed" | null;
  attendanceLabel: string | null;
  prepCount: number;
  examLabel: string | null;
  examThisWeek: boolean;
  sortKey: number;
  isNearest: boolean;
};

type FilterKey = "all" | "today" | "exam" | "prep";

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "전체",
  today: "오늘 수업",
  exam: "이번 주 시험",
  prep: "준비 필요",
};

function matchesFilter(group: GroupCardData, filter: FilterKey) {
  if (filter === "today") return group.hasToday;
  if (filter === "exam") return group.examThisWeek;
  if (filter === "prep") return group.prepCount > 0;
  return true;
}

function matchesQuery(group: GroupCardData, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    group.name.toLowerCase().includes(needle) || group.gradeLabel.toLowerCase().includes(needle)
  );
}

function byWorkPriority(a: GroupCardData, b: GroupCardData) {
  return a.sortKey - b.sortKey || a.name.localeCompare(b.name, "ko");
}

function byTodayStart(a: GroupCardData, b: GroupCardData) {
  return (a.todayStart ?? "99:99").localeCompare(b.todayStart ?? "99:99") || byWorkPriority(a, b);
}

function GroupCard({ group }: { group: GroupCardData }) {
  return (
    <Link
      href={`/groups/${group.id}`}
      className="block rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-[#b9b9c6]"
    >
      <Card
        className={`h-full p-4 transition hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(0,0,0,0.07)] lg:p-5 ${
          group.hasToday ? "bg-[#fcfbff]" : ""
        } ${
          group.isNearest
            ? "border-[#cfc4f0] shadow-[0_6px_20px_rgba(139,122,230,0.10)]"
            : group.hasToday
              ? "border-[#d9d3ef]"
              : group.prepCount > 0
                ? "border-[#e8dcc9]"
                : ""
        }`}
      >
        {/* 1. 헤더: 반 이름 · 학년 · 요일/시간 | 학생 수 · 진입 */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-lg font-bold tracking-[-0.01em] text-[#232327]">
                {group.name}
              </span>
              <span className="rounded-full bg-[#f0f0f3] px-2 py-0.5 text-[11px] font-medium text-[#4c4c55]">
                {group.gradeLabel}
              </span>
              {group.isNow ? (
                <span className="rounded-full bg-[#efe8fb] px-2 py-0.5 text-[11px] font-medium text-[#5d4ba5]">
                  지금 수업 중
                </span>
              ) : null}
            </div>
            {group.scheduleLines.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-[#6b6b74]">
                {group.scheduleLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
            ) : (
              <div className="mt-1 text-xs text-[#9a9aa3]">수업 시간 미등록</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-xs text-[#6b6b74]">
            {group.studentCount}명
            <ChevronRight className="h-4 w-4 text-[#b4b4bd]" aria-hidden />
          </div>
        </div>

        {/* 2. 본문 3블록: 다음 수업 / 교재 / 현재 진도 — lg에서 좌→우 한눈에 */}
        <div className="mt-3 grid gap-3 border-t border-[#ececf0] pt-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* 다음 수업 — 라벤더 포인트 */}
          <div className="rounded-2xl bg-[#f5f2ff] px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7565d4]">
              <Clock3 className="h-3.5 w-3.5" aria-hidden /> 다음 수업
            </div>
            {group.nextLabel ? (
              <div className="mt-1">
                <span className="text-sm font-semibold tabular-nums text-[#3d3450]">
                  {group.nextLabel}
                </span>
                {group.nextSub ? (
                  <span className="ml-1.5 text-xs tabular-nums text-[#8a7fb8]">{group.nextSub}</span>
                ) : null}
              </div>
            ) : (
              <div className="mt-1 text-sm text-[#9a94b8]">일정 없음</div>
            )}
          </div>

          {/* 교재 */}
          <div className="rounded-2xl border border-[#f0f0f3] px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9a9aa3]">
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> 교재
            </div>
            {group.textbooks.length > 0 ? (
              <div className="mt-1 line-clamp-2 text-sm leading-5 text-[#4c4c55]">
                {group.textbooks.join(" · ")}
              </div>
            ) : (
              <div className="mt-1 text-sm text-[#b4b4bd]">교재 미등록</div>
            )}
          </div>

          {/* 현재 진도 — inset panel */}
          <div className="rounded-2xl bg-[#f7f7f9] px-3.5 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9a9aa3]">
              현재 진도
            </div>
            {group.progressMain ? (
              <>
                <div className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-5 text-[#33333b]">
                  {group.progressMain}
                </div>
                {group.progressSub ? (
                  <div className="mt-0.5 line-clamp-1 text-xs text-[#6b6b74]">
                    {group.progressSub}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-1 text-sm text-[#9a9aa3]">아직 기록된 진도가 없어요.</div>
            )}
          </div>
        </div>

        {/* 3. 하단 상태줄: 좌 = 시험/준비/작성중 badge · 우 = 최근 수업 */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-dashed border-[#ececf0] pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {group.examLabel ? (
              <span className="rounded-full bg-[#efe8fb] px-2 py-0.5 text-[11px] font-medium text-[#5d4ba5]">
                {group.examLabel}
              </span>
            ) : null}
            {group.prepCount > 0 ? (
              <span className="rounded-full bg-[#fdeee3] px-2 py-0.5 text-[11px] font-medium text-[#a2643c]">
                준비할 일 {group.prepCount}
              </span>
            ) : null}
            {group.latestStatus === "draft" ? (
              <span className="rounded-full bg-[#fdf3e4] px-2 py-0.5 text-[11px] font-medium text-[#94702f]">
                일지 작성 중
              </span>
            ) : null}
          </div>

          {group.latestDateLabel ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#6b6b74]">
              <span>최근 수업 {group.latestDateLabel}</span>
              {group.attendanceLabel ? (
                <span className="tabular-nums">· {group.attendanceLabel}</span>
              ) : null}
              {group.latestStatus === "completed" ? (
                <span className="rounded-full bg-[#e4f4ec] px-1.5 py-0.5 text-[10px] font-medium text-[#3d7f64]">
                  작성 완료
                </span>
              ) : null}
            </div>
          ) : (
            <div className="text-xs text-[#9a9aa3]">최근 수업 기록 없음</div>
          )}
        </div>
      </Card>
    </Link>
  );
}

// 한 줄에 한 반 — 카드가 가로로 넓게 펼쳐지고 세로로 쌓인다 (모든 breakpoint 1열)
function CardGrid({ groups }: { groups: GroupCardData[] }) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <GroupCard key={group.id} group={group} />
      ))}
    </div>
  );
}

export function GroupsOverview({ groups }: { groups: GroupCardData[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");

  const query = q.trim();
  const counts: Record<FilterKey, number> = {
    all: groups.length,
    today: groups.filter((group) => group.hasToday).length,
    exam: groups.filter((group) => group.examThisWeek).length,
    prep: groups.filter((group) => group.prepCount > 0).length,
  };

  const visible = groups.filter(
    (group) => matchesFilter(group, filter) && matchesQuery(group, query),
  );

  const showSections = filter === "all" && !query;
  const todayGroups = visible.filter((group) => group.hasToday).sort(byTodayStart);
  const otherGroups = visible.filter((group) => !group.hasToday).sort(byWorkPriority);
  const flatList = [...visible].sort(filter === "today" ? byTodayStart : byWorkPriority);

  return (
    <div>
      {/* 검색 */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-[#e6e6ea] bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <Search className="h-4 w-4 shrink-0 text-[#8a8a93]" aria-hidden />
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="w-full border-none bg-transparent text-sm text-[#33333b] outline-none placeholder:text-[#9a9aa3]"
          placeholder="수업 그룹 검색 (그룹명 · 학년)"
          aria-label="수업 그룹 검색"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            className="shrink-0 text-xs text-[#8a8a93] hover:text-[#4c4c55]"
          >
            지우기
          </button>
        ) : null}
      </div>

      {/* Quick Filters */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
          const active = filter === key;

          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-[#cfc4f0] bg-[#efe8fb] text-[#4a3c8f]"
                  : "border-[#e2e2e8] bg-white text-[#4c4c55] hover:bg-[#f4f4f6]"
              }`}
            >
              {FILTER_LABELS[key]}
              <span className={`ml-1 tabular-nums ${active ? "text-[#7565d4]" : "text-[#9a9aa3]"}`}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* 목록 */}
      {visible.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-[#e6e6ea] bg-white px-4 py-6 text-center text-sm text-[#6b6b74]">
          {query ? "찾는 수업 그룹이 없어요." : "해당하는 수업 그룹이 없어요."}
        </div>
      ) : showSections ? (
        <>
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between border-b border-[#ececf0] pb-2">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-[#232327]">
                <CalendarDays className="h-4 w-4 text-[#8b7ae6]" aria-hidden />
                오늘 수업
              </h2>
              {todayGroups.length > 0 ? (
                <span className="text-xs tabular-nums text-[#8a8a93]">{todayGroups.length}개</span>
              ) : null}
            </div>
            {todayGroups.length > 0 ? (
              <CardGrid groups={todayGroups} />
            ) : (
              <p className="text-sm text-[#8a8a93]">오늘은 예정된 수업이 없어요.</p>
            )}
          </div>

          {otherGroups.length > 0 ? (
            <div className="mt-7">
              <div className="mb-3 border-b border-[#ececf0] pb-2">
                <h2 className="text-sm font-bold text-[#232327]">다른 수업 그룹</h2>
              </div>
              <CardGrid groups={otherGroups} />
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-5">
          <CardGrid groups={flatList} />
        </div>
      )}
    </div>
  );
}
