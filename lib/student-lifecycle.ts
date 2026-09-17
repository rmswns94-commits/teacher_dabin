// 학생 lifecycle(재원/휴원/퇴원) — soft status 관리의 단일 소스.
//
// 원칙:
// - 휴원/퇴원은 hard delete가 아니다. 학생 row와 모든 과거 기록(일지/출결/평가/숙제/
//   보충/성장/칭찬)은 그대로 보존된다 — 일지는 group_id/student_id 스냅샷을 직접
//   참조하므로 상태·소속이 바뀌어도 과거 기록은 영향받지 않는다.
// - 현재 roster 제외의 마스터 플래그는 기존 students.archived다 (작성 roster/그룹 상세/
//   성장노트/브리핑/숙제 선택 전부가 이미 !archived 필터를 쓴다). status 컬럼은
//   "왜 제외됐는가"(휴원 vs 퇴원)만 구분한다.
// - migration(20260917_add_student_lifecycle_status.sql) 미적용 환경에서는 status가
//   없을 수 있다 — 그 경우 archived 학생은 퇴원으로 표시한다 (기존 '보관'과 동일 의미).

import type { StudentLifecycleStatus } from "@/lib/supabase/types";

export type { StudentLifecycleStatus };

export function studentLifecycleStatus(student: {
  archived: boolean;
  status?: StudentLifecycleStatus | null;
}): StudentLifecycleStatus {
  if (!student.archived) {
    // archived=false가 항상 재원 — status 잔여값보다 마스터 플래그가 우선
    return "active";
  }
  return student.status === "paused" ? "paused" : "withdrawn";
}

export const lifecycleLabels: Record<StudentLifecycleStatus, string> = {
  active: "재원",
  paused: "휴원",
  withdrawn: "퇴원",
};

// 목록/상세 badge 톤 — 기존 파스텔 팔레트에 맞춤
export const lifecycleBadgeClasses: Record<StudentLifecycleStatus, string> = {
  active: "bg-[#e4f4ec] text-[#3d7f64]",
  paused: "bg-[#fdf3e4] text-[#8a6828]",
  withdrawn: "bg-[#f4f1ee] text-[#8a7b77]",
};
