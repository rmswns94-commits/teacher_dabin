"use client";

import { useRouter } from "next/navigation";
import { UserRoundPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { createStudentAction } from "@/app/students/actions";
import { Button } from "@/components/ui/button";
import { gradeOptions } from "@/lib/grades";

type GroupOption = { id: string; name: string };

// 다이얼로그를 열 때마다 mount되므로 이전 임시 입력이 남지 않는다.
function StudentFormDialog({
  groups,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  groups: GroupOption[];
  isPending: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (values: { name: string; grade: string; school: string; memo: string; groupId: string }) => void;
}) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("middle_2");
  const [school, setSchool] = useState("");
  const [memo, setMemo] = useState("");
  const [groupId, setGroupId] = useState("");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="학생 등록"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isPending) {
          onCancel();
        }
      }}
    >
      <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="font-display text-lg font-semibold text-[#2a2323]">학생 등록</div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">이름</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            autoFocus
            placeholder="김다빈"
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#e3b9c9] placeholder:text-[#a79996]"
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">학년</span>
            <select
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
            >
              {gradeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">학교 (선택)</span>
            <input
              value={school}
              onChange={(event) => setSchool(event.target.value)}
              maxLength={80}
              placeholder="OO중학교"
              className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#e3b9c9] placeholder:text-[#a79996]"
            />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">수업 그룹 (선택)</span>
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
          >
            <option value="">그룹 선택 안 함</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">메모 (선택)</span>
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="단어 암기 점검 필요"
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
            disabled={isPending || !name.trim()}
            onClick={() => onSubmit({ name, grade, school, memo, groupId })}
          >
            {isPending ? "등록 중..." : "등록"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function StudentCreateDialog({
  groups,
  label = "학생 등록",
}: {
  groups: GroupOption[];
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = (values: { name: string; grade: string; school: string; memo: string; groupId: string }) => {
    setError("");
    startTransition(async () => {
      const result = await createStudentAction(values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setOpen(false);
      setSavedMessage("학생을 등록했어요.");
      setTimeout(() => setSavedMessage(""), 2500);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-3">
      {savedMessage ? <span className="text-xs text-[#3d7f64]">{savedMessage}</span> : null}
      <Button
        type="button"
        className="gap-2"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <UserRoundPlus className="h-4 w-4" /> {label}
      </Button>

      {open ? (
        <StudentFormDialog
          groups={groups}
          isPending={isPending}
          error={error}
          onCancel={() => setOpen(false)}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}
