"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";

import {
  WeekdayTimePicker,
  validatePickerValue,
  type PickerValue,
} from "@/components/weekday-time-picker";
import { formatDayList, sortDays } from "@/lib/schedule";

type Block = {
  key: number;
  days: number[];
  startTime: string;
  endTime: string;
};

const emptyPicker: PickerValue = { days: [], startTime: "", endTime: "" };

// 그룹 생성 폼의 수업 시간 편집기.
// 여러 요일을 한 번에 선택해 하나의 "블록"으로 추가하고,
// 제출 시에는 요일별 hidden input(scheduleDay/Start/End)으로 펼쳐져
// 기존 서버 검증/저장 로직을 그대로 재사용한다.
export function ScheduleFieldsEditor() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [picker, setPicker] = useState<PickerValue>(emptyPicker);
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [nextKey, setNextKey] = useState(0);
  const [error, setError] = useState("");

  const addBlock = () => {
    const message = validatePickerValue(picker);

    if (message) {
      setError(message);
      return;
    }

    // 다른 블록과 같은 요일에 시간이 겹치면 막는다 (수정 중인 블록 제외).
    const others = blocks.filter((block) => block.key !== editingKey);
    for (const block of others) {
      const sharedDays = block.days.filter((day) => picker.days.includes(day));
      const overlaps =
        picker.startTime < block.endTime && block.startTime < picker.endTime;

      if (sharedDays.length > 0 && overlaps) {
        setError(`${formatDayList(sharedDays)}요일에 이미 겹치는 수업 시간이 있어요.`);
        return;
      }
    }

    setError("");

    // 완전히 같은 시간대 블록이 이미 있으면 요일만 합친다.
    const sameTime = others.find(
      (block) => block.startTime === picker.startTime && block.endTime === picker.endTime,
    );

    if (sameTime) {
      setBlocks(
        others.map((block) =>
          block.key === sameTime.key
            ? { ...block, days: sortDays([...new Set([...block.days, ...picker.days])]) }
            : block,
        ),
      );
    } else {
      setBlocks([
        ...others,
        { key: nextKey, days: sortDays(picker.days), startTime: picker.startTime, endTime: picker.endTime },
      ]);
      setNextKey((key) => key + 1);
    }

    setPicker(emptyPicker);
    setEditingKey(null);
  };

  const editBlock = (block: Block) => {
    setPicker({ days: block.days, startTime: block.startTime, endTime: block.endTime });
    setEditingKey(block.key);
    setError("");
  };

  const removeBlock = (key: number) => {
    setBlocks((prev) => prev.filter((block) => block.key !== key));
    if (editingKey === key) {
      setEditingKey(null);
      setPicker(emptyPicker);
    }
  };

  return (
    <div className="space-y-3">
      {blocks.length > 0 ? (
        <ul className="space-y-1.5">
          {blocks.map((block) => (
            <li
              key={block.key}
              className="flex items-center justify-between gap-2 rounded-xl border border-[#ece0db] bg-[#fdfaf6] px-3 py-2"
            >
              <span className="text-sm text-[#2d2928]">
                <span className="font-medium">{formatDayList(block.days)}</span>
                <span className="ml-2 tabular-nums text-[#655d5d]">
                  {block.startTime} ~ {block.endTime}
                </span>
              </span>
              <span className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  onClick={() => editBlock(block)}
                  aria-label="이 수업 시간 수정"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#a79996] transition hover:bg-white hover:text-[#564d4d]"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(block.key)}
                  aria-label="이 수업 시간 삭제"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#a79996] transition hover:bg-[#fdf4f1] hover:text-[#8f625f]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rounded-2xl border border-dashed border-[#e3d5ce] bg-white/60 p-3">
        <WeekdayTimePicker value={picker} onChange={setPicker} />

        {error ? <p className="mt-2 text-xs text-[#a2665f]">{error}</p> : null}

        <button
          type="button"
          onClick={addBlock}
          className="mt-2.5 flex items-center gap-1.5 rounded-xl border border-[#d9cec9] bg-white px-3 py-2 text-sm text-[#756a67] transition hover:bg-[#faf6f3]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {editingKey !== null ? "수업 시간 변경" : "수업 시간 추가"}
        </button>
      </div>

      {/* 제출용: 블록을 요일별 행으로 펼친다 (기존 서버 파싱과 동일 형식) */}
      {blocks.flatMap((block) =>
        block.days.map((day) => (
          <Fragment key={`${block.key}-${day}`}>
            <input type="hidden" name="scheduleDay" value={day} />
            <input type="hidden" name="scheduleStart" value={block.startTime} />
            <input type="hidden" name="scheduleEnd" value={block.endTime} />
          </Fragment>
        )),
      )}
    </div>
  );
}
