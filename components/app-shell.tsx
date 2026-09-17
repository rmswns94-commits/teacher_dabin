import type { ReactNode } from "react";

import { ScrollJumpControls } from "@/components/scroll-jump-controls";
import { Sidebar } from "@/components/sidebar";
import { getGroupNextOccurrences } from "@/lib/schedule";
import { buildScheduleExceptionIndex } from "@/lib/schedule-exceptions";
import { todayDateString } from "@/lib/dates";
import { addDaysStr } from "@/lib/calendar";
import { getAcademyClosuresInRange } from "@/lib/supabase/queries/academy-closures";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getPendingMakeupCount } from "@/lib/supabase/queries/makeups";
import { getScheduleExceptionsInRange } from "@/lib/supabase/queries/schedule-exceptions";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { getKoreanHolidaysInRange } from "@/lib/korean-holidays";
import { getSupplementsInRange } from "@/lib/supabase/queries/supplements";
import { ensureActiveWorkspace } from "@/lib/supabase/queries/workspaces";

export async function AppShell({ children }: { children: ReactNode }) {
  const today = todayDateString();
  // 학원(Workspace) 보장 — 신규 가입자는 아직 학원이 없다. 업무 데이터의 workspace_id 기본값이
  // 활성 학원이라, 학원이 없으면 첫 저장이 실패한다. 앱 진입 시 한 번만 만들어 둔다
  // (이미 있으면 조회 1회로 끝나고, 학원 migration 전에는 아무 일도 하지 않는다).
  await ensureActiveWorkspace();

  const [
    groups,
    pendingMakeupCount,
    schedules,
    scheduleExceptions,
    academyClosures,
    supplements,
    publicHolidays,
  ] = await Promise.all([
      getCurrentUserGroups(),
      getPendingMakeupCount(),
      getCurrentUserSchedulesWithGroup(),
      // 다음 수업 탐색 범위(7일)의 1회 예외 — 그룹마다 조회하지 않는다 (N+1 금지)
      getScheduleExceptionsInRange(today, addDaysStr(today, 7)),
      // 같은 범위의 학원 전체 휴강일 (range 1쿼리)
      getAcademyClosuresInRange(today, addDaysStr(today, 7)),
      // 보강(1회성 그룹 수업)도 다음 수업 후보다 (range 1쿼리)
      getSupplementsInRange(today, addDaysStr(today, 7)),
      // 대한민국 공휴일 (달력 사실 — DB 조회 아님)
      getKoreanHolidaysInRange(today, addDaysStr(today, 7)),
    ]);

  // 사이드바 그룹 트리는 /groups 현황판과 같은 기준으로:
  // 다음 수업이 빠른 순 → 일정 없는 그룹은 마지막 (동순위는 이름 가나다순)
  // 1회 휴강은 다음 수업 후보에서 빠지고, 시간 변경은 변경된 시각으로 정렬된다.
  const nextByGroup = getGroupNextOccurrences(
    schedules,
    new Date(),
    7,
    buildScheduleExceptionIndex(scheduleExceptions, academyClosures, supplements, publicHolidays),
  );
  const sortedGroups = [...groups].sort((a, b) => {
    const keyA = nextByGroup.get(a.id)?.startEpoch ?? Number.MAX_SAFE_INTEGER;
    const keyB = nextByGroup.get(b.id)?.startEpoch ?? Number.MAX_SAFE_INTEGER;
    return keyA - keyB || a.name.localeCompare(b.name, "ko");
  });

  return (
    <div className="flex min-h-screen text-[#2d2928]">
      <Sidebar
        groups={sortedGroups.map((group) => ({
          id: group.id,
          name: group.name,
          icon: group.icon ?? null,
          // 이미 조회한 그룹 row의 필드 그대로 — 그룹별 추가 쿼리 없음
          isExamPeriod: group.is_exam_period,
        }))}
        pendingMakeupCount={pendingMakeupCount}
      />
      <div className="app-main flex-1 overflow-hidden max-lg:pt-14">
        {children}
        <ScrollJumpControls />
      </div>
    </div>
  );
}
