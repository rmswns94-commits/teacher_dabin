"use client";

import { useRouter } from "next/navigation";
import { Check, SquarePen } from "lucide-react";
import { useState, useTransition } from "react";

import { updateStudentDetailsAction } from "@/app/students/actions";
import { ConfirmDiscardDialog, useBeforeUnloadWarning } from "@/components/unsaved-guard";
import { Button } from "@/components/ui/button";
import { todayDateString } from "@/lib/dates";
import { gradeOptions } from "@/lib/grades";
import { genderLabels } from "@/lib/validation/student";
import { cn } from "@/lib/utils";

type GroupOption = { id: string; name: string };

export type StudentEditInitialValues = {
  name: string;
  grade: string;
  school: string;
  memo: string;
  gender: string;
  birthDate: string;
  groupIds: string[];
};

// 학생 상세는 read-only — 수정은 이 Dialog에서만 한다.
// 등록 다이얼로그와 같은 필드/검증/unsaved guard 구조를 사용한다.
function StudentEditFormDialog({
  initial,
  groups,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  initial: StudentEditInitialValues;
  groups: GroupOption[];
  isPending: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (values: StudentEditInitialValues) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [grade, setGrade] = useState(initial.grade);
  const [school, setSchool] = useState(initial.school);
  const [memo, setMemo] = useState(initial.memo);
  const [gender, setGender] = useState(initial.gender);
  const [birthDate, setBirthDate] = useState(initial.birthDate);
  const [groupIds, setGroupIds] = useState<string[]>(initial.groupIds);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 초기값과 달라진 것이 있으면 수정 중으로 본다
  const sortedIds = (ids: string[]) => [...ids].sort().join(",");
  const isDirty =
    name !== initial.name ||
    grade !== initial.grade ||
    school !== initial.school ||
    memo !== initial.memo ||
    gender !== initial.gender ||
    birthDate !== initial.birthDate ||
    sortedIds(groupIds) !== sortedIds(initial.groupIds);

  useBeforeUnloadWarning(isDirty);

  const requestClose = () => {
    if (isPending) {
      return;
    }

    if (isDirty) {
      setConfirmOpen(true);
    } else {
      onCancel();
    }
  };

  const toggleGroup = (groupId: string) => {
    setGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="학생 정보 수정"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !confirmOpen) {
          requestClose();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isDirty && !isPending) {
          onCancel();
        }
      }}
    >
      <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="font-display text-lg font-semibold text-[#2a2323]">학생 정보 수정</div>
        <p className="mt-1 text-xs text-[#8a7b77]">학생의 기본 정보와 수업 그룹을 수정할 수 있어요.</p>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">이름</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#e3b9c9]"
          />
        </label>

        {/* min-w-0: iPad Safari date input intrinsic width가 옆 칸을 침범하지 않게 */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">학년</span>
            <select
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
            >
              {gradeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">성별 (선택)</span>
            <select
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
            >
              <option value="">성별 선택</option>
              <option value="male">{genderLabels.male}</option>
              <option value="female">{genderLabels.female}</option>
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">생일 (선택)</span>
            <input
              type="date"
              value={birthDate}
              max={todayDateString()}
              onChange={(event) => setBirthDate(event.target.value)}
              className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
            />
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">학교 (선택)</span>
            <input
              value={school}
              onChange={(event) => setSchool(event.target.value)}
              maxLength={80}
              placeholder="OO중학교"
              className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#e3b9c9]"
            />
          </label>
        </div>

        <div className="mt-3">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">소속 수업 그룹 (선택)</span>
          {groups.length === 0 ? (
            <p className="text-xs text-[#a79996]">아직 만든 수업 그룹이 없어요.</p>
          ) : (
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-2xl border border-[#ece0db] bg-white p-2">
              {groups.map((group) => {
                const checked = groupIds.includes(group.id);

                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-pressed={checked}
                    className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition hover:bg-[#faf0f2]"
                  >
                    {checked ? (
                      <span
                        aria-hidden
                        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md bg-[#8fc7ab]"
                      >
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </span>
                    ) : (
                      <span
                        aria-hidden
                        className="h-[18px] w-[18px] shrink-0 rounded-md border-2 border-[#d9c8f0] bg-white"
                      />
                    )}
                    <span className={cn(checked ? "text-[#2d2928]" : "text-[#655d5d]")}>{group.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">메모 (선택)</span>
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#e3b9c9]"
          />
        </label>

        {error ? (
          <div className="mt-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={requestClose}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !name.trim()}
            onClick={() => onSubmit({ name, grade, school, memo, gender, birthDate, groupIds })}
          >
            {isPending ? "저장 중..." : "변경사항 저장"}
          </Button>
        </div>
      </div>

      <ConfirmDiscardDialog
        open={confirmOpen}
        onKeepEditing={() => setConfirmOpen(false)}
        onDiscard={onCancel}
      />
    </div>
  );
}

export function StudentEditDialog({
  studentId,
  initial,
  groups,
}: {
  studentId: string;
  initial: StudentEditInitialValues;
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = (values: StudentEditInitialValues) => {
    setError("");
    startTransition(async () => {
      const result = await updateStudentDetailsAction(studentId, values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setOpen(false);
      setSavedMessage("학생 정보를 수정했어요.");
      setTimeout(() => setSavedMessage(""), 2500);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <SquarePen className="h-3.5 w-3.5" /> 학생 정보 수정하기
      </Button>
      {savedMessage ? <span className="text-xs text-[#3d7f64]">{savedMessage}</span> : null}

      {open ? (
        <StudentEditFormDialog
          initial={initial}
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
