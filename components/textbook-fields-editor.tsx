"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

type Row = {
  key: number;
  value: string;
};

// 교재 여러 권을 한 줄씩 입력하는 필드 그룹. name="textbook"으로 제출되어
// 서버 액션이 getAll("textbook")로 읽은 뒤 줄 단위 텍스트로 합쳐 저장한다.
export function TextbookFieldsEditor({ initialBooks = [] }: { initialBooks?: string[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    (initialBooks.length > 0 ? initialBooks : [""]).map((value, index) => ({ key: index, value })),
  );
  const [nextKey, setNextKey] = useState(rows.length);

  const update = (key: number, value: string) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, value } : row)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { key: nextKey, value: "" }]);
    setNextKey((value) => value + 1);
  };

  const removeRow = (key: number) => {
    setRows((prev) => prev.filter((row) => row.key !== key));
  };

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2">
          <input
            name="textbook"
            value={row.value}
            maxLength={100}
            onChange={(event) => update(row.key, event.target.value)}
            placeholder="능률 영어 중2"
            className="flex-1 rounded-xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
            aria-label="교재 이름"
          />
          <button
            type="button"
            onClick={() => removeRow(row.key)}
            aria-label="이 교재 삭제"
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
        <Plus className="h-3.5 w-3.5" aria-hidden /> 교재 추가
      </button>
    </div>
  );
}
