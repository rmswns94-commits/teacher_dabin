"use client";

import { useRef } from "react";
import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";

// 새 수업일지 작성 화면 상단의 날짜/그룹 선택 피커.
// 예전엔 [학생 불러오기]를 눌러야만 반영돼서, 날짜만 바꾸고 버튼을 안 누르면
// 아래 폼이 이전 날짜로 남아 엉뚱한 날짜로 중복 검사에 걸렸다.
// → 값을 바꾸면 즉시 GET submit해 화면 전체(폼/이전 기록/지난 숙제)가 새 날짜로 동기화된다.
export function DailyLogPicker({
  groups,
  date,
  groupId,
}: {
  groups: { id: string; name: string }[];
  date: string;
  groupId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  return (
    <form ref={formRef} action="/daily-logs/new" className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[#7c6d69]">날짜</span>
        <input
          type="date"
          name="date"
          defaultValue={date}
          onChange={(event) => {
            if (event.target.value) {
              submit();
            }
          }}
          className="rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none"
          required
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[#7c6d69]">수업 그룹</span>
        <select
          name="groupId"
          defaultValue={groupId}
          onChange={submit}
          className="min-w-[180px] rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none"
          required
        >
          <option value="">그룹 선택</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>

      <Button type="submit" variant="secondary" size="sm" className="gap-1.5">
        <Users className="h-3.5 w-3.5" />
        학생 불러오기
      </Button>
    </form>
  );
}
