"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import type { StudentGrowthCardSummary } from "@/lib/growth-note";
import { cn } from "@/lib/utils";

// 성장노트 메인 목록 (학생에게 함께 보여줄 수 있는 화면).
// 상단 반 pill로 필터하고, 학생 카드는 한 줄에 한 명 full-width로 표시한다.
// 구체적인 점수/부정 기록은 여기에 절대 노출하지 않는다 — 카드에는
// 이름 · 그룹 · 획득 배지(최대 3개) · 칭찬 수만 담는다. 정렬은 이름순 (랭킹 금지).
// 데이터는 서버에서 이미 batch 로드됨 — 반 클릭은 client filter만 (추가 쿼리 없음).
export function GrowthNotesList({
  summaries,
  groups,
}: {
  summaries: StudentGrowthCardSummary[];
  groups: { id: string; name: string }[];
}) {
  const [selectedGroupId, setSelectedGroupId] = useState("");

  const filtered = selectedGroupId
    ? summaries.filter((summary) => summary.groupIds.includes(selectedGroupId))
    : summaries;

  const chipClass = (active: boolean) =>
    cn(
      "shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-semibold transition",
      active
        ? "border-[#d9c8f0] bg-[#f3eefa] text-[#6d5aa8]"
        : "border-[#ece0db] bg-[#fffdfb] text-[#6b5d58] hover:bg-[#faf6f3]",
    );

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-sm text-[#8a7b77]">반을 선택해 성장노트를 확인해요.</div>
        {/* 모바일: chip 목록 내부만 가로 스크롤 (페이지 overflow 금지), sm+: wrap */}
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
          <button
            type="button"
            aria-pressed={selectedGroupId === ""}
            onClick={() => setSelectedGroupId("")}
            className={chipClass(selectedGroupId === "")}
          >
            전체
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-pressed={selectedGroupId === group.id}
              onClick={() => setSelectedGroupId(group.id)}
              className={chipClass(selectedGroupId === group.id)}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-8 text-center text-sm text-[#8a7b77]">
          {summaries.length === 0
            ? "아직 성장노트에 표시할 학생이 없어요 🌱"
            : "이 반에는 아직 등록된 학생이 없어요."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((summary) => {
            const shown = summary.achievements.slice(0, 3);
            const extra = summary.achievements.length - shown.length;

            return (
              <Link
                key={summary.studentId}
                href={`/growth-notes/${summary.studentId}`}
                className="group flex w-full flex-col gap-3 rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-4 shadow-sm transition hover:border-[#e0d2f2] hover:bg-[#fdfbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b9a5e3] sm:flex-row sm:items-center sm:gap-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-2 sm:block sm:w-56 sm:shrink-0">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-bold text-[#3a2f2c]">
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
                    ) : (
                      <div className="mt-1">
                        <span className="rounded-full bg-[#f4f1ee] px-2 py-0.5 text-[10px] font-medium text-[#8a7b77]">
                          반 미배정
                        </span>
                      </div>
                    )}
                  </div>
                  <ChevronRight
                    className="mt-1 h-4 w-4 shrink-0 text-[#c4b6b0] transition group-hover:text-[#8f7bc4] sm:hidden"
                    aria-hidden
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:justify-end">
                  {shown.length === 0 ? (
                    <span className="text-xs text-[#8a7b77]">🌱 성장 기록이 쌓이는 중이에요</span>
                  ) : (
                    <>
                      {shown.map((badge) => (
                        <span
                          key={badge.type}
                          className="rounded-full bg-[#f0f7f2] px-2.5 py-1 text-[11px] font-semibold text-[#3d7f64]"
                        >
                          {badge.emoji} {badge.label}
                        </span>
                      ))}
                      {extra > 0 ? (
                        <span className="rounded-full bg-[#f4f1ee] px-2.5 py-1 text-[11px] font-medium text-[#8a7b77]">
                          +{extra}
                        </span>
                      ) : null}
                    </>
                  )}
                  {summary.praiseCount > 0 ? (
                    <span className="rounded-full bg-[#fdf8ec] px-2.5 py-1 text-[11px] font-semibold text-[#8a6828]">
                      ⭐ 이번 주 칭찬 {summary.praiseCount}개
                    </span>
                  ) : null}
                </div>

                <ChevronRight
                  className="hidden h-4 w-4 shrink-0 text-[#c4b6b0] transition group-hover:text-[#8f7bc4] sm:block"
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
