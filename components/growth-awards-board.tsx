"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState } from "react";

import { formatShortMonthDay } from "@/lib/dates";
import {
  formatPercent,
  formatPointDelta,
  type GrowthAwardEvidence,
  type GrowthAwardKey,
} from "@/lib/growth-awards";
import { cn } from "@/lib/utils";

// 성장노트 "이번 기간의 왕" 보드 — presentational + expand state만.
// winner/근거는 서버가 같은 normalized metric에서 만들어 props로 내려준다 (클릭 시 네트워크 0).
// 카드 하나 안에서는 한 학생만 펼치는 accordion (화면 길이 억제), 카드끼리는 독립.
export type AwardBoardWinner = { studentId: string; name: string; evidence: GrowthAwardEvidence };

export type AwardBoardCard = {
  key: GrowthAwardKey;
  emoji: string;
  label: string;
  description: string;
  minimumLabel: string;
  winners: AwardBoardWinner[];
  emptyText: string;
};

export type KingBoardCard = {
  winners: { studentId: string; name: string; titles: { key: string; emoji: string; label: string }[] }[];
};

const awardThemes: Record<GrowthAwardKey, { card: string; title: string; chip: string }> = {
  consistency: { card: "border-[#f0d9c4] bg-gradient-to-br from-[#fff8f2] to-[#fdeee2]", title: "text-[#a2643c]", chip: "bg-white/70" },
  homework: { card: "border-[#ded2f0] bg-gradient-to-br from-[#faf7ff] to-[#efe8fb]", title: "text-[#5c4a9c]", chip: "bg-white/70" },
  review: { card: "border-[#cfe3f0] bg-gradient-to-br from-[#f3f9fe] to-[#e6f1fa]", title: "text-[#3d6d99]", chip: "bg-white/70" },
  punctuality: { card: "border-[#d8e8c6] bg-gradient-to-br from-[#f7fbf0] to-[#eaf4dc]", title: "text-[#58762e]", chip: "bg-white/70" },
  homeworkStreak: { card: "border-[#ecdfc8] bg-gradient-to-br from-[#fdf9ef] to-[#f6ecd6]", title: "text-[#6f5a30]", chip: "bg-white/70" },
  improvement: { card: "border-[#cfe7e2] bg-gradient-to-br from-[#f2fafc] to-[#e2f2ee]", title: "text-[#2e7d72]", chip: "bg-white/70" },
};

function EvidenceRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-xl bg-white/70 px-3 py-1.5">
      <span className="text-sm text-[#655d5d]">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-[#2d2928]">
        {value}
        {note ? <span className="ml-1.5 text-xs font-normal text-[#a79996]">{note}</span> : null}
      </span>
    </div>
  );
}

function fraction(success: number, total: number, percent: number | null) {
  return `${success} / ${total} · ${formatPercent(percent)}`;
}

// 근거 rows — 강사가 바로 이해할 수 있는 숫자/문구만 (raw score/weight 노출 금지)
function EvidenceBody({ evidence }: { evidence: GrowthAwardEvidence }) {
  switch (evidence.kind) {
    case "homework":
      return (
        <>
          <EvidenceRow label="숙제 완료" value={`${evidence.completed} / ${evidence.applicable}`} />
          <EvidenceRow label="완료율" value={formatPercent(evidence.percent)} />
          <EvidenceRow label="미완료" value={`${evidence.incomplete}개`} />
        </>
      );
    case "review":
      return (
        <>
          <EvidenceRow label="온라인 복습 완료" value={`${evidence.completed} / ${evidence.evaluated}`} />
          <EvidenceRow label="완료율" value={formatPercent(evidence.percent)} />
          <EvidenceRow label="미완료" value={`${evidence.incomplete}회`} />
          <EvidenceRow label="미평가" value={`${evidence.unevaluated}회`} note="계산에 넣지 않았어요" />
        </>
      );
    case "punctuality":
      return (
        <>
          <EvidenceRow label="정시 출석" value={`${evidence.present} / ${evidence.evaluated}`} />
          <EvidenceRow label="지각" value={`${evidence.late}회`} />
          <EvidenceRow label="조퇴" value={`${evidence.earlyLeave}회`} />
          <EvidenceRow label="결석" value={`${evidence.absent}회`} />
          <EvidenceRow label="정시 출석률" value={formatPercent(evidence.percent)} />
        </>
      );
    case "consistency":
      return (
        <>
          {evidence.categories.map((category) => (
            <EvidenceRow
              key={category.key}
              label={category.label}
              value={
                category.counted
                  ? fraction(category.success, category.total, category.percent)
                  : `기록 부족 · ${category.total}건`
              }
              note={category.counted ? undefined : "계산 제외"}
            />
          ))}
          <EvidenceRow label="종합 꾸준함" value={formatPercent(evidence.percent)} note="계산된 항목의 평균" />
        </>
      );
    case "homeworkStreak":
      return (
        <>
          <EvidenceRow label="최장 연속 완료" value={`${evidence.longest}회`} />
          <EvidenceRow
            label="완료한 숙제일"
            value={
              evidence.streakStart && evidence.streakEnd
                ? evidence.streakStart === evidence.streakEnd
                  ? formatShortMonthDay(evidence.streakStart)
                  : `${formatShortMonthDay(evidence.streakStart)} → ${formatShortMonthDay(evidence.streakEnd)}`
                : "–"
            }
          />
          <EvidenceRow label="숙제 마감일" value={`${evidence.opportunityDates}일`} />
        </>
      );
    case "improvement":
      return (
        <>
          <EvidenceRow label="지난 기간" value={fraction(evidence.previous.success, evidence.previous.total, evidence.previous.percent)} />
          <EvidenceRow label="이번 기간" value={fraction(evidence.current.success, evidence.current.total, evidence.current.percent)} />
          <EvidenceRow label="향상" value={evidence.deltaPoints === null ? "–" : formatPointDelta(evidence.deltaPoints)} />
          <EvidenceRow label="이번 기간 숙제" value={`${evidence.currentHomework.completed} / ${evidence.currentHomework.applicable}`} />
          <EvidenceRow label="이번 기간 복습" value={`${evidence.currentReview.completed} / ${evidence.currentReview.evaluated}`} />
        </>
      );
  }
}

function WinnerRow({
  name,
  open,
  panelId,
  onToggle,
  children,
}: {
  name: string;
  open: boolean;
  panelId: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-2xl border border-white/80 bg-white/60">
      {/* 학생 row 전체가 button — Enter/Space로 펼침, 색이 아니라 👑·문구로 winner 표시 */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="tap-press-subtle flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left transition hover:bg-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b9a5e3]"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 break-words text-base font-bold text-[#3a2f2c]">{name}</span>
          <span aria-hidden className="shrink-0 text-base">
            👑
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[#8a7b77]">
          {open ? "근거 닫기" : "선정 근거"}
          {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={`${name} 선정 근거`}
          className="space-y-1.5 px-3 pb-3 motion-safe:animate-in motion-safe:fade-in"
        >
          {children}
        </div>
      ) : null}
    </li>
  );
}

function AwardCard({ card }: { card: AwardBoardCard }) {
  const baseId = useId();
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const theme = awardThemes[card.key];

  return (
    <section
      data-growth-award={card.key}
      data-winner-count={card.winners.length}
      className={cn("rounded-3xl border p-4 shadow-sm", theme.card)}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-2xl drop-shadow-sm">
          {card.emoji}
        </span>
        <span className={cn("card-title", theme.title)}>{card.label}</span>
      </div>
      <p className="mt-1 text-sm leading-5 text-[#8b7550]">{card.description}</p>

      {card.winners.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-white/60 px-3 py-2.5 text-sm text-[#8a7b77]" data-growth-award-empty>
          {card.emptyText}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {card.winners.map((winner) => {
            const panelId = `${baseId}-${winner.studentId}`;
            const open = openStudentId === winner.studentId;
            return (
              <WinnerRow
                key={winner.studentId}
                name={winner.name}
                open={open}
                panelId={panelId}
                onToggle={() => setOpenStudentId(open ? null : winner.studentId)}
              >
                <div className="caption-text pt-1 text-[#8a7b77]">선정 근거</div>
                <EvidenceBody evidence={winner.evidence} />
                <div className="caption-text pt-0.5 text-[#a79996]">선정 기준 · {card.minimumLabel}</div>
              </WinnerRow>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function KingCard({ king, periodUnit }: { king: KingBoardCard; periodUnit: string }) {
  const baseId = useId();
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);

  return (
    <section
      data-growth-award="kingOfKings"
      data-winner-count={king.winners.length}
      className="relative overflow-hidden rounded-3xl border border-[#e9d5a4] bg-gradient-to-br from-[#fffdf4] via-[#fdf6e2] to-[#fbf0d8] p-4 shadow-[0_4px_18px_rgba(203,169,92,0.18)]"
    >
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#f6e3ae]/60 blur-2xl" />
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-2xl drop-shadow-sm">
          👑
        </span>
        <span className="card-title text-[#8a6a25]">왕중왕</span>
      </div>
      <p className="mt-1 text-sm leading-5 text-[#99804f]">{periodUnit} 성장 배지와 왕을 가장 많이 받은 학생</p>
      <ul className="mt-3 space-y-2">
        {king.winners.map((winner) => {
          const panelId = `${baseId}-${winner.studentId}`;
          const open = openStudentId === winner.studentId;
          return (
            <WinnerRow
              key={winner.studentId}
              name={winner.name}
              open={open}
              panelId={panelId}
              onToggle={() => setOpenStudentId(open ? null : winner.studentId)}
            >
              <div className="caption-text pt-1 text-[#8a7b77]">{periodUnit} 받은 왕</div>
              <div className="flex flex-wrap gap-1.5">
                {winner.titles.map((title) => (
                  <span
                    key={title.key}
                    className="rounded-full bg-[#f0f7f2] px-2.5 py-1 text-xs font-semibold text-[#3d7f64]"
                  >
                    {title.emoji} {title.label}
                  </span>
                ))}
              </div>
              <EvidenceRow label="총" value={`${winner.titles.length}개`} />
            </WinnerRow>
          );
        })}
      </ul>
    </section>
  );
}

export function GrowthAwardsBoard({
  cards,
  king,
  periodUnit,
}: {
  cards: AwardBoardCard[];
  // 왕중왕이 없으면 null (전원 0개)
  king: KingBoardCard | null;
  periodUnit: string; // "이번 주" | "이번 달"
}) {
  return (
    <div className="space-y-3" data-growth-awards-board>
      {king ? <KingCard king={king} periodUnit={periodUnit} /> : null}
      {/* Desktop/iPad 2열, 모바일 1열 — 카드 안에서 wrap, 가로 overflow 없음 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <AwardCard key={card.key} card={card} />
        ))}
      </div>
    </div>
  );
}
