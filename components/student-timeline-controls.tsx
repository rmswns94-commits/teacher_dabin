"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  TIMELINE_CATEGORIES,
  TIMELINE_RANGES,
  type TimelineCategory,
  type TimelineRange,
} from "@/lib/student-timeline";
import { cn } from "@/lib/utils";

// 학생 상세의 탭 + 타임라인 필터/기간.
// 상태는 전부 URL 쿼리다 (기존 목록 화면들과 같은 방식) — 뒤로 가기로 돌아와도 필터가 유지되고
// 새 전역 상태 라이브러리가 필요 없다.

export function StudentDetailTabs({
  studentId,
  active,
  timelineHref,
}: {
  studentId: string;
  active: "info" | "timeline";
  timelineHref: string;
}) {
  const tabs = [
    { key: "info" as const, label: "기본 정보", href: `/students/${studentId}` },
    { key: "timeline" as const, label: "타임라인", href: timelineHref },
  ];

  return (
    <div role="tablist" aria-label="학생 상세 보기" className="mb-4 flex flex-wrap gap-1.5">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          role="tab"
          aria-selected={active === tab.key}
          className={cn(
            "min-h-10 rounded-xl px-3.5 py-2 text-sm font-medium transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c1e8]",
            active === tab.key
              ? "bg-[#f3eefa] text-[#5c4ca8]"
              : "text-[#8a7b77] hover:bg-white/70 hover:text-[#564d4d]",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export function StudentTimelineFilter({
  studentId,
  category,
  range,
}: {
  studentId: string;
  category: TimelineCategory;
  range: TimelineRange;
}) {
  const router = useRouter();

  // 필터/기간을 바꾸면 더 보기(limit)는 처음으로 되돌린다 — 다른 목록을 이어보면 혼란스럽다
  const hrefFor = (nextCategory: TimelineCategory, nextRange: TimelineRange) => {
    const params = new URLSearchParams({ tab: "timeline" });
    if (nextCategory !== "all") params.set("c", nextCategory);
    if (nextRange !== "3m") params.set("r", nextRange);
    return `/students/${studentId}?${params.toString()}`;
  };

  return (
    <div className="mb-4 space-y-2.5">
      {/* 좁은 화면에서는 가로 스크롤 — 줄바꿈으로 필터가 화면을 밀어내지 않게 */}
      <div
        role="tablist"
        aria-label="기록 종류"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {TIMELINE_CATEGORIES.map((item) => (
          <Link
            key={item.value}
            href={hrefFor(item.value, range)}
            role="tab"
            aria-selected={category === item.value}
            className={cn(
              "min-h-9 shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c1e8]",
              category === item.value
                ? "bg-[#f3eefa] text-[#5c4ca8]"
                : "bg-white/70 text-[#8a7b77] hover:text-[#564d4d]",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-[#8a7b77]">기간</span>
        <select
          value={range}
          onChange={(event) => router.push(hrefFor(category, event.target.value as TimelineRange))}
          aria-label="기간 선택"
          className="rounded-xl border border-[#ecdcd8] bg-white/80 px-3 py-2 text-base outline-none focus:border-[#e3b9c9]"
        >
          {TIMELINE_RANGES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
