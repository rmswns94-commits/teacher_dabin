"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { reconcileExamModesAction } from "@/app/groups/exam-mode-actions";
import { anyRegisteredFormDirty } from "@/components/unsaved-guard";

// AUTO EXAM MODE OFF 트리거 (client, AppShell에 1개).
// - 언제: 인증된 화면 마운트(앱 열기/F5), 경로 이동(대시보드/그룹/시험 등 어디든), 탭 복귀/포커스(60초 throttle),
//   그리고 다음 KST 자정 직후 one-shot 재검사 (시험 마지막 날 밤에 앱을 켜둔 경우 — 1분 polling 없음).
// - active=false(시험 대비 ON 그룹이 하나도 없음)면 아무 요청도 보내지 않는다.
// - 전환이 있으면 toast 1회 + router.refresh() (작성 중인 폼이 dirty면 refresh는 건너뛰어 입력을 보호 —
//   다음 이동에서 서버 상태가 반영된다). 같은 전환은 DB가 이미 OFF라 다시 발생하지 않는다 (멱등).
const FOCUS_THROTTLE_MS = 60_000;
const KST_OFFSET_MS = 9 * 3600_000;

function msUntilNextKstMidnight(now: number) {
  const kst = now + KST_OFFSET_MS;
  const nextMidnightKst = Math.floor(kst / 86_400_000) * 86_400_000 + 86_400_000;
  return nextMidnightKst - kst + 3_000;
}

export function ExamModeReconciler({ active }: { active: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<string | null>(null);
  const inFlight = useRef(false);
  const lastRun = useRef(0);

  useEffect(() => {
    if (!active) {
      return;
    }
    let disposed = false;
    let toastTimer: number | null = null;
    const run = async () => {
      if (inFlight.current || disposed) {
        return;
      }
      inFlight.current = true;
      try {
        const result = await reconcileExamModesAction();
        lastRun.current = Date.now();
        if (disposed || !result.success || result.turnedOff.length === 0) {
          return;
        }
        const names = result.turnedOff.map((group) => group.name).join(", ");
        setToast(`${names}의 모든 학교 시험이 끝나 시험 대비 모드가 자동 종료됐어요.`);
        if (toastTimer !== null) {
          window.clearTimeout(toastTimer);
        }
        toastTimer = window.setTimeout(() => setToast(null), 7_000);
        // 작성 중(dirty) 폼이 있으면 refresh로 입력을 흔들지 않는다 — DB는 이미 OFF, 다음 이동에서 반영
        if (!anyRegisteredFormDirty()) {
          router.refresh();
        }
      } finally {
        inFlight.current = false;
      }
    };

    void run(); // 마운트 / 경로 이동
    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (Date.now() - lastRun.current >= FOCUS_THROTTLE_MS) {
        void run();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const midnight = window.setTimeout(() => void run(), msUntilNextKstMidnight(Date.now()));
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearTimeout(midnight);
      if (toastTimer !== null) {
        window.clearTimeout(toastTimer);
      }
    };
  }, [active, pathname, router]);

  if (!toast) {
    return null;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      data-exam-auto-off-toast
      className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[90] flex justify-center px-4"
    >
      <div className="pointer-events-auto max-w-md rounded-2xl border border-[#e8c9b0] bg-[#fdf1e6]/95 px-4 py-3 text-sm text-[#7a4f2e] shadow-[0_12px_32px_rgba(60,48,90,0.18)] backdrop-blur">
        🎓 {toast}
      </div>
    </div>
  );
}
