"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// 전역 Quick Scroll 컨트롤: 오른쪽 상단 ↑(맨 위로) + 오른쪽 하단 ↓(맨 아래로).
// 이 앱은 window가 아니라 각 페이지의 <main>(h-screen overflow-y-auto)이 스크롤
// 컨테이너라서, AppShell에서 형제 main을 찾아 제어한다 (AppShell에 1회만 mount).
// - 콘텐츠가 짧아 스크롤이 없으면 둘 다 숨김
// - 최상단 근처에서는 ↑ 숨김, 최하단 근처에서는 ↓ 숨김, 중간에서는 둘 다 표시
// - 리스너는 1벌: scroll(rAF throttle) + resize + ResizeObserver(동적 높이),
//   route 변경 시 새 페이지 콘텐츠 기준으로 재바인딩
// - z-30: Dialog overlay(z-60+)/모바일 drawer(z-50)/모바일 상단 바(z-40) 아래 —
//   modal 조작을 방해하지 않고, ↑는 모바일 상단 바 아래(top 68px+safe-area)에 위치

const NO_SCROLL_SLACK = 160; // 이 이하로만 넘치는 페이지는 "스크롤 없음"으로 취급 → 둘 다 숨김
const TOP_THRESHOLD = 120; // 최상단에서 이만큼 내려와야 ↑ 표시 (경계 깜빡임 방지)
const BOTTOM_THRESHOLD = 120; // 남은 스크롤이 이만큼 미만이면 ↓ 숨김 (상단과 대칭 — 중간 구간에서 둘 다 표시)

type Visible = { top: boolean; bottom: boolean };

const HIDDEN: Visible = { top: false, bottom: false };

// 스크롤 컨테이너 = anchor의 부모(app-main div)의 직계 <main>
function findContainer(anchor: HTMLSpanElement | null) {
  return anchor?.parentElement?.querySelector<HTMLElement>(":scope > main") ?? null;
}

export function ScrollJumpControls() {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState<Visible>(HIDDEN);
  const pathname = usePathname();

  useEffect(() => {
    const container = findContainer(anchorRef.current);

    if (!container) {
      setVisible(HIDDEN);
      return;
    }

    let raf = 0;

    const update = () => {
      raf = 0;
      const { scrollTop, scrollHeight, clientHeight } = container;
      const hasScroll = scrollHeight > clientHeight + NO_SCROLL_SLACK;
      const next: Visible = {
        top: hasScroll && scrollTop > TOP_THRESHOLD,
        bottom: hasScroll && scrollTop + clientHeight < scrollHeight - BOTTOM_THRESHOLD,
      };

      // 값이 실제로 바뀔 때만 갱신 — 스크롤 이벤트마다 재렌더하지 않는다
      setVisible((prev) =>
        prev.top === next.top && prev.bottom === next.bottom ? prev : next,
      );
    };

    // scroll 이벤트마다 계산하지 않고 프레임당 1회로 묶는다
    const schedule = () => {
      if (!raf) {
        raf = requestAnimationFrame(update);
      }
    };

    schedule();
    container.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    // 상세 펼침/계획 추가 등으로 콘텐츠 높이가 동적으로 변해도 갱신
    const resizeObserver = new ResizeObserver(schedule);
    for (const child of container.children) {
      resizeObserver.observe(child);
    }

    return () => {
      container.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resizeObserver.disconnect();
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
    // pathname 변경 = 페이지 콘텐츠 교체 → 초기 상태 재계산 + 새 자식들 재관찰
  }, [pathname]);

  const jump = (to: "top" | "bottom") => {
    const container = findContainer(anchorRef.current);

    if (!container) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    container.scrollTo({
      top: to === "top" ? 0 : container.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  const buttonClass =
    "fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfe6] bg-white/90 text-[#8a7ba8] shadow-[0_2px_8px_rgba(120,109,164,0.14)] transition hover:bg-[#f5f1fb] hover:text-[#6d5aa8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c1e8] md:h-10 md:w-10";

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden />
      {visible.top ? (
        <button
          type="button"
          onClick={() => jump("top")}
          aria-label="페이지 맨 위로 이동"
          title="맨 위로"
          className={cn(
            buttonClass,
            // 모바일은 fixed 상단 바(h-14) 아래, lg+는 viewport 우상단 safe spacing
            "top-[calc(68px+env(safe-area-inset-top))] lg:top-[calc(16px+env(safe-area-inset-top))]",
          )}
        >
          <ChevronUp className="h-[18px] w-[18px]" aria-hidden />
        </button>
      ) : null}
      {visible.bottom ? (
        <button
          type="button"
          onClick={() => jump("bottom")}
          aria-label="페이지 맨 아래로 이동"
          title="맨 아래로"
          className={buttonClass}
          style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
        >
          <ChevronDown className="h-[18px] w-[18px]" aria-hidden />
        </button>
      ) : null}
    </>
  );
}
