"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { DAY_LABELS } from "@/lib/schedule";

type Row = {
  key: number;
  day: string;
  start: string;
  end: string;
};

// 그룹 생성 폼 안에서 수업 시간 여러 줄을 편집하는 필드 그룹.
// 일반 form 필드(scheduleDay/scheduleStart/scheduleEnd)로 제출되므로
// 서버 액션에서 formData.getAll(...)로 순서대로 읽는다.
export function ScheduleFieldsEditor() {
  const [rows, setRows] = useState<Row[]>([{ key: 0, day: "", start: "", end: "" }]);
  const [nextKey, setNextKey] = useState(1);

  const update = (key: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { key: nextKey, day: "", start: "", end: "" }]);
    setNextKey((value) => value + 1);
  };

  const removeRow = (key: number) => {
    setRows((prev) => prev.filter((row) => row.key !== key));
  };

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-center gap-2">
          <select
            name="scheduleDay"
            value={row.day}
            onChange={(event) => update(row.key, { day: event.target.value })}
            className="rounded-xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none"
            aria-label="수업 요일"
          >
            <option value="">요일</option>
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <option key={day} value={day}>{DAY_LABELS[day]}요일</option>
            ))}
          </select>
          <input
            type="time"
            name="scheduleStart"
            value={row.start}
            onChange={(event) => update(row.key, { start: event.target.value })}
            className="rounded-xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none"
            aria-label="시작 시간"
          />
          <span className="text-sm text-[#8a7b77]">~</span>
          <input
            type="time"
            name="scheduleEnd"
            value={row.end}
            onChange={(event) => update(row.key, { end: event.target.value })}
            className="rounded-xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none"
            aria-label="종료 시간"
          />
          <button
            type="button"
            onClick={() => removeRow(row.key)}
            aria-label="이 수업 시간 삭제"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#a79996] transition hover:bg-[#fdf4f1] hover:text-[#8f625f]"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 rounded-xl border border-dashed border-[#d9cec9] px-3 py-2 text-sm text-[#756a67] transition hover:bg-[#faf6f3]"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> 수업 시간 추가
      </button>
    </div>
  );
}
