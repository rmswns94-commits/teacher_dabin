"use client";

import { useSyncExternalStore } from "react";
import { ALargeSmall } from "lucide-react";

// 글씨 크기 (설정 > 화면 설정) — 기본 / 크게 / 아주 크게.
// 저장은 localStorage("dabin-font-size") — 이 기기/브라우저의 표시 설정이라 DB에 두지 않는다
// (새 column 없음). 실제 적용은 html[data-font-size] 속성 하나 — globals.css의
// --font-scale 배율이 텍스트 토큰/유틸리티에만 곱해진다 (아이콘/여백/Excel 불변).
// 첫 페인트 전 적용은 layout.tsx head 스크립트가 담당 (다크 모드와 같은 패턴 — FOUC 없음).
const STORAGE_KEY = "dabin-font-size";

type FontSize = "default" | "large" | "xlarge";

const SIZES: { value: FontSize; label: string }[] = [
  { value: "default", label: "기본" },
  { value: "large", label: "크게" },
  { value: "xlarge", label: "아주 크게" },
];

function applyFontSize(size: FontSize) {
  if (size === "large" || size === "xlarge") {
    document.documentElement.dataset.fontSize = size;
  } else {
    delete document.documentElement.dataset.fontSize;
  }
}

// useSyncExternalStore 패턴 (화면 모드와 동일) — SSR에서는 localStorage에
// 접근하지 않고(null → 선택 미표시), client에서 저장값을 안전하게 구독한다.
const CHANGE_EVENT = "dabin-font-size-change";
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
};
const getSnapshot = (): FontSize => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "large" || saved === "xlarge" ? saved : "default";
  } catch {
    return "default";
  }
};
const getServerSnapshot = (): FontSize | null => null;

export function FontSizeControl() {
  const size = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const select = (next: FontSize) => {
    try {
      if (next === "default") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // 저장 실패(사파리 프라이빗 등)여도 이번 세션 적용은 진행
    }
    applyFontSize(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <div>
      <div role="radiogroup" aria-label="글씨 크기" className="grid grid-cols-3 gap-2">
        {SIZES.map(({ value, label }) => {
          const active = size === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => select(value)}
              className={
                active
                  ? "flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#c9b9e8] bg-[#eeeafb] px-2 text-sm font-semibold text-[#5d4ba5]"
                  : "flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#ece0db] bg-white px-2 text-sm font-medium text-[#564d4d] transition hover:bg-[#faf6f3]"
              }
            >
              <ALargeSmall className="h-4 w-4" aria-hidden />
              {label}
              {active ? <span aria-hidden>✓</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-[#8a7b77]">
        앱의 글씨 크기만 커져요. 선택한 설정은 이 기기에 자동 저장돼요.
      </p>
    </div>
  );
}
