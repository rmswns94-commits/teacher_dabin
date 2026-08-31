"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

// 홈 화면 standalone 실행 여부. 핵심 기능은 이 값에 의존하지 않는다(안내 UI 전용).
function subscribeDisplayMode(callback: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getStandaloneSnapshot() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

export function InstallAppButton() {
  const isStandalone = useSyncExternalStore(
    subscribeDisplayMode,
    getStandaloneSnapshot,
    () => false,
  );
  const [guideOpen, setGuideOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Chrome 계열은 native install prompt를 지원한다. iOS는 지원하지 않으므로 안내 다이얼로그를 쓴다.
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isStandalone) {
    return (
      <div className="flex items-center justify-center gap-1.5 px-3 py-1 text-[11px] text-[#8a8a93]">
        <Smartphone className="h-3.5 w-3.5" />
        앱으로 사용 중이에요
      </div>
    );
  }

  const handleClick = () => {
    if (installPrompt) {
      void installPrompt.prompt();
      setInstallPrompt(null);
      return;
    }

    setGuideOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#dcdce2] bg-white px-3 py-2 text-sm font-medium text-[#33333b] transition hover:bg-[#f4f4f6]"
      >
        <Smartphone className="h-4 w-4" />
        앱으로 사용하기
      </button>

      {guideOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="홈 화면에 추가하는 방법"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setGuideOpen(false);
            }
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setGuideOpen(false);
            }
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#26262b]/35 px-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#e6e6ea] bg-white p-6 shadow-xl">
            <div className="text-base font-bold text-[#232327]">앱처럼 사용하기</div>
            <p className="mt-1.5 text-xs text-[#6b6b74]">
              홈 화면에 추가하면 더 빠르게 강사일기를 열 수 있어요.
            </p>
            <ol className="mt-4 space-y-2.5 text-sm leading-6 text-[#3c3c45]">
              <li>
                1. Safari 아래의 <strong>공유</strong> 버튼을 눌러주세요.
              </li>
              <li>
                2. <strong>&ldquo;홈 화면에 추가&rdquo;</strong>를 선택해주세요.
              </li>
              <li>
                3. 오른쪽 위 <strong>&ldquo;추가&rdquo;</strong>를 눌러주세요.
              </li>
            </ol>
            <p className="mt-3 text-xs leading-5 text-[#8a8a93]">
              설치하면 홈 화면에서 다빈이의 강사일기를 바로 열 수 있어요.
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => setGuideOpen(false)}
              className="mt-5 w-full rounded-xl bg-[#2b2b31] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3a3a42]"
            >
              알겠어요
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
