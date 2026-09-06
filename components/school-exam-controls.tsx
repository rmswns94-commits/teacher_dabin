"use client";

import { Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteSchoolExamAction,
  updateSchoolExamPrepStatusAction,
} from "@/app/exams/actions";
import { Button } from "@/components/ui/button";
import type { SchoolExamPrepStatus } from "@/lib/supabase/types";
import { prepStatusLabels, prepStatusValues } from "@/lib/validation/school-exam";
import { cn } from "@/lib/utils";

// 상단 compact 필터 — 연도/학기/시험 종류만 (대형 필터 시스템 금지). GET 파라미터로 서버 필터.
export function SchoolExamFilters({
  year,
  semester,
  examType,
  yearOptions,
}: {
  year: number;
  semester: number | null; // null = 전체
  examType: string | null;
  yearOptions: number[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const apply = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    router.push(`/exams?${params.toString()}`);
  };

  const selectClass =
    "min-h-[42px] rounded-2xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={String(year)}
        onChange={(event) => apply({ year: event.target.value })}
        aria-label="연도 필터"
        className={selectClass}
      >
        {yearOptions.map((option) => (
          <option key={option} value={String(option)}>{option}년</option>
        ))}
      </select>
      <select
        value={semester === null ? "all" : String(semester)}
        onChange={(event) => apply({ semester: event.target.value })}
        aria-label="학기 필터"
        className={selectClass}
      >
        <option value="all">전체 학기</option>
        <option value="1">1학기</option>
        <option value="2">2학기</option>
      </select>
      <select
        value={examType ?? ""}
        onChange={(event) => apply({ type: event.target.value })}
        aria-label="시험 종류 필터"
        className={selectClass}
      >
        <option value="">전체 시험</option>
        <option value="midterm">중간고사</option>
        <option value="final">기말고사</option>
        <option value="other">기타 시험</option>
      </select>
    </div>
  );
}

// Teacher 준비 상태 (준비 전/중/완료) — Todo가 아니며 자동 생성과 무관한 단순 상태값
export function SchoolExamPrepStatusControl({
  examId,
  value,
}: {
  examId: string;
  value: SchoolExamPrepStatus;
}) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const set = (next: SchoolExamPrepStatus) => {
    if (next === value) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await updateSchoolExamPrepStatusAction(examId, next);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      router.refresh();
    });
  };

  return (
    <div>
      <div className="flex gap-1.5" role="group" aria-label="시험 준비 상태">
        {prepStatusValues.map((status) => (
          <button
            key={status}
            type="button"
            disabled={isPending}
            aria-pressed={value === status}
            onClick={() => set(status)}
            className={cn(
              "min-h-[38px] rounded-xl border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60",
              value === status
                ? status === "ready"
                  ? "border-[#bfe3d2] bg-[#edf9f3] text-[#2f6d54]"
                  : status === "preparing"
                    ? "border-[#ecd9b4] bg-[#fdf3e4] text-[#8a6828]"
                    : "border-[#dcdce2] bg-[#f4f4f6] text-[#6b6b74]"
                : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
            )}
          >
            {prepStatusLabels[status]}
          </button>
        ))}
      </div>
      {error ? <p className="mt-1.5 text-xs text-[#a2665f]">{error}</p> : null}
    </div>
  );
}

// 시험 삭제 — underlying calendar exam event까지 함께 삭제된다 (캘린더/대시보드에서도 사라짐)
export function SchoolExamDeleteButton({
  examId,
  label,
}: {
  examId: string;
  label: string;
}) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const remove = () => {
    if (
      !window.confirm(
        `${label} 시험을 삭제할까요?\n\n캘린더의 시험 일정도 함께 삭제돼요. 학생 정보와 수업 기록은 그대로 남아요.`,
      )
    ) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await deleteSchoolExamAction(examId);

      if (result && "error" in result) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={remove}
        className="gap-1.5 text-xs text-[#8f625f]"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {isPending ? "삭제 중..." : "시험 삭제"}
      </Button>
      {error ? <p className="text-xs text-[#a2665f]">{error}</p> : null}
    </div>
  );
}
