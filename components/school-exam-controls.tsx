"use client";

import { Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteSchoolExamAction } from "@/app/exams/actions";
import { Button } from "@/components/ui/button";

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

// 준비 상태(준비 전/중/완료) segmented control은 제거됨 — 준비 상태는
// Planner의 완료 개수(진행률)가 자동으로 보여준다 (DB prep_status 컬럼은 legacy 보존).

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
