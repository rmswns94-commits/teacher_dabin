"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Daily Log 섹션 빠른 이동 — 같은 페이지 내부 scroll만 수행한다
// (router 이동/URL hash 없음, DB 조회/저장 없음, 폼 state 무접촉).
// active 추적: IntersectionObserver는 "밴드 겹침" 경계에서만 발화해 학생 평가처럼
// 키 큰 섹션이 일찍 겹친 뒤로는 콜백이 오지 않아 상단선 추적에 맞지 않았다 —
// 대신 passive scroll listener + rAF throttle(프레임당 섹션 4개 rect만 측정)을 쓴다.
// active state는 이 컴포넌트 안에만 있어 스크롤로 폼이 재렌더되지 않는다.

// 섹션 anchor의 scroll-mt-24(96px)와 맞춘 상단 여유 — sticky nav에 제목이 가리지 않게.
// (main 스크롤 컨테이너의 py-6 패딩 때문에 sticky nav 하단이 ~80px에 위치한다)
const NAV_OFFSET_PX = 96;

export type DailyLogSection = { id: string; label: string };

// 폼의 실제 섹션 anchor id (progress/attendance는 대시보드 빠른 실행 hash와 공유되는 기존 id)
export const DAILY_LOG_NAV_SECTIONS: DailyLogSection[] = [
  { id: "progress", label: "진도" },
  { id: "homework", label: "숙제" },
  { id: "attendance", label: "학생 평가" },
  { id: "next-plan", label: "다음 계획" },
];

export function DailyLogSectionNav({ sections }: { sections: DailyLogSection[] }) {
  const navRef = useRef<HTMLElement | null>(null);
  const [available, setAvailable] = useState<DailyLogSection[]>([]);
  const [active, setActive] = useState<string | null>(null);
  // 점프 직후 smooth scroll이 지나가는 중간 섹션으로 active가 깜빡이지 않게,
  // 목적지 섹션이 기준선에 도달할 때까지 scroll 추적을 잠시 보류한다
  const pendingJumpRef = useRef<string | null>(null);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    // reduced-motion 사용자는 즉시 이동. scroll 위치는 anchor의 scroll-margin-top이 잡는다.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    // 클릭 목적지는 즉시 active — 도달 전까지 scroll 추적이 중간 섹션으로 덮지 않는다
    pendingJumpRef.current = id;
    setActive(id);
  };

  // 1단계: 실제로 렌더된 섹션만 nav에 표시 — 없는 섹션으로 scroll을 시도하지 않는다.
  // (setState는 rAF 콜백에서 — effect 본문 동기 setState로 인한 cascading render 방지)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setAvailable(sections.filter((section) => document.getElementById(section.id)));
    });
    return () => cancelAnimationFrame(raf);
  }, [sections]);

  // 2단계: nav가 실제로 렌더된 뒤(available 반영 후)에만 scroll 추적을 부착한다.
  // 첫 렌더에서는 nav가 없어 navRef가 null이라, 이 시점에 붙여야 main을 찾을 수 있다.
  useEffect(() => {
    if (available.length === 0) {
      return;
    }
    const found = available;

    // 이 앱의 페이지 스크롤 컨테이너는 window가 아니라 <main class="h-screen overflow-y-auto">
    const rootEl = navRef.current?.closest("main") ?? null;

    // active = 화면 상단(offset 기준선)을 지난 섹션 중 가장 아래 것 — DOM 순서와 무관하게
    // rect 기준으로 판정한다 (nav 버튼 순서와 폼 배치 순서가 달라도 안전).
    const update = () => {
      const rootTop = rootEl ? rootEl.getBoundingClientRect().top : 0;
      // 점프 진행 중: 목적지가 기준선에 도달(또는 지나침)하면 추적 재개, 그 전엔 유지
      const pending = pendingJumpRef.current;
      if (pending) {
        const pendingEl = document.getElementById(pending);
        const pendingTop = pendingEl ? pendingEl.getBoundingClientRect().top - rootTop : 0;
        if (pendingTop <= NAV_OFFSET_PX + 32) {
          pendingJumpRef.current = null;
        } else {
          return;
        }
      }
      let currentId: string | null = null;
      let currentTop = -Infinity;
      let firstId: string | null = null;
      let firstTop = Infinity;
      for (const section of found) {
        const el = document.getElementById(section.id);
        if (!el) {
          continue;
        }
        const top = el.getBoundingClientRect().top - rootTop;
        if (top < firstTop) {
          firstTop = top;
          firstId = section.id;
        }
        if (top <= NAV_OFFSET_PX + 32 && top > currentTop) {
          currentTop = top;
          currentId = section.id;
        }
      }
      const next = currentId ?? firstId;
      setActive((prev) => (prev === next ? prev : next));
    };

    // 초기 active 계산도 rAF 콜백에서 (이후 갱신은 scroll 콜백에서만)
    const raf = requestAnimationFrame(update);
    // passive + rAF throttle — 프레임당 최대 1회, 섹션 4개 rect 측정뿐 (무거운 layout loop 없음)
    let scrollRaf = 0;
    const onScroll = () => {
      if (scrollRaf) {
        return;
      }
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        update();
      });
    };
    const scrollTarget: HTMLElement | Window = rootEl ?? window;
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      if (scrollRaf) {
        cancelAnimationFrame(scrollRaf);
      }
      scrollTarget.removeEventListener("scroll", onScroll);
    };
  }, [available]);

  if (available.length === 0) {
    return null;
  }

  return (
    <nav
      ref={navRef}
      aria-label="일지 섹션 빠른 이동"
      className="sticky top-0 z-20 flex gap-1.5 overflow-x-auto rounded-2xl border border-[#efe4dc] bg-[#fffdfb]/95 px-2 py-1.5 shadow-[0_6px_18px_rgba(60,48,90,0.06)] backdrop-blur"
    >
      {available.map((section) => (
        <button
          key={section.id}
          type="button"
          aria-current={active === section.id ? "true" : undefined}
          aria-label={`${section.label} 영역으로 이동`}
          onClick={() => jump(section.id)}
          className={cn(
            "min-h-[40px] shrink-0 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition",
            active === section.id
              ? "bg-[#f0ecfb] text-[#54479c]"
              : "text-[#6b6b74] hover:bg-[#f4f4f6]",
          )}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
