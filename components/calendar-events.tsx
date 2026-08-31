"use client";

import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import {
  createCalendarEventAction,
  deleteCalendarEventAction,
  updateCalendarEventAction,
} from "@/app/daily-logs/event-actions";
import { Button } from "@/components/ui/button";
import { formatKoreanDate } from "@/lib/dates";
import type { CalendarEventWithGroup } from "@/lib/supabase/queries/calendar-events";
import { calendarEventTypes, calendarEventMeta, eventMetaOf } from "@/lib/validation/calendar-event";
import { cn } from "@/lib/utils";

type GroupOption = { id: string; name: string };

type FormValues = {
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  groupId: string;
  memo: string;
};

function EventFormDialog({
  title,
  initial,
  groups,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: FormValues;
  groups: GroupOption[];
  isPending: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const update = (patch: Partial<FormValues>) => setValues((prev) => ({ ...prev, ...patch }));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="font-display text-lg font-semibold text-[#2a2323]">{title}</div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">일정 이름</span>
          <input
            value={values.title}
            onChange={(event) => update({ title: event.target.value })}
            maxLength={100}
            autoFocus
            placeholder="중2 기말고사"
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#e3b9c9] placeholder:text-[#a79996]"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">종류</span>
          <select
            value={values.eventType}
            onChange={(event) => update({ eventType: event.target.value })}
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
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
              className="rounded-2xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none"
              aria-label="시작일"
            />
            <span className="text-sm text-[#8a7b77]">~</span>
            <input
              type="date"
              value={values.endDate}
              onChange={(event) => update({ endDate: event.target.value })}
              className="rounded-2xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none"
              aria-label="종료일 (하루짜리면 비워두세요)"
            />
          </div>
          <p className="mt-1 text-xs text-[#a79996]">하루짜리 일정이면 종료일은 비워두세요.</p>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">적용 대상</span>
          <select
            value={values.groupId}
            onChange={(event) => update({ groupId: event.target.value })}
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
          >
            <option value="">전체 일정</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">메모 (선택)</span>
          <textarea
            value={values.memo}
            onChange={(event) => update({ memo: event.target.value })}
            rows={2}
            maxLength={500}
            placeholder="시험기간에는 숙제량 조절"
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#e3b9c9] placeholder:text-[#a79996]"
          />
        </label>

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
            disabled={isPending || !values.title.trim() || !values.startDate}
            onClick={() => onSubmit(values)}
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
}: {
  groups: GroupOption[];
  defaultDate?: string;
  label?: string;
  variant?: "secondary" | "outline" | "ghost";
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
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
      router.refresh();
    });
  };

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
          }}
          isPending={isPending}
          error={error}
          onCancel={() => setOpen(false)}
          onSubmit={submit}
        />
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
  const router = useRouter();
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

      router.refresh();
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
      router.refresh();
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
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", meta.badge)}>
          {meta.label}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#2d2928]">
          {event.title}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-[#8a7b77]">{rangeLabel}</span>
      </button>

      {expanded ? (
        <div className="border-t border-dashed border-[#f4e2e8] px-3 py-2.5 text-xs leading-5 text-[#655d5d]">
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
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[#564d4d] transition hover:bg-[#faf0f2]"
            >
              <Pencil className="h-3 w-3" aria-hidden /> 수정
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[#8f625f] transition hover:bg-[#fdf4f1]"
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
