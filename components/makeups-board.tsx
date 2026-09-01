"use client";

import Link from "next/link";
import { CalendarCheck, CheckCheck, CircleX, Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { cancelMakeupAction, completeMakeupAction, scheduleMakeupAction } from "@/app/makeups/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatKoreanDate } from "@/lib/dates";
import { DAY_LABELS, formatTimeHM } from "@/lib/schedule";

export type MakeupRow = {
  id: string;
  status: "required" | "scheduled" | "completed" | "cancelled";
  studentId: string | null;
  studentName: string;
  gradeLabel: string;
  groupId: string | null;
  groupName: string | null;
  dailyLogId: string | null;
  absenceDate: string;
  missedProgress: string | null;
  scheduledDate: string | null;
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  completedDate: string | null;
  completedProgress: string | null;
  comment: string | null;
};

export type TeacherSlot = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  groupName: string;
};

type FilterKey = "all" | "required" | "scheduled" | "done";

function daysBetween(fromYmd: string, toYmd: string) {
  return Math.round(
    (Date.parse(`${toYmd}T12:00:00Z`) - Date.parse(`${fromYmd}T12:00:00Z`)) / 86_400_000,
  );
}

function dateHeading(date: string, today: string) {
  const diff = daysBetween(today, date);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  return `${formatKoreanDate(date)} (${DAY_LABELS[new Date(`${date}T12:00:00Z`).getUTCDay()]})`;
}

function timeRangeLabel(row: Pick<MakeupRow, "startTime" | "endTime">) {
  if (!row.startTime) return null;
  return row.endTime ? `${row.startTime} ~ ${row.endTime}` : row.startTime;
}

// ---------- 공용 다이얼로그 shell (dirty면 바깥 클릭/ESC에서 확인) ----------

function DialogShell({
  title,
  dirty,
  onClose,
  children,
}: {
  title: string;
  dirty: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const requestClose = () => {
    if (!dirty || window.confirm("작성 중인 내용이 있어요. 저장하지 않고 닫을까요?")) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#26262b]/35 px-4"
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#e6e6ea] bg-white p-5 shadow-xl">
        <div className="text-base font-bold text-[#232327]">{title}</div>
        {children}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-[#dcdce2] bg-white px-3 py-2 text-sm text-[#33333b] outline-none focus:border-[#b9b9c6]";
const labelClass = "mb-1 block text-xs font-semibold text-[#6b6b74]";

// ---------- 일정 잡기 / 변경 ----------

function ScheduleDialog({
  row,
  slots,
  onClose,
}: {
  row: MakeupRow;
  slots: TeacherSlot[];
  onClose: () => void;
}) {
  const [date, setDate] = useState(row.scheduledDate ?? "");
  const [startTime, setStartTime] = useState(row.startTime ?? "");
  const [endTime, setEndTime] = useState(row.endTime ?? "");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const dirty =
    date !== (row.scheduledDate ?? "") ||
    startTime !== (row.startTime ?? "") ||
    endTime !== (row.endTime ?? "") ||
    memo !== "";

  // 정규 수업과 겹치면 경고만 (막지는 않음 — 의도적으로 이어서 잡을 수도 있으니)
  const conflicts = useMemo(() => {
    if (!date || !startTime || !endTime) return [] as string[];
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    return [
      ...new Set(
        slots
          .filter(
            (slot) =>
              slot.day_of_week === dow &&
              formatTimeHM(slot.start_time) < endTime &&
              startTime < formatTimeHM(slot.end_time),
          )
          .map((slot) => slot.groupName),
      ),
    ];
  }, [date, startTime, endTime, slots]);

  const submit = () => {
    setError("");
    startTransition(async () => {
      const result = await scheduleMakeupAction(row.id, {
        scheduledDate: date,
        startTime,
        endTime,
        memo,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      onClose();
    });
  };

  return (
    <DialogShell title={`${row.studentName} 보충수업`} dirty={dirty} onClose={onClose}>
      <div className="mt-1 text-xs text-[#6b6b74]">
        놓친 수업 {formatKoreanDate(row.absenceDate)}
        {row.groupName ? ` · ${row.groupName}` : ""}
      </div>
      {row.missedProgress ? (
        <div className="mt-2 rounded-xl bg-[#f4f4f6] px-3 py-2 text-xs text-[#4c4c55]">
          놓친 진도 · {row.missedProgress}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className={labelClass}>보충 날짜</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelClass}>시작</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>종료</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
          </label>
        </div>
        <label className="block">
          <span className={labelClass}>메모 (선택)</span>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className={inputClass}
            placeholder="관계대명사 복습 중심"
          />
        </label>

        {conflicts.length > 0 ? (
          <p className="rounded-xl bg-[#fdeee3] px-3 py-2 text-xs text-[#a2643c]">
            이 시간에는 {conflicts.join(", ")} 정규 수업이 있어요.
          </p>
        ) : null}
        {error ? <p className="text-xs text-[#a2665f]">{error}</p> : null}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          취소
        </Button>
        <Button type="button" size="sm" disabled={isPending || !date} onClick={submit}>
          {isPending ? "저장 중..." : "일정 확정"}
        </Button>
      </div>
    </DialogShell>
  );
}

// ---------- 보충 완료 ----------

function CompleteDialog({
  row,
  today,
  onClose,
}: {
  row: MakeupRow;
  today: string;
  onClose: () => void;
}) {
  const [completedDate, setCompletedDate] = useState(row.scheduledDate ?? today);
  const [content, setContent] = useState(row.missedProgress ?? "");
  const [comment, setComment] = useState(row.comment ?? "");
  const [followUp, setFollowUp] = useState<"none" | "needed">("none");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const dirty =
    content !== (row.missedProgress ?? "") || comment !== (row.comment ?? "") || followUp !== "none";

  const submit = () => {
    setError("");
    startTransition(async () => {
      const result = await completeMakeupAction(row.id, {
        completedDate,
        completedProgress: content,
        comment: followUp === "needed" ? `${comment ? `${comment}\n` : ""}[추가 보충 필요]` : comment,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      onClose();
    });
  };

  return (
    <DialogShell title="보충 완료" dirty={dirty} onClose={onClose}>
      <div className="mt-1 text-xs text-[#6b6b74]">
        {row.studentName}
        {row.groupName ? ` · ${row.groupName}` : ""}
        {row.missedProgress ? ` · 놓친 진도 ${row.missedProgress}` : ""}
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className={labelClass}>실제 보충일</span>
          <input
            type="date"
            value={completedDate}
            onChange={(e) => setCompletedDate(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>실제 보충 내용</span>
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={inputClass}
            placeholder="관계대명사 목적격 설명 및 문제풀이"
          />
        </label>
        <label className="block">
          <span className={labelClass}>학생 상태 / 메모</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className={inputClass}
            placeholder="이해 잘함"
          />
        </label>
        <fieldset>
          <legend className={labelClass}>추가 보충</legend>
          <div className="flex gap-2">
            {(
              [
                ["none", "필요 없음"],
                ["needed", "추가 보충 필요"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={followUp === value}
                onClick={() => setFollowUp(value)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                  followUp === value
                    ? "border-[#cfc4f0] bg-[#efe8fb] text-[#4a3c8f]"
                    : "border-[#e2e2e8] bg-white text-[#4c4c55]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        {error ? <p className="text-xs text-[#a2665f]">{error}</p> : null}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          취소
        </Button>
        <Button type="button" size="sm" disabled={isPending || !completedDate} onClick={submit}>
          {isPending ? "저장 중..." : "완료 저장"}
        </Button>
      </div>
    </DialogShell>
  );
}

// ---------- 카드 ----------

function statusChip(text: string, tone: "peach" | "lavender" | "mint" | "rose" | "gray") {
  const tones = {
    peach: "bg-[#fdeee3] text-[#a2643c]",
    lavender: "bg-[#efe8fb] text-[#5d4ba5]",
    mint: "bg-[#e4f4ec] text-[#3d7f64]",
    rose: "bg-[#f9e4e6] text-[#a05560]",
    gray: "bg-[#f0f0f3] text-[#6b6b74]",
  } as const;

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{text}</span>
  );
}

function MakeupCard({
  row,
  today,
  onSchedule,
  onComplete,
  onCancel,
}: {
  row: MakeupRow;
  today: string;
  onSchedule: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const isOpen = row.status === "required" || row.status === "scheduled";
  const sinceAbsence = daysBetween(row.absenceDate, today);
  const overdue = row.status === "scheduled" && !!row.scheduledDate && row.scheduledDate < today;
  const time = timeRangeLabel(row);

  return (
    <Card className="p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {row.studentId ? (
          <Link
            href={`/students/${row.studentId}`}
            className="text-sm font-bold text-[#232327] hover:underline"
          >
            {row.studentName}
          </Link>
        ) : (
          <span className="text-sm font-bold text-[#232327]">{row.studentName}</span>
        )}
        {row.gradeLabel ? statusChip(row.gradeLabel, "gray") : null}
        {row.groupId && row.groupName ? (
          <Link
            href={`/groups/${row.groupId}`}
            className="rounded-full bg-[#f0f0f3] px-2 py-0.5 text-[11px] font-medium text-[#4c4c55] hover:bg-[#e6e6ea]"
          >
            {row.groupName}
          </Link>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5">
          {row.status === "required" ? statusChip("대기", "peach") : null}
          {row.status === "scheduled" ? statusChip("예정", "lavender") : null}
          {row.status === "completed" ? statusChip("완료", "mint") : null}
          {row.status === "cancelled" ? statusChip("취소", "gray") : null}
          {overdue ? statusChip("일정 지남", "rose") : null}
          {row.status === "required" && sinceAbsence >= 7 ? statusChip("오래된 보충", "rose") : null}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6b6b74]">
        {row.dailyLogId ? (
          <Link href={`/daily-logs/${row.dailyLogId}`} className="hover:underline">
            {formatKoreanDate(row.absenceDate)} 결석
          </Link>
        ) : (
          <span>{formatKoreanDate(row.absenceDate)} 결석</span>
        )}
        {row.status === "required" ? (
          <span className="tabular-nums">
            · {sinceAbsence === 0 ? "오늘 결석" : `결석 후 ${sinceAbsence}일째`}
          </span>
        ) : null}
        {row.status === "scheduled" && row.scheduledDate ? (
          <span className="tabular-nums">
            · 보충 {dateHeading(row.scheduledDate, today)}
            {time ? ` ${time}` : ""}
          </span>
        ) : null}
        {row.status === "completed" && row.completedDate ? (
          <span>· {formatKoreanDate(row.completedDate)} 보충 완료</span>
        ) : null}
      </div>

      {row.missedProgress ? (
        <div className="mt-1.5 text-sm text-[#33333b]">놓친 진도 · {row.missedProgress}</div>
      ) : null}
      {row.status === "completed" && row.completedProgress ? (
        <div className="mt-1 text-sm text-[#3d7f64]">보충한 내용 · {row.completedProgress}</div>
      ) : null}
      {row.status === "completed" && row.comment ? (
        <div className="mt-1 whitespace-pre-line text-xs text-[#6b6b74]">{row.comment}</div>
      ) : null}

      {isOpen ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={onSchedule}>
            <CalendarCheck className="h-3.5 w-3.5" />
            {row.status === "required" ? "일정 잡기" : "일정 변경"}
          </Button>
          {row.status === "scheduled" ? (
            <Button type="button" size="sm" className="gap-1.5" onClick={onComplete}>
              <CheckCheck className="h-3.5 w-3.5" /> 보충 완료
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5 text-[#8f625f]"
            onClick={onCancel}
          >
            <CircleX className="h-3.5 w-3.5" /> 취소
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- 보드 ----------

export function MakeupsBoard({
  makeups,
  today,
  slots,
}: {
  makeups: MakeupRow[];
  today: string;
  slots: TeacherSlot[];
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<{ kind: "schedule" | "complete"; id: string } | null>(null);
  const [, startTransition] = useTransition();

  const query = q.trim().toLowerCase();
  const bySearch = makeups.filter((row) => !query || row.studentName.toLowerCase().includes(query));

  const required = bySearch
    .filter((row) => row.status === "required")
    .sort((a, b) => a.absenceDate.localeCompare(b.absenceDate));
  const scheduled = bySearch
    .filter((row) => row.status === "scheduled")
    .sort(
      (a, b) =>
        (a.scheduledDate ?? "9999").localeCompare(b.scheduledDate ?? "9999") ||
        (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"),
    );
  const overdueScheduled = scheduled.filter((row) => (row.scheduledDate ?? "") < today);
  const upcomingScheduled = scheduled.filter((row) => (row.scheduledDate ?? "") >= today);
  const completed = bySearch
    .filter((row) => row.status === "completed")
    .sort((a, b) => (b.completedDate ?? "").localeCompare(a.completedDate ?? ""));
  const cancelled = bySearch.filter((row) => row.status === "cancelled");

  const counts = {
    required: makeups.filter((row) => row.status === "required").length,
    scheduled: makeups.filter((row) => row.status === "scheduled").length,
    done: makeups.filter((row) => row.status === "completed").length,
  };

  const dialogRow = dialog ? (makeups.find((row) => row.id === dialog.id) ?? null) : null;

  const cancel = (row: MakeupRow) => {
    if (!window.confirm(`${row.studentName} 학생의 보충을 취소할까요?\n취소 기록은 남아있어요.`)) {
      return;
    }

    startTransition(async () => {
      const result = await cancelMakeupAction(row.id);
      if ("error" in result) {
        window.alert(result.error);
      }
    });
  };

  const cardOf = (row: MakeupRow) => (
    <MakeupCard
      key={row.id}
      row={row}
      today={today}
      onSchedule={() => setDialog({ kind: "schedule", id: row.id })}
      onComplete={() => setDialog({ kind: "complete", id: row.id })}
      onCancel={() => cancel(row)}
    />
  );

  // 다가오는 보충: 날짜별 헤더로 묶기
  const upcomingByDate: [string, MakeupRow[]][] = [];
  for (const row of upcomingScheduled) {
    const key = row.scheduledDate ?? "";
    const last = upcomingByDate[upcomingByDate.length - 1];
    if (last && last[0] === key) last[1].push(row);
    else upcomingByDate.push([key, [row]]);
  }

  const filters: [FilterKey, string, number | null][] = [
    ["all", "전체", null],
    ["required", "대기", counts.required],
    ["scheduled", "예정", counts.scheduled],
    ["done", "완료", counts.done],
  ];

  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-2xl border border-[#e6e6ea] bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <Search className="h-4 w-4 shrink-0 text-[#8a8a93]" aria-hidden />
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="w-full border-none bg-transparent text-sm text-[#33333b] outline-none placeholder:text-[#9a9aa3]"
          placeholder="학생 이름 검색"
          aria-label="학생 이름 검색"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {filters.map(([key, label, count]) => {
          const active = filter === key;

          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-[#cfc4f0] bg-[#efe8fb] text-[#4a3c8f]"
                  : "border-[#e2e2e8] bg-white text-[#4c4c55] hover:bg-[#f4f4f6]"
              }`}
            >
              {label}
              {count !== null ? (
                <span className={`ml-1 tabular-nums ${active ? "text-[#7565d4]" : "text-[#9a9aa3]"}`}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* 일정이 필요한 보충 */}
      {filter === "all" || filter === "required" ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between border-b border-[#ececf0] pb-2">
            <h2 className="text-sm font-bold text-[#232327]">일정이 필요한 보충</h2>
            {required.length > 0 ? (
              <span className="text-xs tabular-nums text-[#8a8a93]">{required.length}건</span>
            ) : null}
          </div>
          {required.length === 0 ? (
            <p className="text-sm text-[#8a8a93]">일정을 잡아야 할 보충이 없어요.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">{required.map(cardOf)}</div>
          )}
        </section>
      ) : null}

      {/* 다가오는 보충 */}
      {filter === "all" || filter === "scheduled" ? (
        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between border-b border-[#ececf0] pb-2">
            <h2 className="text-sm font-bold text-[#232327]">다가오는 보충</h2>
            {scheduled.length > 0 ? (
              <span className="text-xs tabular-nums text-[#8a8a93]">{scheduled.length}건</span>
            ) : null}
          </div>

          {scheduled.length === 0 ? (
            <p className="text-sm text-[#8a8a93]">예정된 보충수업이 없어요.</p>
          ) : (
            <div className="space-y-4">
              {overdueScheduled.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-[#a05560]">일정이 지난 보충</h3>
                  <div className="grid gap-3 lg:grid-cols-2">{overdueScheduled.map(cardOf)}</div>
                </div>
              ) : null}
              {upcomingByDate.map(([date, rows]) => (
                <div key={date}>
                  <h3 className="mb-2 text-xs font-semibold text-[#6b6b74]">
                    {dateHeading(date, today)}
                    {date === today ? (
                      <span className="ml-1.5 rounded-full bg-[#efe8fb] px-2 py-0.5 text-[10px] font-medium text-[#5d4ba5]">
                        오늘 보충 {rows.length}건
                      </span>
                    ) : null}
                  </h3>
                  <div className="grid gap-3 lg:grid-cols-2">{rows.map(cardOf)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* 완료 기록 */}
      {filter === "done" ? (
        <section className="mt-6">
          <div className="mb-3 border-b border-[#ececf0] pb-2">
            <h2 className="text-sm font-bold text-[#232327]">완료된 보충</h2>
          </div>
          {completed.length === 0 ? (
            <p className="text-sm text-[#8a8a93]">완료된 보충수업이 아직 없어요.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">{completed.map(cardOf)}</div>
          )}
        </section>
      ) : null}

      {filter === "all" && completed.length > 0 ? (
        <details className="mt-7">
          <summary className="cursor-pointer text-sm font-medium text-[#6b6b74]">
            완료된 보충 {completed.length}건 보기
          </summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">{completed.map(cardOf)}</div>
        </details>
      ) : null}

      {cancelled.length > 0 && (filter === "all" || filter === "done") ? (
        <details className="mt-4 pb-6">
          <summary className="cursor-pointer text-xs text-[#8a8a93]">
            취소된 기록 {cancelled.length}건 보기
          </summary>
          <div className="mt-3 grid gap-3 opacity-80 lg:grid-cols-2">{cancelled.map(cardOf)}</div>
        </details>
      ) : null}

      {dialogRow && dialog?.kind === "schedule" ? (
        <ScheduleDialog
          key={`schedule-${dialogRow.id}`}
          row={dialogRow}
          slots={slots}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialogRow && dialog?.kind === "complete" ? (
        <CompleteDialog
          key={`complete-${dialogRow.id}`}
          row={dialogRow}
          today={today}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
