"use client";

// Settings > 데이터 관리 > 저장된 데이터 전부 초기화.
// 삭제는 오직: 버튼 클릭 → 1차 경고 [계속] → "초기화" 직접 입력 → [데이터 전부 삭제] 경로로만.
// - 최종 확인 전에는 어떤 DB 호출도 없다.
// - 확인 문구는 trim 후 정확히 "초기화"일 때만 활성화 (IME-safe: 입력값을 재작성하지 않고
//   현재 value만 비교하므로 한글 조합 중간값은 그냥 불일치일 뿐이다).
// - 삭제 중에는 모든 버튼/ESC 잠금 + busy ref로 double-submit 방지.
// - 성공 시: 업무 context localStorage(학생 카드 접힘 key)만 정리하고
//   화면 설정(dabin-font-size/dabin-theme/dabin-sidebar-collapsed)은 유지.
//   localStorage.clear()는 절대 사용하지 않는다.
// - 계정/로그인 세션은 그대로 — 성공 화면에서 대시보드(빈 상태)로 이동한다.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { resetTeacherWorkspaceAction } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";

const CONFIRM_TEXT = "초기화";
// 업무 데이터 context에 종속된 로컬 UI 상태 key prefix — 초기화 시 함께 제거
const WORK_CONTEXT_KEY_PREFIXES = ["dabin-daily-log-collapsed:"];

function clearWorkContextLocalState() {
  try {
    const removable: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && WORK_CONTEXT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        removable.push(key);
      }
    }
    for (const key of removable) {
      localStorage.removeItem(key);
    }
  } catch {
    // storage 접근 불가 — DB 초기화 자체에는 영향 없음
  }
  try {
    sessionStorage.removeItem("week-scroll-today");
  } catch {
    // 무시
  }
}

type Step = "closed" | "warn" | "confirm" | "done";

export function WorkspaceReset() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const busyRef = useRef(false);

  const confirmMatches = confirmText.trim() === CONFIRM_TEXT;

  const openDialog = () => {
    setConfirmText("");
    setError("");
    setStep("warn");
  };

  const closeDialog = () => {
    if (busyRef.current) {
      return; // 삭제 중에는 닫지 않는다
    }
    setStep("closed");
    setConfirmText("");
    setError("");
  };

  const runReset = () => {
    if (busyRef.current || !confirmMatches) {
      return;
    }
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await resetTeacherWorkspaceAction();
        if ("error" in result) {
          setError(result.error);
          return;
        }
        // 서버 트랜잭션 성공 이후에만 로컬 정리/성공 표시
        clearWorkContextLocalState();
        setStep("done");
      } finally {
        busyRef.current = false;
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={openDialog}
        className="min-h-[44px] gap-1.5 border-[#f0ccc7] bg-[#fffdfb] text-[#96534c] hover:bg-[#fff0ef]"
      >
        <Trash2 className="h-4 w-4" aria-hidden /> 저장된 데이터 전부 초기화
      </Button>

      {step !== "closed" ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="저장된 데이터 전부 초기화"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeDialog();
            }
          }}
        >
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            {step === "warn" ? (
              <>
                <div className="card-title text-[#2a2323]">저장된 데이터를 전부 초기화할까요?</div>
                <p className="mt-2 text-sm leading-5 text-[#655d5d]">
                  학생, 수업 그룹, 수업 일지, 숙제, 할 일, 출결, 학생 평가, 시험 대비, 보충 수업,
                  성장 기록 등 <span className="font-medium text-[#2d2928]">현재 학원에서</span>{" "}
                  입력한 업무 데이터가 모두 삭제됩니다. 다른 학원의 데이터는 삭제되지 않아요.
                </p>
                <p className="mt-2 text-sm font-medium leading-5 text-[#96534c]">
                  삭제한 데이터는 복구할 수 없습니다.
                </p>
                <p className="mt-2 text-sm leading-5 text-[#655d5d]">
                  로그인 계정과 화면 설정은 삭제되지 않아요. 삭제 전 필요한 자료(엑셀 내보내기)를
                  먼저 받아뒀는지 확인해주세요.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" autoFocus onClick={closeDialog}>
                    취소
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-[#f0ccc7] text-[#96534c] hover:bg-[#fff0ef]"
                    onClick={() => setStep("confirm")}
                  >
                    계속
                  </Button>
                </div>
              </>
            ) : step === "confirm" ? (
              <>
                <div className="card-title text-[#2a2323]">마지막 확인이에요</div>
                <p className="mt-2 text-sm leading-5 text-[#655d5d]">
                  계속하려면 아래에 <span className="font-semibold text-[#96534c]">초기화</span>를
                  입력해주세요.
                </p>
                <input
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  disabled={isPending}
                  aria-label="초기화 확인 문구 입력"
                  autoComplete="off"
                  className="mt-3 w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none focus:border-[#e3bcb4]"
                  placeholder={CONFIRM_TEXT}
                />
                {error ? (
                  <p role="status" className="mt-2 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
                    {error}
                  </p>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    disabled={isPending}
                    onClick={closeDialog}
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 bg-[#96534c] text-white hover:bg-[#7f4640] active:shadow-none"
                    disabled={!confirmMatches || isPending}
                    onClick={runReset}
                  >
                    {isPending ? "삭제 중…" : "데이터 전부 삭제"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="card-title text-[#2a2323]">저장된 업무 데이터를 모두 초기화했어요</div>
                <p className="mt-2 text-sm leading-5 text-[#655d5d]">
                  로그인 계정과 화면 설정은 그대로 유지돼요. 이제 새 학생과 수업 그룹을 처음부터
                  다시 만들 수 있어요.
                </p>
                <div className="mt-4">
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => {
                      setStep("closed");
                      router.push("/dashboard");
                    }}
                  >
                    대시보드로 이동
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
