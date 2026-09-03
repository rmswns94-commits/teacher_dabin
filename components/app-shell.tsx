import type { ReactNode } from "react";

import { ScrollJumpButton } from "@/components/scroll-jump-button";
import { Sidebar } from "@/components/sidebar";
import { getGroupNextOccurrences } from "@/lib/schedule";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getPendingMakeupCount } from "@/lib/supabase/queries/makeups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";

export async function AppShell({ children }: { children: ReactNode }) {
  const [groups, pendingMakeupCount, schedules] = await Promise.all([
    getCurrentUserGroups(),
    getPendingMakeupCount(),
    getCurrentUserSchedulesWithGroup(),
  ]);

  // 사이드바 그룹 트리는 /groups 현황판과 같은 기준으로:
  // 다음 수업이 빠른 순 → 일정 없는 그룹은 마지막 (동순위는 이름 가나다순)
  const nextByGroup = getGroupNextOccurrences(schedules, new Date());
  const sortedGroups = [...groups].sort((a, b) => {
    const keyA = nextByGroup.get(a.id)?.startEpoch ?? Number.MAX_SAFE_INTEGER;
    const keyB = nextByGroup.get(b.id)?.startEpoch ?? Number.MAX_SAFE_INTEGER;
    return keyA - keyB || a.name.localeCompare(b.name, "ko");
  });

  return (
    <div className="flex min-h-screen text-[#2d2928]">
      <Sidebar
        groups={sortedGroups.map((group) => ({ id: group.id, name: group.name, icon: group.icon ?? null }))}
        pendingMakeupCount={pendingMakeupCount}
      />
      <div className="app-main flex-1 overflow-hidden max-lg:pt-14">
        {children}
        <ScrollJumpButton />
      </div>
    </div>
  );
}
