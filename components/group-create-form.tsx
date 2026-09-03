"use client";

import { GroupIconPicker } from "@/components/group-icon-picker";
import { BookMarked, CalendarClock, Layers3, Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { createGroupAction, type GroupCreateState } from "@/app/groups/actions";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { ScheduleFieldsEditor } from "@/components/schedule-fields-editor";
import { TextbookFieldsEditor } from "@/components/textbook-fields-editor";
import { useNativeFormDirty } from "@/components/unsaved-guard";
import { gradeOptions } from "@/lib/grades";

export function GroupCreateForm({
  onCancel,
  onDirtyChange,
}: {
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [state, formAction] = useActionState<GroupCreateState, FormData>(createGroupAction, undefined);
  // 취소 시 key를 바꿔 동적 행 편집기(수업 시간/교재)를 초기 상태로 되돌린다.
  const [resetKey, setResetKey] = useState(0);
  // 수업 시간 블록의 hidden input까지 포함해 form 전체 변경을 감지한다.
  const { formProps } = useNativeFormDirty(onDirtyChange);

  return (
    <form action={formAction} className="space-y-6" {...formProps}>
      <div>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#4d3a3a]">
          <Layers3 className="h-4 w-4 text-[#3e7d6b]" aria-hidden /> 기본 정보
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">그룹명</span>
            <input
              name="name"
              className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
              placeholder="중2 화목반"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">학년</span>
            <select
              name="grade"
              defaultValue="middle_2"
              className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
              required
            >
              {gradeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="md:col-span-2">
            <GroupIconPicker />
          </div>

          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">메모 (선택)</span>
            <input
              name="memo"
              className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
              placeholder="보충 위주 반, 숙제 확인 필수"
            />
          </label>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#4d3a3a]">
          <CalendarClock className="h-4 w-4 text-[#6652b9]" aria-hidden /> 수업 시간
        </div>
        <ScheduleFieldsEditor key={`schedules-${resetKey}`} />
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#4d3a3a]">
          <BookMarked className="h-4 w-4 text-[#a2686b]" aria-hidden /> 교재
        </div>
        <TextbookFieldsEditor key={`textbooks-${resetKey}`} />
      </div>

      {state?.error ? (
        <div className="rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-4 py-3 text-sm text-[#7f5d57]">
          {state.error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
        ) : (
          <Button type="reset" variant="outline" onClick={() => setResetKey((key) => key + 1)}>
            취소
          </Button>
        )}
        <PendingButton pendingText="등록 중..." className="gap-2">
          <Plus className="h-4 w-4" aria-hidden /> 등록
        </PendingButton>
      </div>
    </form>
  );
}
