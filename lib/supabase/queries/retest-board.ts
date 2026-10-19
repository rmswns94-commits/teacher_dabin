import type { AssessmentCategory } from "@/lib/assessments";
import { sortByKoreanName } from "@/lib/korean-sort";
import {
  NO_GROUP_KEY,
  assignRetestGroups,
  compareActiveRetests,
  groupAttemptsByRetestId,
  type RetestAttempt,
  type RetestStatus,
} from "@/lib/retests";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { dailyLogIdOf, getActiveRetestRows, getPassedRetestRows, getRetestAttempts } from "@/lib/supabase/queries/retests";
import { getCurrentUserMemberships, getCurrentUserStudents } from "@/lib/supabase/queries/students";
import type { ClassGroupRecord } from "@/lib/supabase/types";

// 재시험 관리 화면용 조립 — 재시험/학생/소속/반을 각각 batch 1쿼리로 읽고 메모리에서 묶는다
// (반마다/학생마다/재시험마다 쿼리하지 않는다).

export type RetestView = {
  id: string;
  studentId: string;
  studentName: string;
  category: AssessmentCategory;
  status: RetestStatus;
  classDate: string;
  createdAt: string;
  passedAt: string | null;
  totalQuestions: number | null;
  correctCount: number | null;
  progress: string | null;
  dailyLogId: string | null;
  sourceGroupId: string | null;
  sourceGroupName: string | null;
  // 지금 이 재시험을 관리하는 반 (현재 소속 기준) — null = 반 정보 없음
  homeGroupId: string | null;
  // 등록 당시 반과 지금 관리하는 반이 다름 → "OO반에서 등록" 표시
  moved: boolean;
  // 미통과 시도 이력 (1회 → 2회 …) — 반 상세/통과 기록에서만 채운다 (메인 카드는 count만 필요)
  attempts: RetestAttempt[];
};

// 보이는 재시험들의 시도 이력을 batch 1쿼리로 붙인다 (재시험마다 쿼리하지 않는다)
async function withAttempts(items: RetestView[]) {
  const byRetest = groupAttemptsByRetestId(await getRetestAttempts(items.map((item) => item.id)));
  return items.map((item) => ({ ...item, attempts: byRetest.get(item.id) ?? [] }));
}

async function context() {
  const [students, memberships, groups] = await Promise.all([
    getCurrentUserStudents(true),
    getCurrentUserMemberships(),
    getCurrentUserGroups(true),
  ]);
  return { students, memberships, groups };
}

function toViews(
  rows: Awaited<ReturnType<typeof getActiveRetestRows>>["rows"],
  ctx: Awaited<ReturnType<typeof context>>,
) {
  const studentById = new Map(ctx.students.map((student) => [student.id, student]));
  const groupById = new Map(ctx.groups.map((group) => [group.id, group]));
  const assigned = assignRetestGroups(
    rows.map((row) => ({ row, studentId: row.student_id, sourceGroupId: row.group_id })),
    {
      memberships: ctx.memberships,
      activeGroupIds: ctx.groups.filter((group) => !group.archived).map((group) => group.id),
    },
  );
  return assigned.map(({ row, homeGroupId, moved }) => {
    const student = studentById.get(row.student_id);
    return {
      view: {
        id: row.id,
        studentId: row.student_id,
        studentName: student?.name ?? "학생 정보 없음",
        category: row.category,
        status: row.status,
        classDate: row.class_date,
        createdAt: row.created_at,
        passedAt: row.passed_at,
        totalQuestions: row.total_questions,
        correctCount: row.correct_count,
        progress: row.progress_snapshot?.trim() || null,
        dailyLogId: dailyLogIdOf(row),
        sourceGroupId: row.group_id,
        sourceGroupName: row.group_id ? groupById.get(row.group_id)?.name ?? null : null,
        homeGroupId: homeGroupId && groupById.has(homeGroupId) ? homeGroupId : null,
        moved,
        attempts: [],
      } satisfies RetestView,
      // 휴원/퇴원 학생은 진행중 목록에서 제외 (기록은 그대로 — 통과 기록/복귀 시 다시 보임)
      archived: student ? student.archived : true,
    };
  });
}

export type RetestGroupCard = {
  key: string; // group id 또는 NO_GROUP_KEY
  group: ClassGroupRecord | null;
  items: RetestView[];
};

// 메인: 진행중 재시험을 관리 반별로 — 0건인 반은 만들지 않는다.
export async function getActiveRetestBoard() {
  const [{ available, rows }, ctx] = await Promise.all([getActiveRetestRows(), context()]);
  const views = toViews(rows, ctx);
  const visible = views.filter((item) => !item.archived).map((item) => item.view);
  const byGroup = new Map<string, RetestView[]>();
  for (const item of visible) {
    const key = item.homeGroupId ?? NO_GROUP_KEY;
    byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
  }
  // 반 목록 순서 (보관 반은 뒤, 반 정보 없음은 마지막)
  const order = [...ctx.groups].sort((a, b) => Number(a.archived) - Number(b.archived));
  const cards: RetestGroupCard[] = order
    .filter((group) => byGroup.has(group.id))
    .map((group) => ({ key: group.id, group, items: byGroup.get(group.id)! }));
  if (byGroup.has(NO_GROUP_KEY)) {
    cards.push({ key: NO_GROUP_KEY, group: null, items: byGroup.get(NO_GROUP_KEY)! });
  }
  return { available, cards, hiddenArchivedCount: views.length - visible.length };
}

// 반 상세: 이 반에서 관리하는 진행중 재시험 — 등록 당시 반이 이 반이거나 지금 이 반 학생인 것만 읽는다.
export async function getGroupRetestBoard(groupKey: string) {
  const ctx = await context();
  const group = groupKey === NO_GROUP_KEY ? null : ctx.groups.find((item) => item.id === groupKey) ?? null;
  if (groupKey !== NO_GROUP_KEY && !group) {
    return null;
  }
  const memberIds = group ? ctx.memberships.filter((m) => m.group_id === group.id).map((m) => m.student_id) : [];
  const { available, rows } = await getActiveRetestRows(group ? { groupId: group.id, studentIds: memberIds } : undefined);
  const items = await withAttempts(
    toViews(rows, ctx)
      .filter((item) => !item.archived && (item.view.homeGroupId ?? NO_GROUP_KEY) === groupKey)
      .map((item) => item.view)
      .sort(compareActiveRetests),
  );
  // 학생 순서 = 기존 반 학생 정렬 규칙 (이름 가나다순, 동명이인 id)
  const studentOrder = sortByKoreanName(
    [...new Map(items.map((item) => [item.studentId, item])).values()],
    (item) => item.studentName,
    (item) => item.studentId,
  ).map((item) => item.studentId);
  return { available, group, items, studentOrder };
}

// 통과 기록: 최근 통과순 (더 보기)
export async function getPassedRetestHistory(limit: number) {
  const [{ available, rows, hasMore }, ctx] = await Promise.all([getPassedRetestRows(limit), context()]);
  const items = await withAttempts(toViews(rows, ctx).map((item) => item.view));
  return { available, items, hasMore, groups: ctx.groups };
}
