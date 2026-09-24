"use client";

import { ChevronLeft, ChevronRight, CirclePlay } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ExamPeriodMark } from "@/components/exam-period-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  adjacentOccurrenceKeys,
  autoFocusOccurrence,
  isOccurrenceActive,
  resolveClassCardMode,
  resolveViewedKey,
  type CardSelection,
  type ClassCardMode,
} from "@/lib/class-card-state";

// Smart Briefing 카드 (client shell) — 오늘의 실제 수업 occurrence 목록을 받아
// "어떤 occurrence를 어떤 mode로 보여줄지"만 결정한다. 본문(브리핑/마무리)은 서버가 occurrence마다
// 미리 렌더해 내려준 ReactNode라, 이전/다음/자동 전환 어디에서도 브라우저→DB 요청이 0이다.
// - 시각은 30초 local tick(+PWA 복귀 시 즉시 재평가)뿐 — DB polling/Realtime/주기적 router.refresh 없음.
// - 수동 탐색(이전/다음)은 이 컴포넌트의 local state뿐 — DB mutation 0, 현재 수업 타이머(hero)는 별개.
// - 새 실제 수업이 시작되면(자동 focus 변경) 탐색 중이어도 그 수업의 브리핑으로 자동 전환된다.
export type ClassCardEntry = {
  key: string; // occurrenceKey — 선택 state의 stable id
  groupId: string;
  groupName: string;
  groupIcon: string | null;
  examPeriod: boolean;
  supplement: boolean;
  startTime: string; // "HH:MM" (effective — 시간 변경/이동/보강 반영)
  endTime: string;
  startEpoch: number;
  endEpoch: number;
  // canonical identity(user+group+lesson_date)의 Daily Log가 Finalized(completed)인가
  finalized: boolean;
  briefing: ReactNode;
  wrapUp: ReactNode;
};

const MODE_LABEL: Record<ClassCardMode, string> = {
  briefing: "수업 브리핑",
  wrap_up_incomplete: "수업 마무리",
  wrap_up_complete: "수업 마무리",
};

export function ClassBriefingCard({
  cards,
  initialNow,
}: {
  cards: ClassCardEntry[];
  // 서버 렌더 시각 — hydration mismatch 방지용 (mount 직후 실제 시각으로 동기화)
  initialNow: number;
}) {
  const [now, setNow] = useState(initialNow);
  const [selection, setSelection] = useState<CardSelection | null>(null);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh(); // mount 직후 실제 브라우저 시각으로 동기화
    const interval = setInterval(refresh, 30_000);
    // iPad PWA background 복귀 시 stale 시각으로 잘못 판정하지 않게 즉시 재평가
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const auto = autoFocusOccurrence(cards, now);
  const autoKey = auto?.key ?? null;
  const viewedKey = resolveViewedKey(selection, autoKey);
  const viewed = cards.find((card) => card.key === viewedKey) ?? cards[0];

  if (!viewed) {
    return null;
  }

  const { previous, next, index } = adjacentOccurrenceKeys(
    cards.map((card) => card.key),
    viewed.key,
  );
  const mode = resolveClassCardMode(viewed, now, viewed.finalized);
  const active = isOccurrenceActive(viewed, now);
  const currentExists = cards.some((card) => isOccurrenceActive(card, now));
  const browsing = viewed.key !== autoKey;

  const select = (key: string | null) => setSelection(key ? { key, autoKey } : null);

  return (
    <Card
      className="mt-4 rounded-3xl border-[#e8ddf3] bg-[#fdfbf8] shadow-[0_2px_12px_rgba(90,70,120,0.06)]"
      data-class-card
      data-mode={mode}
      data-occurrence-key={viewed.key}
      data-group-id={viewed.groupId}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
            <span aria-hidden>{viewed.groupIcon ?? "📘"}</span>
            <span className="min-w-0 break-words">
              {viewed.groupName} {MODE_LABEL[mode]}
            </span>
            {/* 시험 기간 표시 — 브리핑/마무리 어느 mode든 그룹 상태 그대로 (ExamPeriodMark 공용) */}
            <ExamPeriodMark show={viewed.examPeriod} className="text-sm" />
            {viewed.supplement ? (
              <span className="shrink-0 rounded-full bg-[#e4f4ec] px-2 py-0.5 text-xs font-semibold text-[#3d7f64]">
                보강
              </span>
            ) : null}
          </CardTitle>
          <span
            className={
              mode === "briefing"
                ? "rounded-full bg-[#efe8fb] px-2.5 py-1 text-sm font-medium tabular-nums text-[#5d4ba5]"
                : "rounded-full bg-[#f6f1ec] px-2.5 py-1 text-sm font-medium tabular-nums text-[#7b6f6a]"
            }
            data-class-card-pill
          >
            {mode === "briefing"
              ? active
                ? "지금 수업 중"
                : `${viewed.startTime} 시작`
              : `수업 종료 · ${viewed.startTime}~${viewed.endTime}`}
          </span>
        </div>
        <p className="secondary-text mt-1 text-[#8a7b77]">
          {mode === "briefing"
            ? "오늘 체크할 것"
            : mode === "wrap_up_complete"
              ? "오늘 수업 기록이 저장되었어요"
              : "수업이 끝났어요 — 일지를 마무리해요"}
        </p>

        {/* 오늘 수업 흐름 탐색 — 오늘 실제 수업이 2개 이상일 때만. 좁은 화면에서는 header 아래
            별도 줄이라 반 이름/시험 표시와 겹치지 않는다 (버튼 높이 40px 이상 = 터치 타깃). */}
        {cards.length > 1 ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2" data-class-card-nav>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              aria-label="이전 수업 보기"
              disabled={!previous}
              onClick={() => select(previous)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> 이전
            </Button>
            <span
              className="secondary-text flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 tabular-nums text-[#8a7b77]"
              aria-live="polite"
            >
              <span>
                {index + 1} / {cards.length}
              </span>
              <span aria-hidden>·</span>
              <span>
                {viewed.startTime}~{viewed.endTime}
              </span>
              {/* 탐색 중 + 실제 진행 중인 수업이 있을 때만 — 작은 보조 action (큰 control 아님) */}
              {browsing && currentExists ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-[#5d4ba5]"
                  aria-label="현재 수업으로 돌아가기"
                  onClick={() => select(null)}
                >
                  <CirclePlay className="h-3.5 w-3.5" aria-hidden /> 현재 수업으로
                </Button>
              ) : null}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              aria-label="다음 수업 보기"
              disabled={!next}
              onClick={() => select(next)}
            >
              다음 <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </CardHeader>
      {/* 본문 교체는 subtle — 큰 flip/carousel 애니메이션 없음 (reduced-motion 영향 0) */}
      <CardContent>{mode === "briefing" ? viewed.briefing : viewed.wrapUp}</CardContent>
    </Card>
  );
}
