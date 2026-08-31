import Link from "next/link";
import { CircleArrowRight, NotebookTabs, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { DailyLogForm } from "@/components/daily-log-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import {
  getCurrentUserGroups,
  getGroupLatestProgress,
  getGroupStudentsForCurrentUser,
} from "@/lib/supabase/queries/groups";

export default async function NewDailyLogPage({
  searchParams,
}: {
  searchParams?: Promise<{ groupId?: string; date?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const requestedGroupId = params.groupId || null;

  // 그룹 목록과 (선택된 그룹의) 학생/직전 수업을 한 번에 병렬 조회한다.
  const [groups, groupStudentsRaw, lastLesson] = await Promise.all([
    getCurrentUserGroups(),
    requestedGroupId ? getGroupStudentsForCurrentUser(requestedGroupId) : Promise.resolve([]),
    requestedGroupId ? getGroupLatestProgress(requestedGroupId) : Promise.resolve(null),
  ]);

  const selectedGroup = requestedGroupId
    ? groups.find((group) => group.id === requestedGroupId)
    : undefined;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : todayDateString();
  const groupStudents = selectedGroup
    ? groupStudentsRaw.filter((student) => !student.archived)
    : [];

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title="오늘 수업 기록하기"
          description="반을 선택하면 소속 학생이 자동으로 표시돼요."
          action={
            <Button variant="secondary" asChild>
              <Link href="/daily-logs">일지 목록</Link>
            </Button>
          }
        />

        <Card className="mb-5">
          <CardContent className="py-4">
            <form action="/daily-logs/new" className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#7c6d69]">날짜</span>
                <input
                  type="date"
                  name="date"
                  defaultValue={date}
                  className="rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#7c6d69]">수업 그룹</span>
                <select
                  name="groupId"
                  defaultValue={selectedGroup?.id ?? ""}
                  className="min-w-[180px] rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none"
                  required
                >
                  <option value="">그룹 선택</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </label>

              <Button type="submit" variant="secondary" size="sm" className="gap-1.5">
                <Users className="h-3.5 w-3.5" />
                학생 불러오기
              </Button>
            </form>
          </CardContent>
        </Card>

        {!selectedGroup ? (
          groups.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-[#655d5d]">
                아직 만든 수업 그룹이 없어요. 먼저 수업 그룹을 만들어주세요.
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/groups">수업 그룹 만들기</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-[#655d5d]">
                위에서 수업 그룹을 선택하고 &quot;학생 불러오기&quot;를 눌러주세요.
              </CardContent>
            </Card>
          )
        ) : groupStudents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-[#655d5d]">
              이 그룹에는 아직 소속된 학생이 없어요. 그룹에 학생을 먼저 추가해주세요.
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/groups/${selectedGroup.id}`}>그룹에서 학생 추가하기</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {lastLesson && (lastLesson.homework || lastLesson.next_lesson_plan) ? (
              <Card className="mb-5 border-[#e8ddf3] bg-[#fbf8ff]">
                <CardContent className="grid gap-4 p-4 md:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#6d5aa8]">
                      <NotebookTabs className="h-3.5 w-3.5" /> 지난 숙제 ({formatKoreanDate(lastLesson.class_date)})
                    </div>
                    <div className="mt-2 whitespace-pre-line text-sm leading-6 text-[#3d3450]">
                      {lastLesson.homework || "지난 숙제 기록이 없어요."}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#3e7d6b]">
                      <CircleArrowRight className="h-3.5 w-3.5" /> 지난 시간에 적어둔 오늘 계획
                    </div>
                    <div className="mt-2 whitespace-pre-line text-sm leading-6 text-[#33473f]">
                      {lastLesson.next_lesson_plan || "적어둔 계획이 없어요."}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <DailyLogForm
              classDate={date}
              group={{ id: selectedGroup.id, name: selectedGroup.name }}
              students={groupStudents.map((student) => ({
                studentId: student.id,
                name: student.name,
                grade: student.grade,
              }))}
            />
          </>
        )}
      </main>
    </AppShell>
  );
}
