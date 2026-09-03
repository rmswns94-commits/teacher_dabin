"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { gradeDisplay } from "@/lib/grades";
import type { StudentGrade } from "@/lib/supabase/types";
import { genderLabels } from "@/lib/validation/student";
import { cn } from "@/lib/utils";

// 수업 그룹 상세의 학생 목록 정렬 (client-side — 이미 불러온 데이터만 재정렬, 재조회 없음).
// 기본은 이름 가나다순. 정렬은 순서만 바꾸며 학생을 걸러내지 않는다.

export type GroupStudentItem = {
  id: string;
  name: string;
  grade: StudentGrade;
  school: string | null;
  gender: "male" | "female" | null;
};

type StudentSortKey = "name" | "school" | "gender";

const sortOptions: { key: StudentSortKey; label: string }[] = [
  { key: "name", label: "이름순" },
  { key: "school", label: "학교순" },
  { key: "gender", label: "성별순" },
];

// render마다 새로 만들지 않는 module-level collator (한국어 가나다순)
const koreanCollator = new Intl.Collator("ko-KR", { sensitivity: "base", numeric: true });

function compareName(a: GroupStudentItem, b: GroupStudentItem) {
  return koreanCollator.compare(a.name.trim(), b.name.trim());
}

// 남학생 → 여학생 → 미입력 (deterministic)
const genderRank = (gender: GroupStudentItem["gender"]) =>
  gender === "male" ? 0 : gender === "female" ? 1 : 2;

export function sortGroupStudents(students: GroupStudentItem[], sortBy: StudentSortKey) {
  // 원본 배열 mutation 금지 — 복사 후 정렬
  return [...students].sort((a, b) => {
    if (sortBy === "school") {
      const schoolA = a.school?.trim() ?? "";
      const schoolB = b.school?.trim() ?? "";

      // 학교 미입력은 항상 뒤로
      if (Boolean(schoolA) !== Boolean(schoolB)) {
        return schoolA ? -1 : 1;
      }

      const bySchool = koreanCollator.compare(schoolA, schoolB);
      if (bySchool !== 0) {
        return bySchool;
      }
    }

    if (sortBy === "gender") {
      const byGender = genderRank(a.gender) - genderRank(b.gender);
      if (byGender !== 0) {
        return byGender;
      }
    }

    // 공통 secondary: 이름 가나다순 (동명이면 id로 stable하게 고정)
    return compareName(a, b) || a.id.localeCompare(b.id);
  });
}

export function GroupStudentList({ students }: { students: GroupStudentItem[] }) {
  const [sortBy, setSortBy] = useState<StudentSortKey>("name");
  const sorted = useMemo(() => sortGroupStudents(students, sortBy), [students, sortBy]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-1.5" role="group" aria-label="학생 정렬">
        <span className="mr-0.5 text-xs text-[#8a7b77]">정렬</span>
        {sortOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={sortBy === option.key}
            onClick={() => setSortBy(option.key)}
            className={cn(
              "min-h-[38px] rounded-full border px-3 py-1.5 text-xs font-medium transition",
              sortBy === option.key
                ? "border-[#d9c8f0] bg-[#f3eefa] font-semibold text-[#6d5aa8]"
                : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {sorted.map((student) => (
          <Link key={student.id} href={`/students/${student.id}`} className="block">
            <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-[#f0e7e2] bg-[#fffdfb] px-3 py-2 transition hover:bg-[#f7f2fb]">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#2b2323]">
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e8e1ff] to-[#f6dfe9] text-[10px] font-semibold text-[#4a3c52]"
                >
                  {student.name.charAt(0)}
                </span>
                <span className="truncate">{student.name}</span>
              </span>
              <span className="min-w-0 truncate text-right text-xs text-[#8a7b77]">
                {[
                  gradeDisplay[student.grade],
                  student.school || null,
                  student.gender ? genderLabels[student.gender] : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
