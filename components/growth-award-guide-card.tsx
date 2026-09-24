"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState } from "react";

import { buildGrowthGuide } from "@/lib/growth-guide";
import type { GrowthViewMode } from "@/lib/growth-note";
import { cn } from "@/lib/utils";

// 성장노트 "왕은 어떻게 선정되나요?" 안내 카드 — 알고리즘 설명 UI일 뿐 (계산/쿼리/저장 없음).
// 항목은 lib/growth-guide의 buildGrowthGuide(mode) 하나에서 온다 (9개 성장왕 + 6개 왕 registry map).
// 기본 collapsed, 열림 상태는 local state (DB/localStorage 저장 금지).
// 주간↔월간 전환은 URL 소프트 내비게이션이라 remount 없이 mode prop만 바뀐다 → 열림 유지.
// Winner 근거("왜 이 학생인가")는 GrowthAwardsBoard 담당 — 여기와 state를 공유하지 않는다.
const toggleClass =
  "tap-press-subtle inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-[#d8cdf0] bg-white/80 px-3.5 text-sm font-semibold text-[#5d4ba5] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b9a5e3]";

function GuideItem({
  emoji,
  label,
  primary,
  secondary,
  minimum,
  ...rest
}: {
  emoji: string;
  label: string;
  primary: string;
  secondary: string;
  minimum: string;
  [dataAttr: `data-${string}`]: string;
}) {
  // 왕 하나 = compact item (카드 안의 카드 금지, 고정 높이 없음 — Large Font에서 내용만큼 늘어난다)
  return (
    <div {...rest} className="min-w-0">
      <dt className="flex items-center gap-1.5 text-base font-bold text-[#3a2f2c]">
        <span aria-hidden>{emoji}</span>
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-6 text-[#5a5060]">{primary}</dd>
      <dd className="mt-0.5 text-sm leading-6 text-[#8a7b77]">{secondary}</dd>
      <dd className="caption-text mt-1 text-[#9d8fb6]" data-guide-minimum>
        기준 · {minimum}
      </dd>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h3 className="section-title text-[#4e3f8a]">{title}</h3>
      <p className="text-sm text-[#8a7b77]">{subtitle}</p>
    </div>
  );
}

export function GrowthAwardGuideCard({ mode }: { mode: GrowthViewMode }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const guide = buildGrowthGuide(mode);

  return (
    <section
      data-growth-award-guide
      data-open={open ? "true" : "false"}
      data-guide-total={guide.totalCount}
      className="mt-4 rounded-3xl border border-[#e6dcf3] bg-gradient-to-br from-[#fbf8ff] via-[#f8f3fd] to-[#fdf8f1] p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="card-title flex items-center gap-2 text-[#4e3f8a]">
            <span aria-hidden>🏆</span>
            왕은 어떻게 선정되나요?
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#7b6f8d]" data-growth-award-guide-intro>
            {guide.intro}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          data-growth-award-guide-toggle="top"
          onClick={() => setOpen((prev) => !prev)}
          className={toggleClass}
        >
          {open ? (
            <>
              접기 <ChevronUp className="h-4 w-4" aria-hidden />
            </>
          ) : (
            <>
              {guide.toggleLabel} <ChevronDown className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </div>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="왕 선정 기준"
          className="mt-4 space-y-5 motion-safe:animate-in motion-safe:fade-in"
        >
          {/* 9개 성장왕 — 짧은 설명이라 넓은 폭 3열 / iPad 2열 / 좁은 폭 1열 */}
          <div data-guide-section="badges">
            <SectionHeading title={guide.badges.title} subtitle={guide.badges.subtitle} />
            <dl className={cn("mt-2 grid gap-x-5 gap-y-4", "sm:grid-cols-2 lg:grid-cols-3")}>
              {guide.badges.items.map((item) => (
                <GuideItem
                  key={item.type}
                  data-guide-badge={item.type}
                  emoji={item.emoji}
                  label={item.label}
                  primary={item.primary}
                  secondary={item.secondary}
                  minimum={item.minimum}
                />
              ))}
            </dl>
          </div>

          {/* 6개 왕 — 설명이 길어 2열까지만 (3열은 줄바꿈이 심해진다) */}
          <div data-guide-section="awards">
            <SectionHeading title={guide.awards.title} subtitle={guide.awards.subtitle} />
            <dl className="mt-2 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {guide.awards.items.map((item) => (
                <GuideItem
                  key={item.key}
                  data-guide-award={item.key}
                  emoji={item.emoji}
                  label={item.label}
                  primary={item.primary}
                  secondary={item.secondary}
                  minimum={item.minimum}
                />
              ))}
            </dl>
          </div>

          {/* 왕중왕 — 15개에 포함되지 않는 종합 타이틀 (별도 설명) */}
          <div data-guide-king className="rounded-2xl border border-[#eadfbf] bg-[#fffbee]/80 px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-base font-bold text-[#8a6a25]">
              <span aria-hidden>👑</span>
              왕중왕
            </div>
            <p className="mt-1 text-sm leading-6 text-[#7d6a3c]">{guide.kingText}</p>
          </div>

          <div className="rounded-2xl bg-white/60 px-3.5 py-3" data-guide-notes>
            <div className="caption-text text-[#8a7b77]">선정 원칙</div>
            <ul className="mt-1 space-y-1 text-sm leading-6 text-[#6b5f70]">
              {guide.notes.map((note) => (
                <li key={note} className="flex gap-1.5">
                  <span aria-hidden>•</span>
                  <span className="min-w-0">{note}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              data-growth-award-guide-toggle="bottom"
              onClick={() => setOpen(false)}
              className={toggleClass}
            >
              접기 <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
