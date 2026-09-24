"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import {
  growthAwardGuideIntro,
  growthAwardGuideItems,
  growthAwardGuideKingText,
  growthAwardGuideNotes,
} from "@/lib/growth-awards";
import type { GrowthViewMode } from "@/lib/growth-note";

// 성장노트 "왕은 어떻게 선정되나요?" 안내 카드 — 알고리즘 설명 UI일 뿐 (계산/쿼리/저장 없음).
// 기본 collapsed, 열림 상태는 local state (DB/localStorage 저장 금지).
// 주간↔월간 전환은 URL 소프트 내비게이션이라 이 컴포넌트는 remount 없이 mode prop만 바뀐다 → 열림 유지.
// Winner 근거("왜 이 학생인가")는 GrowthAwardsBoard 담당 — 여기와 state를 공유하지 않는다.
const toggleClass =
  "tap-press-subtle inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-[#d8cdf0] bg-white/80 px-3.5 text-sm font-semibold text-[#5d4ba5] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b9a5e3]";

export function GrowthAwardGuideCard({ mode }: { mode: GrowthViewMode }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const items = growthAwardGuideItems(mode);

  return (
    <section
      data-growth-award-guide
      data-open={open ? "true" : "false"}
      className="mt-4 rounded-3xl border border-[#e6dcf3] bg-gradient-to-br from-[#fbf8ff] via-[#f8f3fd] to-[#fdf8f1] p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="card-title flex items-center gap-2 text-[#4e3f8a]">
            <span aria-hidden>🏆</span>
            왕은 어떻게 선정되나요?
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#7b6f8d]" data-growth-award-guide-intro>
            {growthAwardGuideIntro(mode)}
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
              선정 기준 보기 <ChevronDown className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </div>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="왕 선정 기준"
          className="mt-4 motion-safe:animate-in motion-safe:fade-in"
        >
          <h3 className="section-title text-[#4e3f8a]">성장 · 습관 왕 6종</h3>
          {/* Desktop/iPad 가로 2열, 좁은 폭 1열 — 고정 높이 없음 (Large Font에서도 잘리지 않게) */}
          <dl className="mt-2 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item.key} data-guide-award={item.key} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-base font-bold text-[#3a2f2c]">
                  <span aria-hidden>{item.emoji}</span>
                  {item.label}
                </dt>
                <dd className="mt-1 text-sm leading-6 text-[#5a5060]">{item.primary}</dd>
                <dd className="mt-0.5 text-sm leading-6 text-[#8a7b77]">{item.secondary}</dd>
                <dd className="caption-text mt-1 text-[#9d8fb6]" data-guide-minimum>
                  최소 기록 · {item.minimum}
                </dd>
              </div>
            ))}
          </dl>

          <div
            data-guide-award="kingOfKings"
            className="mt-4 rounded-2xl border border-[#eadfbf] bg-[#fffbee]/80 px-3.5 py-3"
          >
            <div className="flex items-center gap-1.5 text-base font-bold text-[#8a6a25]">
              <span aria-hidden>👑</span>
              왕중왕
            </div>
            <p className="mt-1 text-sm leading-6 text-[#7d6a3c]">{growthAwardGuideKingText(mode)}</p>
          </div>

          <div className="mt-4 rounded-2xl bg-white/60 px-3.5 py-3" data-guide-notes>
            <div className="caption-text text-[#8a7b77]">알아두기</div>
            <ul className="mt-1 space-y-1 text-sm leading-6 text-[#6b5f70]">
              {growthAwardGuideNotes().map((note) => (
                <li key={note} className="flex gap-1.5">
                  <span aria-hidden>•</span>
                  <span className="min-w-0">{note}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm leading-6 text-[#8a7b77]">
              개근 · 집중왕 같은 9개 성장왕 배지의 기준은{" "}
              <Link
                href="/growth-notes"
                prefetch={false}
                className="font-semibold text-[#5d4ba5] underline-offset-2 hover:underline"
              >
                성장노트 첫 화면
              </Link>
              에서 볼 수 있어요.
            </p>
          </div>

          <div className="mt-3 flex justify-end">
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
