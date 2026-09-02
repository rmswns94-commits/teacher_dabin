import { AppShell } from "@/components/app-shell";
import { GrowthNotesList } from "@/components/growth-notes-list";
import { PageHeader } from "@/components/page-header";
import { addDaysStr, dayOfWeekOf } from "@/lib/calendar";
import { formatKoreanDate, toDateString, todayDateString } from "@/lib/dates";
import { vocabPercent } from "@/lib/elementary";
import { computeWeeklyGrowth } from "@/lib/growth";
import { toGrowthBadge, type StudentGrowthCardSummary } from "@/lib/growth-note";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import {
  getGrowthLessonRows,
  getGrowthPraiseRows,
  type GrowthLessonRow,
} from "@/lib/supabase/queries/growth-notes";
import { getCurrentUserMemberships, getCurrentUserStudents } from "@/lib/supabase/queries/students";

// 한국 기준 주 시작(월요일). 날짜 문자열만으로 계산해 timezone 밀림이 없다.
function weekStartOf(ymd: string) {
  return addDaysStr(ymd, -((dayOfWeekOf(ymd) + 6) % 7));
}

// 단어왕 판정용 최근 시험 조회는 90일로 bounded (전체 history 조회 금지)
const VOCAB_WINDOW_DAYS = 90;

export default async function GrowthNotesPage() {
  const today = todayDateString();
  const weekStart = weekStartOf(today);
  const weekEnd = addDaysStr(weekStart, 6);
  const windowStart = addDaysStr(weekStart, -VOCAB_WINDOW_DAYS);

  // 학생 수와 무관하게 고정 5쿼리 (batch — N+1 금지)
  const [students, memberships, groups, lessonRows, praiseRows] = await Promise.all([
    getCurrentUserStudents(),
    getCurrentUserMemberships(),
    getCurrentUserGroups(),
    getGrowthLessonRows(windowStart, weekEnd),
    getGrowthPraiseRows(weekStart),
  ]);

  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
  const groupIdsByStudent = new Map<string, string[]>();
  for (const membership of memberships) {
    if (!groupNameById.has(membership.group_id)) continue;
    const ids = groupIdsByStudent.get(membership.student_id) ?? [];
    if (!ids.includes(membership.group_id)) {
      ids.push(membership.group_id);
      groupIdsByStudent.set(membership.student_id, ids);
    }
  }

  const rowsByStudent = new Map<string, GrowthLessonRow[]>();
  for (const row of lessonRows) {
    rowsByStudent.set(row.student_id, [...(rowsByStudent.get(row.student_id) ?? []), row]);
  }

  // 칭찬은 (연결된 일지 날짜 ?? 작성일 KST) 기준으로 이번 주만 센다
  const logDateById = new Map(lessonRows.map((row) => [row.daily_log_id, row.class_date]));
  const praiseCountByStudent = new Map<string, number>();
  for (const praise of praiseRows) {
    const date =
      (praise.daily_log_id ? logDateById.get(praise.daily_log_id) : null) ??
      toDateString(new Date(praise.created_at));
    if (date >= weekStart && date <= weekEnd) {
      praiseCountByStudent.set(
        praise.student_id,
        (praiseCountByStudent.get(praise.student_id) ?? 0) + 1,
      );
    }
  }

  const summaries: StudentGrowthCardSummary[] = students
    .map((student) => {
      const rows = rowsByStudent.get(student.id) ?? [];
      const weekRows = rows.filter((row) => row.class_date >= weekStart);
      const growth = computeWeeklyGrowth({
        weekRecords: weekRows.map((row) => ({
          attendance: row.attendance,
          homeworkStatus: row.homework_status,
          focusLevel: row.focus_level,
          participationLevel: row.participation_level,
          questionLevel: row.question_level,
          kindnessLevel: row.kindness_level,
          effortLevel: row.effort_level,
        })),
        recentVocabPercents: rows
          .filter((row) => row.vocab_correct !== null && (row.vocab_total ?? 0) > 0)
          .map((row) => vocabPercent(row.vocab_correct!, row.vocab_total!)!),
      });

      const groupIds = groupIdsByStudent.get(student.id) ?? [];

      return {
        studentId: student.id,
        studentName: student.name,
        groupIds,
        groupNames: groupIds.map((groupId) => groupNameById.get(groupId)!),
        achievements: growth.achieved.map(toGrowthBadge),
        praiseCount: praiseCountByStudent.get(student.id) ?? 0,
      };
    })
    // 이름순 정렬 — Achievement 개수 정렬은 랭킹처럼 보이므로 금지
    .sort((a, b) => a.studentName.localeCompare(b.studentName, "ko"));

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title="🌱 성장노트"
          description="이번 주에도 아이들이 한 걸음씩 성장했어요."
        />
        <div className="mb-4 text-sm font-medium tabular-nums text-[#6b6b74]">
          이번 주 · {formatKoreanDate(weekStart)} ~ {formatKoreanDate(weekEnd)}
        </div>
        <GrowthNotesList
          summaries={summaries}
          groups={groups.map((group) => ({ id: group.id, name: group.name }))}
        />
      </main>
    </AppShell>
  );
}
