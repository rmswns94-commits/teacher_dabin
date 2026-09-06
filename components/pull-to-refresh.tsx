"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { anyRegisteredFormDirty } from "@/components/unsaved-guard";

// 당겨서 새로고침 (터치 기기 전용).
// 이 앱은 body가 아닌 페이지 내부 컨테이너(h-screen overflow-y-auto)가 스크롤되고
// iOS 홈 화면 설치(standalone)도 지원해서 브라우저 기본 pull-to-refresh가 동작하지
// 않는다 — 스크롤이 맨 위일 때 아래로 당겼다 떼면 전체 새로고침한다.
const ACTIVATE_AFTER_PX = 8; // 이만큼 아래로 움직여야 당김으로 인식 (탭/미세 움직임 무시)
const DAMPING = 0.4; // 손가락 이동량 대비 인디케이터 이동 비율 (고무줄 느낌)
const THRESHOLD_PX = 60; // 댐핑 적용 후 이 거리 이상 당기면 손을 뗄 때 새로고침
const MAX_PULL_PX = 100;
const HIDDEN_Y = -56; // 인디케이터 숨김 위치 (자기 높이보다 위)

// 터치 지점에서 실제로 스크롤되는 조상 요소를 찾는다 (없으면 문서 스크롤 기준)
function scrollableAncestor(start: Element | null): Element | null {
  let el: Element | null = start;
  while (el && el !== document.body && el !== document.documentElement) {
    const overflowY = window.getComputedStyle(el).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return document.scrollingElement;
}

export function PullToRefresh() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let container: Element | null = null;
    let tracking = false; // touchstart 이후 후보 상태
    let active = false; // 실제 당김 제스처로 확정된 상태
    let dist = 0;

    const setIndicator = (y: number, opacity: number, animate: boolean) => {
      const el = wrapRef.current;
      if (!el) {
        return;
      }
      el.style.transition = animate ? "transform 0.2s ease, opacity 0.2s ease" : "none";
      el.style.transform = `translate(-50%, ${y}px)`;
      el.style.opacity = String(opacity);
      const icon = iconRef.current;
      if (icon && !refreshingRef.current) {
        // 당긴 만큼 아이콘을 돌려 "거의 다 왔다"는 감각을 준다
        icon.style.transform = `rotate(${Math.min(dist / THRESHOLD_PX, 1) * 270}deg)`;
      }
    };

    const reset = () => {
      tracking = false;
      active = false;
      dist = 0;
      setIndicator(HIDDEN_Y, 0, true);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      container = scrollableAncestor(event.target instanceof Element ? event.target : null);
      tracking = true;
      active = false;
      dist = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || refreshingRef.current || event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;

      if (!active) {
        if (Math.abs(dx) > Math.abs(dy)) {
          tracking = false; // 가로 제스처(스와이프/가로 스크롤)는 건드리지 않는다
          return;
        }
        if (dy <= ACTIVATE_AFTER_PX) {
          return;
        }
        if (container && container.scrollTop > 0) {
          tracking = false; // 맨 위가 아니면 일반 스크롤
          return;
        }
        if (anyRegisteredFormDirty()) {
          tracking = false; // 작성 중인 폼이 있으면 당겨서 새로고침으로 입력을 날리지 않는다
          return;
        }
        active = true;
      }

      if (dy <= 0) {
        reset();
        return;
      }

      // 컨테이너의 스크롤/iOS 바운스 대신 당김 제스처로 소비한다
      if (event.cancelable) {
        event.preventDefault();
      }
      dist = Math.min(dy * DAMPING, MAX_PULL_PX);
      setIndicator(dist + HIDDEN_Y + 12, Math.min(dist / 40, 1), false);
    };

    const onTouchEnd = () => {
      if (!tracking) {
        return;
      }
      if (active && dist >= THRESHOLD_PX) {
        refreshingRef.current = true;
        setRefreshing(true);
        const icon = iconRef.current;
        if (icon) {
          icon.style.transform = ""; // animate-spin과 충돌하지 않게 수동 회전 해제
        }
        setIndicator(20, 1, true);
        // 스피너가 잠깐 보인 뒤 전체 새로고침
        window.setTimeout(() => window.location.reload(), 150);
        return;
      }
      reset();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className="pointer-events-none fixed left-1/2 top-0 z-[100]"
      style={{ transform: `translate(-50%, ${HIDDEN_Y}px)`, opacity: 0 }}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#efe4dc] bg-white shadow-[0_8px_24px_rgba(120,109,164,0.22)]">
        <span ref={iconRef} className={`flex ${refreshing ? "animate-spin" : ""}`}>
          <RefreshCw className="h-5 w-5 text-[#6852b8]" />
        </span>
      </span>
    </div>
  );
}
