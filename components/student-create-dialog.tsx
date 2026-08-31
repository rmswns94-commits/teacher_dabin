"use client";

import { useRouter } from "next/navigation";
import { Check, UserRoundPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { createStudentAction } from "@/app/students/actions";
import { ConfirmDiscardDialog, useBeforeUnloadWarning } from "@/components/unsaved-guard";
import { Button } from "@/components/ui/button";
import { todayDateString } from "@/lib/dates";
import { gradeOptions } from "@/lib/grades";
import { genderLabels } from "@/lib/validation/student";
import { cn } from "@/lib/utils";

type GroupOption = { id: string; name: string };

type FormValues = {
  name: string;
  grade: string;
  school: string;
  memo: string;
  gender: string;
  birthDate: string;
  groupIds: string[];
};

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
  onSubmit: (values: FormValues) => void;
}) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("middle_2");
  const [school, setSchool] = useState("");
  const [memo, setMemo] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 초기 상태와 달라진 값이 하나라도 있으면 작성 중으로 본다.
  const isDirty = Boolean(
    name.trim() ||
      school.trim() ||
      memo.trim() ||
      gender ||
      birthDate ||
      groupIds.length > 0 ||
      grade !== "middle_2",
  );

  useBeforeUnloadWarning(isDirty);

  // 취소/ESC: 작성 중이면 확인을 거친다.
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
      aria-label="학생 등록"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !confirmOpen) {
          requestClose();
        }
      }}
      onClick={(event) => {
        // 바깥(backdrop) 클릭: 작성 중이면 아무 일도 일어나지 않는다.
        if (event.target === event.currentTarget && !isDirty && !isPending) {
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
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">성별 (선택)</span>
            <select
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
            >
              <option value="">성별 선택</option>
              <option value="male">{genderLabels.male}</option>
              <option value="female">{genderLabels.female}</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">생일 (선택)</span>
            <input
              type="date"
              value={birthDate}
              max={todayDateString()}
              onChange={(event) => setBirthDate(event.target.value)}
              className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
            />
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

        <div className="mt-3">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">소속 수업 그룹 (선택)</span>
          {groups.length === 0 ? (
            <p className="text-xs text-[#a79996]">아직 만든 수업 그룹이 없어요. 나중에 배정할 수 있어요.</p>
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
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={requestClose}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !name.trim()}
            onClick={() => onSubmit({ name, grade, school, memo, gender, birthDate, groupIds })}
          >
            {isPending ? "등록 중..." : "학생 등록"}
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

  const submit = (values: FormValues) => {
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
