"use client";

import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { useState } from "react";

import type { StudentGrowthCardSummary } from "@/lib/growth-note";

// 성장노트 메인 목록 (학생에게 함께 보여줄 수 있는 화면).
// 구체적인 점수/부정 기록은 여기에 절대 노출하지 않는다 — 카드에는
// 이름 · 그룹 · 획득 배지(최대 3개) · 칭찬 수만 담는다. 정렬은 이름순 (랭킹 금지).
export function GrowthNotesList({
  summaries,
  groups,
}: {
  summaries: StudentGrowthCardSummary[];
  groups: { id: string; name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("");

  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
  const selectedGroupName = groupId ? groupNameById.get(groupId) : null;

  const filtered = summaries.filter((summary) => {
    if (search.trim() && !summary.studentName.includes(search.trim())) {
      return false;
    }
    if (selectedGroupName && !summary.groupNames.includes(selectedGroupName)) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a89a94]" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="학생 이름 검색"
            aria-label="학생 이름 검색"
            className="w-full rounded-2xl border border-[#ece0db] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#d9c8f0]"
          />
        </label>
        <select
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          aria-label="그룹 필터"
          className="rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#d9c8f0] sm:w-48"
        >
          <option value="">전체 그룹</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-8 text-center text-sm text-[#8a7b77]">
          {summaries.length === 0
            ? "아직 등록된 학생이 없어요. 학생을 등록하면 성장노트가 만들어져요 🌱"
            : "조건에 맞는 학생이 없어요."}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((summary) => {
            const shown = summary.achievements.slice(0, 3);
            const extra = summary.achievements.length - shown.length;

            return (
              <Link
                key={summary.studentId}
                href={`/growth-notes/${summary.studentId}`}
                className="group rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-4 shadow-sm transition hover:border-[#e0d2f2] hover:bg-[#fdfbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b9a5e3]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold text-[#3a2f2c]">
                      {summary.studentName}
                    </div>
                    {summary.groupNames.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {summary.groupNames.map((name) => (
                          <span
                            key={name}
                            className="rounded-full bg-[#f3eefa] px-2 py-0.5 text-[10px] font-medium text-[#6d5aa8]"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[#c4b6b0] transition group-hover:text-[#8f7bc4]" />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {shown.length === 0 ? (
                    <span className="text-xs text-[#8a7b77]">🌱 성장 기록이 쌓이는 중이에요</span>
                  ) : (
                    <>
                      {shown.map((badge) => (
                        <span
                          key={badge.type}
                          className="rounded-full bg-[#f0f7f2] px-2 py-1 text-[11px] font-semibold text-[#3d7f64]"
                        >
                          {badge.emoji} {badge.label}
                        </span>
                      ))}
                      {extra > 0 ? (
                        <span className="rounded-full bg-[#f4f1ee] px-2 py-1 text-[11px] font-medium text-[#8a7b77]">
                          +{extra}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>

                {summary.praiseCount > 0 ? (
                  <div className="mt-2.5 text-xs font-medium text-[#8a6828]">
                    ⭐ 이번 주 칭찬 {summary.praiseCount}개
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
