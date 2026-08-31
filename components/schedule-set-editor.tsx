"use client";

import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import {
  addGroupScheduleSetAction,
  deleteGroupScheduleSetAction,
  replaceGroupScheduleSetAction,
} from "@/app/groups/actions";
import {
  WeekdayTimePicker,
  validatePickerValue,
  type PickerValue,
} from "@/components/weekday-time-picker";
import { Button } from "@/components/ui/button";
import { formatDayList, groupSchedulesByTime } from "@/lib/schedule";
import type { ClassGroupScheduleRecord } from "@/lib/supabase/types";

const emptyPicker: PickerValue = { days: [], startTime: "", endTime: "" };

// 그룹 수정 모드의 수업 시간 편집기. 같은 시간대 요일들을 블록으로 묶어
// 보여주고, 추가/수정/삭제는 바로 저장된다.
export function ScheduleSetEditor({
  groupId,
  slots,
}: {
  groupId: string;
  slots: ClassGroupScheduleRecord[];
}) {
  const router = useRouter();
  const blocks = groupSchedulesByTime(slots);

  const [picker, setPicker] = useState<PickerValue>(emptyPicker);
  const [editingIds, setEditingIds] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const resetPicker = () => {
    setPicker(emptyPicker);
    setEditingIds(null);
    setError("");
  };

  const save = () => {
    const message = validatePickerValue(picker);

    if (message) {
      setError(message);
      return;
    }

    setError("");
    startTransition(async () => {
      const values = { days: picker.days, startTime: picker.startTime, endTime: picker.endTime };
      const result = editingIds
        ? await replaceGroupScheduleSetAction(groupId, editingIds, values)
        : await addGroupScheduleSetAction(groupId, values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      resetPicker();
      router.refresh();
    });
  };

  const startEdit = (block: (typeof blocks)[number]) => {
    setPicker({ days: block.days, startTime: block.startTime, endTime: block.endTime });
    setEditingIds(block.slotIds);
    setError("");
  };

  const removeBlock = (block: (typeof blocks)[number]) => {
    if (!window.confirm("이 수업 시간을 삭제할까요?")) {
      return;
    }

    startTransition(async () => {
      const result = await deleteGroupScheduleSetAction(groupId, block.slotIds);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      if (editingIds && editingIds[0] === block.slotIds[0]) {
        resetPicker();
      }

      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {blocks.length === 0 ? (
        <div className="rounded-2xl bg-[#f8f3ef] p-3 text-sm text-[#655d5d]">
          아직 등록된 수업 시간이 없어요.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {blocks.map((block) => (
            <li
              key={block.key}
              className="flex items-center justify-between gap-2 rounded-xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2"
            >
              <span className="text-sm text-[#2b2323]">
                <span className="font-medium">{formatDayList(block.days)}</span>
                <span className="ml-2 tabular-nums text-[#655d5d]">
                  {block.startTime} ~ {block.endTime}
                </span>
              </span>
              <span className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  onClick={() => startEdit(block)}
                  disabled={isPending}
                  aria-label={`${formatDayList(block.days)} ${block.startTime} 수업 시간 수정`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#a79996] transition hover:bg-[#faf6f3] hover:text-[#564d4d]"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(block)}
                  disabled={isPending}
                  aria-label={`${formatDayList(block.days)} ${block.startTime} 수업 시간 삭제`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#a79996] transition hover:bg-[#fdf4f1] hover:text-[#8f625f]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-2xl border border-dashed border-[#e3d5ce] bg-white/60 p-3">
        {editingIds ? (
          <p className="mb-2 text-xs font-medium text-[#8f5470]">수업 시간을 수정하고 있어요.</p>
        ) : null}

        <WeekdayTimePicker value={picker} onChange={setPicker} />

        {error ? <p className="mt-2 text-xs text-[#a2665f]">{error}</p> : null}

        <div className="mt-2.5 flex gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={save} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {isPending ? "저장 중..." : editingIds ? "변경 저장" : "수업 시간 추가"}
          </Button>
          {editingIds ? (
            <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={resetPicker}>
              취소
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
