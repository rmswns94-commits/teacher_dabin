"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

// 화면 모드 (설정 > 화면 설정) — light / dark / system.
// 저장은 localStorage("dabin-theme") — 이 기기/브라우저의 표시 설정이라 DB에 두지 않는다.
// 실제 적용(html.dark 클래스)은 layout.tsx의 head 스크립트와 같은 규칙을 공유한다:
// 저장값 없음 = 라이트(기존 사용자 화면 그대로), system = OS prefers-color-scheme.
const STORAGE_KEY = "dabin-theme";

type ThemeMode = "light" | "dark" | "system";

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "라이트", icon: Sun },
  { value: "dark", label: "다크", icon: Moon },
  { value: "system", label: "시스템", icon: Monitor },
];

function applyTheme(mode: ThemeMode) {
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// useSyncExternalStore 패턴 (사이드바 접기와 동일) — SSR에서는 localStorage에
// 접근하지 않고(null → 선택 미표시), client에서 저장값을 안전하게 구독한다.
const CHANGE_EVENT = "dabin-theme-change";
const subscribeMode = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
};
const getModeSnapshot = (): ThemeMode => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "dark" || saved === "system" ? saved : "light";
  } catch {
    return "light";
  }
};
const getModeServerSnapshot = (): ThemeMode | null => null;

export function ThemeModeControl() {
  const mode = useSyncExternalStore(subscribeMode, getModeSnapshot, getModeServerSnapshot);

  const select = (next: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 저장 실패(사파리 프라이빗 등)여도 이번 세션 적용은 진행
    }
    applyTheme(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <div>
      <div role="radiogroup" aria-label="화면 모드" className="grid grid-cols-3 gap-2">
        {MODES.map(({ value, label, icon: Icon }) => {
          const active = mode === value;
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
              <Icon className="h-4 w-4" aria-hidden />
              {label}
              {active ? <span aria-hidden>✓</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[#8a7b77]">
        선택한 설정은 자동 저장돼요. 시스템을 고르면 기기의 라이트/다크 설정을 따라가요.
      </p>
    </div>
  );
}
