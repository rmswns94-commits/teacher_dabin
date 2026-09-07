"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { groupIconOf } from "@/lib/group-icons";
import { cn } from "@/lib/utils";

// 하루 회고 카드 — 그날 반별 회고(원문)를 category별로 종합해 하나의 카드로 보여주고,
// 카드를 클릭하면 그 아래로 반 전체의 원문 회고가 펼쳐진다 (별도 페이지/추가 fetch 없음).
// 요약은 deterministic aggregation: Teacher 원문 bullet 그대로 (AI/창작 없음).

export type DayReflectionClass = {
  id: string; // daily log id
  time: string | null; // 그날 수업 시작 시간 "HH:MM" (시간표 기반 — 없으면 null)
  groupName: string;
  groupIcon: string | null;
  good: string | null;
  hard: string | null;
  next: string | null;
};

export type DaySummary = {
  good: string[];
  hard: string[];
  next: string[];
};

const SECTIONS = [
  {
    key: "good",
    icon: "✨",
    title: "잘된 점",
    labelClass: "text-[#3e7d6b]",
    boxClass: "border-[#dcebe2] bg-[#f6fbf8]",
  },
  {
    key: "hard",
    icon: "🌿",
    title: "아쉬웠던 점",
    labelClass: "text-[#8a5d52]",
    boxClass: "border-[#f0ded8] bg-[#fdf8f5]",
  },
  {
    key: "next",
    icon: "💡",
    title: "다음에 다르게",
    labelClass: "text-[#5c4ca8]",
    boxClass: "border-[#e2d8f3] bg-[#faf7ff]",
  },
] as const;

export function ReflectionDayCard({
  dateLabel,
  classes,
  summary,
}: {
  dateLabel: string; // "9월 7일 (월)"
  classes: DayReflectionClass[]; // 수업 시작 시간순 (없으면 이름 가나다순)
  summary: DaySummary;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      {/* ── 하루 종합 카드 (클릭 = 전체 회고 펼침/접기) ── */}
      <Card
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            setExpanded((prev) => !prev);
          }
        }}
        className="cursor-pointer p-5 transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-base font-bold text-[#2b2323]">{dateLabel}</div>
            <div className="mt-0.5 text-xs text-[#8a7b77]">
              {classes.length}개 반의 수업 회고
            </div>
          </div>
          <span className="flex items-center gap-1 text-xs font-medium text-[#5c4ca8]">
            {expanded ? "접기" : "전체 회고 보기"}
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            )}
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          {SECTIONS.map((section) => {
            const bullets = summary[section.key];

            // 그날 모든 반에서 이 항목이 비어 있으면 section 자체를 숨긴다 (내용 창작 금지)
            if (bullets.length === 0) {
              return null;
            }

            return (
              <div key={section.key} className={cn("rounded-2xl border px-3.5 py-3", section.boxClass)}>
                <div className={cn("text-xs font-semibold", section.labelClass)}>
                  <span aria-hidden>{section.icon}</span> {section.title}
                </div>
                <ul className="mt-1.5 space-y-1">
                  {bullets.map((text, index) => (
                    <li
                      key={index}
                      className="whitespace-pre-line break-words text-sm leading-6 text-[#4a4160]"
                    >
                      • {text}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── 전체 반 회고 (원문 — truncate/clamp 없음) ── */}
      {expanded ? (
        <div className="mt-3 space-y-3">
          {classes.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {item.time ? (
                    <span className="tabular-nums font-semibold text-[#6d5aa8]">{item.time}</span>
                  ) : null}
                  <span className="flex items-center gap-1 font-semibold text-[#2b2323]">
                    <span aria-hidden>{groupIconOf(item.groupIcon)}</span>
                    {item.groupName}
                  </span>
                </div>
                <Link
                  href={`/daily-logs/${item.id}`}
                  onClick={(event) => event.stopPropagation()}
                  className="flex items-center gap-0.5 text-xs font-medium text-[#5c4ca8] hover:underline"
                >
                  일지 보기 <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>

              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                {SECTIONS.map((section) => {
                  const value =
                    section.key === "good" ? item.good : section.key === "hard" ? item.hard : item.next;

                  // 비어 있는 항목은 "작성 없음" 대신 숨긴다
                  if (!value) {
                    return null;
                  }

                  return (
                    <div key={section.key} className={cn("rounded-2xl border px-3 py-2.5", section.boxClass)}>
                      <div className={cn("text-[11px] font-semibold", section.labelClass)}>
                        {section.title}
                      </div>
                      <div className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-[#4a4160]">
                        {value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
