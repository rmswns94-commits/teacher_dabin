"use client";

import { useState } from "react";

import { groupIconPresets } from "@/lib/group-icons";
import { cn } from "@/lib/utils";

// 수업 그룹 대표 아이콘 선택기 — 등록/수정 폼 공용.
// 선택값은 hidden input(groupIcon)으로 부모 form에 실린다 (native/서버 액션 폼 호환).
export function GroupIconPicker({ initialIcon = null }: { initialIcon?: string | null }) {
  const [icon, setIcon] = useState(initialIcon ?? "");

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#4d3a3a]">
        대표 아이콘
        <span className="text-xs font-normal text-[#8a7b77]">
          현재 선택: {icon ? icon : "없음"}
        </span>
      </div>
      <input type="hidden" name="groupIcon" value={icon} />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={icon === ""}
          onClick={() => setIcon("")}
          className={cn(
            "flex h-9 items-center rounded-xl border px-2.5 text-xs font-medium transition",
            icon === ""
              ? "border-[#c9b9e8] bg-[#f3eefa] text-[#6d5aa8]"
              : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
          )}
        >
          없음
        </button>
        {groupIconPresets.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={icon === preset}
            aria-label={`대표 아이콘 ${preset}`}
            onClick={() => setIcon(preset)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl border text-lg transition",
              icon === preset
                ? "border-[#c9b9e8] bg-[#f3eefa] ring-1 ring-[#c9b9e8]"
                : "border-[#ece0db] bg-white hover:bg-[#faf6f3]",
            )}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
