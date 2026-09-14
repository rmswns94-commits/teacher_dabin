// 수업 종료 후 미작성 수업일지 알림의 파생 계산 (편의성 PHASE 2).
// 순수 함수 — Dashboard가 이미 가진 데이터(오늘 schedule window/오늘 일지 batch/그룹 목록)만
// 받아 후보 목록을 만든다. DB 접근/부작용 없음 (Todo·일지·알림 row 생성 금지의 근거).
//
// 판정 규약:
// - 대상: 오늘(KST) 요일 schedule이 있는 active 그룹만 (보충 수업 제외 — 정규 schedule 전용).
// - 작성 완료 = 오늘 일지 status === "completed" (Finalized)뿐. Draft는 미작성이다.
// - "수업이 끝났는가"(now >= endEpoch)는 여기서 판정하지 않는다 — 후보 전체를 내려보내고
//   client 카드가 local clock으로 필터한다 (페이지를 열어둔 채 종료 시각이 지나면 F5 없이 표시).
// - todayLogsFailed면 빈 목록 — 조회 실패를 "전부 미작성"으로 보여주는 false alarm 금지.
// - 목적지는 빠른 실행과 동일한 canonical 규칙: 일지 있으면 그 일지 edit(draft 이어쓰기,
//   race로 이미 completed여도 기존 edit 정책 그대로), 없으면 그룹+오늘이 지정된 새 작성 화면
//   (기존 draft resume/중복 방지는 그 화면의 기존 resolver가 처리 — 여기서 insert하지 않는다).

import { formatTimeHM, toEpoch } from "@/lib/schedule";

export type UnfinishedLogCandidate = {
  groupId: string;
  groupName: string;
  examPeriod: boolean;
  // "HH:MM ~ HH:MM" — 하루 여러 slot이면 [가장 이른 시작 ~ 가장 늦은 종료] 합집합
  timeLabel: string;
  // 오늘(KST) 이 그룹의 마지막 수업 종료 epoch
  endEpoch: number;
  href: string;
  actionLabel: "이어쓰기" | "작성하기";
};

export function deriveUnfinishedLogCandidates(input: {
  today: string; // KST date-only (기존 helper로 계산된 값)
  windowsByGroup: ReadonlyMap<string, { start: string; end: string }>;
  todayLogs: readonly { id: string; group_id: string; status: string }[];
  groups: readonly { id: string; name: string; is_exam_period: boolean }[];
  todayLogsFailed?: boolean;
}): UnfinishedLogCandidate[] {
  if (input.todayLogsFailed) {
    return [];
  }
  const groupById = new Map(input.groups.map((group) => [group.id, group]));

  return [...input.windowsByGroup.entries()]
    .filter(([groupId]) => groupById.has(groupId))
    .sort((a, b) => a[1].start.localeCompare(b[1].start))
    .flatMap(([groupId, window]) => {
      const log = input.todayLogs.find((item) => item.group_id === groupId);
      if (log?.status === "completed") {
        return [];
      }
      const group = groupById.get(groupId)!;
      return [
        {
          groupId,
          groupName: group.name,
          examPeriod: group.is_exam_period,
          timeLabel: `${formatTimeHM(window.start)} ~ ${formatTimeHM(window.end)}`,
          endEpoch: toEpoch(input.today, window.end),
          href: log
            ? `/daily-logs/${log.id}/edit`
            : `/daily-logs/new?groupId=${groupId}&date=${input.today}`,
          actionLabel: (log ? "이어쓰기" : "작성하기") as "이어쓰기" | "작성하기",
        },
      ];
    });
}
