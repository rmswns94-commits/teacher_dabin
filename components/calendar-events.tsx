"use client";

import { CalendarPlus, Check, Pencil, School, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import {
  removeAcademyClosureAction,
  setAcademyClosureAction,
} from "@/app/daily-logs/closure-actions";
import {
  createCalendarEventAction,
  deleteCalendarEventAction,
  updateCalendarEventAction,
} from "@/app/daily-logs/event-actions";
import { TimeSelect } from "@/components/time-select";
import { Button } from "@/components/ui/button";
import { formatKoreanDate } from "@/lib/dates";
import { groupIconOf } from "@/lib/group-icons";
import type { CalendarEventWithGroup } from "@/lib/supabase/queries/calendar-events";
import { calendarEventTypes, calendarEventMeta, eventMetaOf } from "@/lib/validation/calendar-event";
import { cn } from "@/lib/utils";

type GroupOption = { id: string; name: string; icon?: string | null };

type FormValues = {
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  groupId: string;
  memo: string;
  // 보강(반을 지정한 1회성 수업)일 때만 쓴다
  startTime: string;
  endTime: string;
};

// 학원 전체 휴강 상태를 화면이 어떻게 아는가: 달력이 이미 가져온 그 달의 휴강일 목록을
// 그대로 내려받아 쓴다 (날짜를 바꿀 때마다 조회하지 않으므로 stale 응답 문제도 없다).
// 그 달 범위 밖 날짜는 상태를 알 수 없어 toggle을 잠그고 안내한다.
type ClosureContext = {
  closedDates: string[];
  rangeStart: string;
  rangeEnd: string;
  // 그 날짜에 예약된 보충수업 수 (저장 전 경고용) — 달력이 이미 가진 데이터
  makeupCountByDate: Record<string, number>;
};

function EventFormDialog({
  title,
  initial,
  groups,
  isPending,
  error,
  closure,
  onCancel,
  onSubmit,
  onClosureChange,
}: {
  title: string;
  initial: FormValues;
  groups: GroupOption[];
  isPending: boolean;
  error: string;
  // 일정 "등록" 다이얼로그에만 준다 (수정 다이얼로그에는 휴강 toggle이 없다)
  closure?: ClosureContext;
  onCancel: () => void;
  onSubmit: (values: FormValues) => void;
  onClosureChange?: (date: string, next: boolean) => void;
}) {
  const [values, setValues] = useState(initial);
  const update = (patch: Partial<FormValues>) => setValues((prev) => ({ ...prev, ...patch }));

  const savedClosed = Boolean(closure?.closedDates.includes(values.startDate));
  const [closureOn, setClosureOn] = useState(savedClosed);
  // 날짜를 바꾸면 그 날짜의 저장 상태를 따라간다 (form 전체를 remount하지 않는다)
  const [closureDate, setClosureDate] = useState(values.startDate);
  if (closure && closureDate !== values.startDate) {
    setClosureDate(values.startDate);
    setClosureOn(savedClosed);
  }

  const dateKnown =
    Boolean(closure) &&
    Boolean(values.startDate) &&
    values.startDate >= closure!.rangeStart &&
    values.startDate <= closure!.rangeEnd;
  const closureDirty = Boolean(closure) && dateKnown && closureOn !== savedClosed;
  const makeupCount = closure?.makeupCountByDate[values.startDate] ?? 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="card-title text-[#2a2323]">{title}</div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">일정 이름</span>
          <input
            value={values.title}
            onChange={(event) => update({ title: event.target.value })}
            maxLength={100}
            autoFocus
            placeholder="중2 기말고사"
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none focus:border-[#e3b9c9] placeholder:text-[#a79996]"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">종류</span>
          <select
            value={values.eventType}
            onChange={(event) => update({ eventType: event.target.value })}
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none"
          >
            {calendarEventTypes.map((type) => (
              <option key={type} value={type}>{calendarEventMeta[type].label}</option>
            ))}
          </select>
        </label>

        <div className="mt-3">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">기간</span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={values.startDate}
              onChange={(event) => update({ startDate: event.target.value })}
              className="rounded-2xl border border-[#ece0db] bg-white px-3 py-2 text-base outline-none"
              aria-label="시작일"
            />
            <span className="text-sm text-[#8a7b77]">~</span>
            <input
              type="date"
              value={values.endDate}
              onChange={(event) => update({ endDate: event.target.value })}
              className="rounded-2xl border border-[#ece0db] bg-white px-3 py-2 text-base outline-none"
              aria-label="종료일 (하루짜리면 비워두세요)"
            />
          </div>
          <p className="mt-1 text-sm text-[#a79996]">하루짜리 일정이면 종료일은 비워두세요.</p>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">적용 대상</span>
          <select
            value={values.groupId}
            onChange={(event) => update({ groupId: event.target.value })}
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none"
          >
            <option value="">전체 일정</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {`${groupIconOf(group.icon)} ${group.name}`}
              </option>
            ))}
          </select>
        </label>

        {/* 보강 수업 — 반을 정하고 시간을 넣으면 그날 1회 진행하는 실제 수업이 된다.
            (반이나 시간을 비워두면 예전처럼 달력 일정으로만 남는다) */}
        {values.eventType === "makeup" ? (
          <div className="mt-3 rounded-2xl border border-[#d8ebe0] bg-[#f4f9f6] p-3">
            <div className="text-sm font-medium text-[#2f6d54]">보강 수업 시간</div>
            {values.groupId ? (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TimeSelect
                    value={values.startTime}
                    onChange={(next) => update({ startTime: next })}
                    ariaLabel="보강 시작 시간"
                    allowEmpty
                    emptyLabel="시간 없음"
                    bound="start"
                    className="rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-base outline-none"
                  />
                  <span className="text-sm text-[#8a7b77]">~</span>
                  <TimeSelect
                    value={values.endTime}
                    onChange={(next) => update({ endTime: next })}
                    ariaLabel="보강 종료 시간"
                    allowEmpty
                    emptyLabel="시간 없음"
                    bound="end"
                    minTime={values.startTime}
                    className="rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-base outline-none"
                  />
                </div>
                <p className="mt-2 text-sm leading-5 text-[#3d7f64]">
                  시간을 넣으면 그날 하루만 이 반의 수업으로 잡혀요. 대시보드와 수업일지에서
                  정규수업처럼 쓸 수 있고, 반복 시간표는 바뀌지 않아요.
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-sm leading-5 text-[#8a7b77]">
                위에서 수업 반을 먼저 선택하면 보강 시간을 정할 수 있어요.
              </p>
            )}
          </div>
        ) : null}

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">메모 (선택)</span>
          <textarea
            value={values.memo}
            onChange={(event) => update({ memo: event.target.value })}
            rows={2}
            maxLength={500}
            placeholder="시험기간에는 숙제량 조절"
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base leading-6 outline-none focus:border-[#e3b9c9] placeholder:text-[#a79996]"
          />
        </label>

        {/* 학원 전체 휴강 — 일정 하나가 아니라 그 날짜 전체를 쉬는 날로 등록한다 */}
        {closure ? (
          <div className="mt-4 rounded-2xl border border-[#efe4dc] bg-[#fffaf6] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span id="academy-closure-label" className="flex items-center gap-1.5 text-sm font-medium text-[#4d3a3a]">
                <School className="h-4 w-4 text-[#c08a5e]" aria-hidden /> 학원 휴강
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={closureOn}
                aria-labelledby="academy-closure-label"
                disabled={isPending || !dateKnown}
                onClick={() => setClosureOn((prev) => !prev)}
                className={cn(
                  "flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition disabled:opacity-50",
                  closureOn
                    ? "border-[#e0b894] bg-[#fdf1e4] text-[#9a6234]"
                    : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                )}
              >
                {closureOn ? <Check className="h-4 w-4" aria-hidden /> : null}
                {closureOn ? "휴강 ON" : "휴강 OFF"}
              </button>
            </div>

            {!dateKnown ? (
              <p className="mt-2 text-sm leading-5 text-[#a79996]">
                이 달 달력에 있는 날짜만 휴강으로 등록할 수 있어요. 해당 날짜가 있는 달을 열어주세요.
              </p>
            ) : closureOn ? (
              <p className="mt-2 text-sm leading-5 text-[#7f5d57]">
                이 날짜에 예정된 모든 정규수업이 휴강 처리됩니다. 반복 시간표는 변경되지 않습니다.
              </p>
            ) : savedClosed ? (
              <p className="mt-2 text-sm leading-5 text-[#7f5d57]">
                끄고 저장하면 이 날짜의 정규수업이 기존 시간표대로 다시 적용됩니다.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-5 text-[#a79996]">
                켜면 이 날짜의 정규수업 전체가 휴강 처리돼요.
              </p>
            )}

            {closureOn && dateKnown && makeupCount > 0 ? (
              <p className="mt-2 rounded-xl bg-[#f4f9f6] px-3 py-2 text-sm leading-5 text-[#3d7f64]">
                이 날짜에 예약된 보충수업 {makeupCount}건이 있어요. 학원 휴강으로 등록해도 보충수업
                일정은 자동으로 삭제되지 않아요.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onCancel}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              isPending || (closureDirty ? false : !values.title.trim() || !values.startDate)
            }
            onClick={() =>
              closureDirty
                ? onClosureChange?.(values.startDate, closureOn)
                : onSubmit(values)
            }
          >
            {isPending ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EventCreateButton({
  groups,
  defaultDate,
  label = "일정 등록",
  variant = "secondary",
  size = "sm",
  closure,
}: {
  groups: GroupOption[];
  defaultDate?: string;
  label?: string;
  variant?: "secondary" | "outline" | "ghost";
  size?: "sm" | "default";
  closure?: ClosureContext;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  // toggle을 켠 것만으로는 저장하지 않는다 — [저장] → 이 확인 단계 → 그때만 mutation.
  const [confirmClosure, setConfirmClosure] = useState<{ date: string; next: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (values: FormValues) => {
    setError("");
    startTransition(async () => {
      const result = await createCalendarEventAction(values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setOpen(false);
    });
  };

  const applyClosure = () => {
    if (!confirmClosure || isPending) {
      return;
    }
    const { date, next } = confirmClosure;
    setError("");
    startTransition(async () => {
      const result = next
        ? await setAcademyClosureAction({ date })
        : await removeAcademyClosureAction({ date });

      if ("error" in result) {
        // 실패하면 다이얼로그를 그대로 두고 이유만 보여준다 (성공한 척 닫지 않는다)
        setError(result.error);
        setConfirmClosure(null);
        return;
      }

      setConfirmClosure(null);
      setOpen(false);
    });
  };

  const makeupCount = confirmClosure
    ? closure?.makeupCountByDate[confirmClosure.date] ?? 0
    : 0;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className="gap-1.5"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <CalendarPlus className="h-3.5 w-3.5" /> {label}
      </Button>

      {open ? (
        <EventFormDialog
          title="일정 등록"
          groups={groups}
          initial={{
            title: "",
            eventType: "exam",
            startDate: defaultDate ?? "",
            endDate: "",
            groupId: "",
            memo: "",
            startTime: "",
            endTime: "",
          }}
          isPending={isPending}
          error={error}
          closure={closure}
          onCancel={() => setOpen(false)}
          onSubmit={submit}
          onClosureChange={(date, next) => setConfirmClosure({ date, next })}
        />
      ) : null}

      {confirmClosure ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="학원 휴강 확인"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isPending) {
              event.stopPropagation();
              setConfirmClosure(null);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            <div className="card-title text-[#2a2323]">
              {confirmClosure.next
                ? `${formatKoreanDate(confirmClosure.date)}을 학원 휴강일로 등록할까요?`
                : `${formatKoreanDate(confirmClosure.date)} 학원 휴강을 해제할까요?`}
            </div>
            <p className="mt-2 text-sm leading-5 text-[#655d5d]">
              {confirmClosure.next
                ? "이 날짜에 예정된 모든 정규수업이 휴강 처리됩니다. 반복 수업 시간표와 다른 날짜의 수업은 변경되지 않습니다."
                : "해제하면 해당 날짜의 정규수업은 기존 시간표대로 다시 적용됩니다."}
            </p>
            {confirmClosure.next && makeupCount > 0 ? (
              <p className="mt-2 rounded-xl bg-[#f4f9f6] px-3 py-2 text-sm leading-5 text-[#3d7f64]">
                이 날짜에 예약된 보충수업 {makeupCount}건은 그대로 남아요.
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={isPending}
                onClick={() => setConfirmClosure(null)}
              >
                취소
              </Button>
              <Button type="button" className="flex-1" disabled={isPending} onClick={applyClosure}>
                {isPending ? "저장 중…" : confirmClosure.next ? "휴강일로 저장" : "휴강 해제"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function CalendarEventItem({
  event,
  groups,
}: {
  event: CalendarEventWithGroup;
  groups: GroupOption[];
}) {
  const meta = eventMetaOf(event.event_type);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isRange = event.start_date !== event.end_date;
  const rangeLabel = isRange
    ? `${formatKoreanDate(event.start_date)} ~ ${formatKoreanDate(event.end_date)}`
    : formatKoreanDate(event.start_date);

  const remove = () => {
    if (!window.confirm("이 일정을 삭제할까요?")) {
      return;
    }

    startTransition(async () => {
      const result = await deleteCalendarEventAction(event.id);

      if ("error" in result) {
        setError(result.error);
        return;
      }

    });
  };

  const submitEdit = (values: FormValues) => {
    setError("");
    startTransition(async () => {
      const result = await updateCalendarEventAction(event.id, values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setEditing(false);
    });
  };

  return (
    <div className="rounded-2xl border border-[#f0dae2] bg-white/90">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition hover:bg-[#fdf6f8]"
      >
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", meta.badge)}>
          {meta.label}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#2d2928]">
          {event.title}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-[#8a7b77]">{rangeLabel}</span>
      </button>

      {expanded ? (
        <div className="border-t border-dashed border-[#f4e2e8] px-3 py-2.5 text-sm leading-5 text-[#655d5d]">
          <div>기간 · {rangeLabel}</div>
          <div>대상 · {event.group?.name ?? "전체 일정"}</div>
          {event.memo ? <div className="whitespace-pre-line">메모 · {event.memo}</div> : null}
          {error ? <div className="mt-1 text-[#a2665f]">{error}</div> : null}

          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setError("");
                setEditing(true);
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[#564d4d] transition hover:bg-[#faf0f2]"
            >
              <Pencil className="h-3 w-3" aria-hidden /> 수정
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[#8f625f] transition hover:bg-[#fdf4f1]"
            >
              <Trash2 className="h-3 w-3" aria-hidden /> 삭제
            </button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <EventFormDialog
          title="일정 수정"
          groups={groups}
          initial={{
            title: event.title,
            eventType: event.event_type,
            startDate: event.start_date,
            endDate: isRange ? event.end_date : "",
            groupId: event.group_id ?? "",
            memo: event.memo ?? "",
            startTime: event.start_time?.slice(0, 5) ?? "",
            endTime: event.end_time?.slice(0, 5) ?? "",
          }}
          isPending={isPending}
          error={error}
          onCancel={() => setEditing(false)}
          onSubmit={submitEdit}
        />
      ) : null}
    </div>
  );
}
