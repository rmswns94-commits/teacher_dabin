"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteStudentAction } from "@/app/students/actions";
import { Button } from "@/components/ui/button";

export function StudentDeleteButton({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const remove = () => {
    if (
      !window.confirm(
        `${studentName} 학생을 정말 삭제할까요?\n\n이 학생의 수업 기록과 보충 기록도 함께 삭제되고, 되돌릴 수 없어요.`,
      )
    ) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await deleteStudentAction(studentId);

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
        disabled={isPending}
        onClick={remove}
        className="gap-2 text-[#8f625f]"
      >
        <Trash2 className="h-4 w-4" />
        {isPending ? "삭제 중..." : "학생 삭제"}
      </Button>
      {error ? <p className="text-xs text-[#a2665f]">{error}</p> : null}
    </div>
  );
}
