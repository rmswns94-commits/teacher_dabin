"use client";

import { useRouter } from "next/navigation";

// 그룹/상태 필터 툴바. 변경 즉시 URL 쿼리로 반영한다 (log 선택은 초기화).
export function DailyLogsFilter({
  groups,
  month,
  date,
  groupId,
  status,
}: {
  groups: { id: string; name: string }[];
  month: string;
  date: string | null;
  groupId: string;
  status: string;
}) {
  const router = useRouter();

  const navigate = (nextGroupId: string, nextStatus: string) => {
    const params = new URLSearchParams();
    params.set("month", month);
    if (date) params.set("date", date);
    if (nextGroupId) params.set("groupId", nextGroupId);
    if (nextStatus) params.set("status", nextStatus);
    router.push(`/daily-logs?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[#8a7b77]">수업 그룹</span>
        <select
          value={groupId}
          onChange={(event) => navigate(event.target.value, status)}
          className="rounded-xl border border-[#ecdcd8] bg-white/80 px-3 py-2 text-sm outline-none focus:border-[#e3b9c9]"
        >
          <option value="">전체 그룹</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>{group.name}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[#8a7b77]">작성 상태</span>
        <select
          value={status}
          onChange={(event) => navigate(groupId, event.target.value)}
          className="rounded-xl border border-[#ecdcd8] bg-white/80 px-3 py-2 text-sm outline-none focus:border-[#e3b9c9]"
        >
          <option value="">전체 상태</option>
          <option value="draft">작성 중</option>
          <option value="completed">작성 완료</option>
        </select>
      </label>

      {groupId || status ? (
        <button
          type="button"
          onClick={() => navigate("", "")}
          className="min-h-9 rounded-xl px-3 py-2 text-xs text-[#8a7b77] transition hover:bg-white/70 hover:text-[#564d4d]"
        >
          초기화
        </button>
      ) : null}
    </div>
  );
}
