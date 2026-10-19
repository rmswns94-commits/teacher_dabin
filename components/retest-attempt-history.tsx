import { toDateString } from "@/lib/dates";
import { formatRetestAttempt, retestDateLabel, type RetestAttempt } from "@/lib/retests";

// 재시험 카드 하단의 시도 점수 이력 — 이 재시험(parent) 자신의 시도만 받는다.
// 시도가 없으면(아직 재시험을 안 봤거나, 이 기능 이전의 미통과) 아무것도 그리지 않는다.
// 점수는 시도 row에 저장된 값 그대로 (원래 시험 총 문항으로 다시 계산하지 않음).
export function RetestAttemptHistory({ attempts }: { attempts: readonly RetestAttempt[] }) {
  if (attempts.length === 0) {
    return null;
  }
  return (
    <div className="rounded-xl border border-[#f1e6d2] bg-white/80 px-3 py-2" data-retest-attempts>
      <div className="text-xs font-semibold text-[#8a6828]">재시험 기록</div>
      <ol className="mt-1 space-y-0.5">
        {attempts.map((attempt) => (
          <li
            key={attempt.id}
            data-retest-attempt={attempt.attemptNo}
            className="flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums text-[#564d4d]"
          >
            <span className="break-words">{formatRetestAttempt(attempt)}</span>
            <span className="text-xs text-[#a79996]">{retestDateLabel(toDateString(new Date(attempt.attemptedAt)))}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
