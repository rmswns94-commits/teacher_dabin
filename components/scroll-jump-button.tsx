"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// 긴 페이지에서 위/아래로 빠르게 이동하는 floating 버튼.
// 이 앱은 window가 아니라 각 페이지의 <main>(h-screen overflow-y-auto)이
// 스크롤 컨테이너라서, AppShell에서 형제 main을 찾아 제어한다.
// - 콘텐츠가 짧으면 숨김
// - 하단 근처(남은 스크롤 < 240px)에서는 ↑(맨 위로)로 전환
// - Dialog가 열리면 overlay(z-60+) 아래에 깔려 조작을 방해하지 않는다 (z-30)

type JumpState = "hidden" | "down" | "up";

export function ScrollJumpButton() {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<JumpState>("hidden");

  const findContainer = () =>
    anchorRef.current?.parentElement?.querySelector<HTMLElement>(":scope > main") ?? null;

  useEffect(() => {
    const container = findContainer();

    if (!container) {
      return;
    }

    let raf = 0;

    const update = () => {
      raf = 0;
      const { scrollTop, scrollHeight, clientHeight } = container;

      if (scrollHeight <= clientHeight + 160) {
        setState("hidden");
      } else if (scrollTop + clientHeight >= scrollHeight - 240) {
        setState("up");
      } else {
        setState("down");
      }
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

    // 상세 펼침 등으로 콘텐츠 높이가 동적으로 변해도 갱신
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
  }, []);

  const jump = () => {
    const container = findContainer();

    if (!container) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    container.scrollTo({
      top: state === "up" ? 0 : container.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  const label = state === "up" ? "맨 위로 이동" : "맨 아래로 이동";

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden />
      {state !== "hidden" ? (
        <button
          type="button"
          onClick={jump}
          aria-label={label}
          title={label}
          className="fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfe6] bg-white/90 text-[#8a7ba8] shadow-[0_2px_8px_rgba(120,109,164,0.14)] transition hover:bg-[#f5f1fb] hover:text-[#6d5aa8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c1e8] md:h-10 md:w-10"
          style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
        >
          {state === "up" ? (
            <ChevronUp className="h-[18px] w-[18px]" aria-hidden />
          ) : (
            <ChevronDown className="h-[18px] w-[18px]" aria-hidden />
          )}
        </button>
      ) : null}
    </>
  );
}
