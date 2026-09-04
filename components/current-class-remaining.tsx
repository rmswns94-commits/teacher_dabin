"use client";

import { useEffect, useState } from "react";
import { Coffee, Hourglass, Sparkles } from "lucide-react";

// 수업 시작 시각 기준 10분 구간마다 하나씩 — 랜덤 없이 구간 index로 안정적으로 선택된다.
// (같은 10분 안에서는 rerender가 나도 문구가 바뀌지 않는다. 배열을 넘어가면 마지막 문구 유지)
const CLASS_ENCOURAGEMENT_MESSAGES: { title: string; sub: string }[] = [
  { title: "좋은 시작이에요 ✨", sub: "천천히 수업의 흐름을 만들어가요." },
  { title: "오늘도 잘하고 있어요 🌿", sub: "학생들과 보내는 시간이 차곡차곡 쌓이고 있어요." },
  { title: "수업에 푹 빠졌어요", sub: "지금처럼 편안하게 이어가면 돼요." },
  { title: "반쯤 왔어요 ✨", sub: "오늘도 충분히 잘하고 있어요." },
  { title: "마무리까지 차근차근", sub: "좋은 수업은 작은 순간들이 모여 만들어져요." },
  { title: "거의 다 왔어요 🌷", sub: "선생님의 한마디가 학생에게 오래 남을 거예요." },
  { title: "끝까지 편안하게", sub: "학생들과 호흡이 잘 맞아가고 있어요." },
  { title: "오늘 수업도 잘 쌓이고 있어요", sub: "조금만 더, 지금 페이스 그대로요." },
  { title: "한 걸음씩이면 충분해요", sub: "서두르지 않아도 잘 흘러가고 있어요." },
  { title: "마지막까지 함께해요 ✨", sub: "오늘의 마무리도 분명 따뜻할 거예요." },
];

const BREAK_MESSAGE = { title: "잠깐 쉬어가요 ☕", sub: "물 한 모금 마시고 천천히 준비해요." };
const BREAK_SOON_MESSAGE = {
  title: "다음 수업이 곧 시작돼요",
  sub: "숨 한번 돌리고 가볍게 준비해요.",
};
const DAY_DONE_MESSAGE = {
  title: "오늘도 수고했어요 ✨",
  sub: "학생들과의 하루가 차곡차곡 잘 쌓였어요. 편안한 저녁 보내세요.",
};

function kstTimeOf(epoch: number) {
  const kst = new Date(epoch + 9 * 3_600_000);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes}분`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function TimeZone({
  label,
  icon,
  big,
  sub,
  badge,
  progress,
  progressLabel,
}: {
  label: string;
  icon: React.ReactNode;
  big: string;
  sub: string;
  badge?: string;
  progress?: number;
  progressLabel?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7fb8]">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums tracking-[-0.02em] text-[#3d3450]">
          {big}
        </span>
        {badge ? (
          <span className="rounded-full bg-[#fdf3e4] px-2 py-0.5 text-[11px] font-medium text-[#94702f]">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs tabular-nums text-[#8a7b77]">{sub}</div>
      {progress !== undefined ? (
        <>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#efe9f9]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#b3a5ec] to-[#9dd4bd] transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          {progressLabel ? (
            <div className="mt-1 text-[10px] tabular-nums text-[#a79bc4]">{progressLabel}</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function MessageZone({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="relative min-w-0 sm:border-l sm:border-[#eee7f7] sm:pl-5">
      <Sparkles aria-hidden className="pointer-events-none absolute right-0 top-0 h-4 w-4 text-[#d3c4ef]" />
      <div className="text-[15px] font-semibold leading-6 text-[#4a3f66]">{title}</div>
      <p className="mt-1 text-xs leading-5 text-[#8a7fa8]">{sub}</p>
    </div>
  );
}

// CURRENT CLASS 카드 우측의 넓은 수업 상태 패널.
// 수업 중: [남은 시간·진행률] | [수업 시작 기준 10분마다 바뀌는 응원 한마디]
// 수업 종료~다음 수업: [다음 수업까지 남은 시간] | [쉬어가기 메시지]
// 오늘 마지막 수업 이후: [오늘 수업 끝] | [수고 메시지]
// 30초 간격으로 현재 시각 state만 갱신 — router.refresh/DB 조회 없음.
export function ClassStatusPanel({
  startEpoch,
  endEpoch,
  next,
  allDone,
}: {
  startEpoch: number;
  endEpoch: number;
  // hero 수업 "다음"의 실제 수업 (Teacher 기준 — Dashboard의 followUp 재사용)
  next: { startEpoch: number; startLabel: string; daysFromNow: number } | null;
  allDone: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const panelClass =
    "w-full min-w-0 flex-1 basis-[320px] rounded-2xl border border-[#e2d8f3] bg-white/70 px-5 py-4 shadow-sm backdrop-blur-sm";
  const gridClass = "grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] sm:gap-5";

  // ── 수업 진행 중 [start, end) ──
  if (now >= startEpoch && now < endEpoch) {
    const remaining = Math.max(1, Math.ceil((endEpoch - now) / 60_000));
    const total = Math.max(1, Math.round((endEpoch - startEpoch) / 60_000));
    const progress = Math.min(100, Math.max(0, ((now - startEpoch) / (endEpoch - startEpoch)) * 100));
    // 수업 "시작 시각" 기준 10분 구간 index — 시계의 정각(00/10/20…)이 아니다
    const messageIndex = Math.min(
      CLASS_ENCOURAGEMENT_MESSAGES.length - 1,
      Math.floor((now - startEpoch) / (10 * 60_000)),
    );
    const message = CLASS_ENCOURAGEMENT_MESSAGES[messageIndex];

    return (
      <div className={panelClass}>
        <div className={gridClass}>
          <TimeZone
            label="남은 수업 시간"
            icon={<Hourglass className="h-3.5 w-3.5" aria-hidden />}
            big={`${remaining}분`}
            badge={remaining <= 10 ? "곧 끝나요" : undefined}
            sub={`${kstTimeOf(endEpoch)} 종료 예정`}
            progress={progress}
            progressLabel={`${total - remaining} / ${total}분 진행`}
          />
          <MessageZone title={message.title} sub={message.sub} />
        </div>
      </div>
    );
  }

  // ── 수업 시작 전 / 종료 후: 다음 실제 수업 기준 ──
  // hero가 아직 시작 전이면 hero 자신이, 종료 후면 next가 "다음 수업"이다.
  const upcoming =
    now < startEpoch
      ? { startEpoch, startLabel: kstTimeOf(startEpoch), daysFromNow: 0 }
      : next;

  const sameDayUpcoming =
    upcoming && upcoming.daysFromNow === 0 && upcoming.startEpoch > now && !allDone;

  if (sameDayUpcoming) {
    const untilMinutes = Math.max(1, Math.ceil((upcoming.startEpoch - now) / 60_000));
    const soon = untilMinutes <= 10;

    return (
      <div className={panelClass}>
        <div className={gridClass}>
          <TimeZone
            label="다음 수업까지"
            icon={<Coffee className="h-3.5 w-3.5" aria-hidden />}
            big={formatMinutes(untilMinutes)}
            sub={`${upcoming.startLabel} 시작 예정`}
          />
          <MessageZone
            title={soon ? BREAK_SOON_MESSAGE.title : BREAK_MESSAGE.title}
            sub={soon ? BREAK_SOON_MESSAGE.sub : BREAK_MESSAGE.sub}
          />
        </div>
      </div>
    );
  }

  // 오늘 더 이상 수업 없음 (다음 수업이 내일 이후거나 없음)
  const nextLabel = upcoming
    ? `다음 수업 ${upcoming.daysFromNow === 1 ? "내일" : `${upcoming.daysFromNow}일 뒤`} ${upcoming.startLabel}`
    : "예정된 다음 수업이 없어요";

  return (
    <div className={panelClass}>
      <div className={gridClass}>
        <TimeZone
          label="오늘 수업 끝"
          icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
          big="완료 ✓"
          sub={nextLabel}
        />
        <MessageZone title={DAY_DONE_MESSAGE.title} sub={DAY_DONE_MESSAGE.sub} />
      </div>
    </div>
  );
}
