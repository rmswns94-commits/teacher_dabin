import Link from "next/link";
import { Search, UserRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StudentCreateDialog } from "@/components/student-create-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatShortMonthDay } from "@/lib/dates";
import { formatGrade } from "@/lib/grades";
import { formatScheduleBlock, groupSchedulesByTime } from "@/lib/schedule";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { getCurrentUserMemberships, getCurrentUserStudents } from "@/lib/supabase/queries/students";
import type { StudentRecord } from "@/lib/supabase/types";
import { genderShortLabels } from "@/lib/validation/student";

function StudentRow({ student }: { student: StudentRecord }) {
  const metaParts = [
    formatGrade(student.grade),
    student.gender ? genderShortLabels[student.gender] : "",
  ].filter(Boolean);

  return (
    <Link href={`/students/${student.id}`} className="block">
      <div className="flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 py-2 transition hover:bg-[#f7f2fb]">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e8e1ff] to-[#f6dfe9] text-xs font-semibold text-[#4a3c52]"
        >
          {student.name.trim().charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[#2d2928]">{student.name}</span>
          <span className="block text-xs text-[#8a7b77]">{metaParts.join(" · ")}</span>
        </span>
        {student.birth_date ? (
          <span className="hidden shrink-0 text-xs tabular-nums text-[#a89a95] sm:inline">
            {formatShortMonthDay(student.birth_date)}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim().toLowerCase();

  const [students, groups, memberships, schedules] = await Promise.all([
    getCurrentUserStudents(true),
    getCurrentUserGroups(),
    getCurrentUserMemberships(),
    getCurrentUserSchedulesWithGroup(),
  ]);

  const groupOptions = groups.map((group) => ({ id: group.id, name: group.name }));
  const activeStudents = students.filter((student) => !student.archived);
  const archivedStudents = students.filter((student) => student.archived);
  const matches = (student: StudentRecord) => !q || student.name.toLowerCase().includes(q);

  const studentById = new Map(activeStudents.map((student) => [student.id, student]));
  const activeGroupIds = new Set(groups.map((group) => group.id));

  // 그룹별 학생 목록 (membership 기준 view — 학생 row는 하나뿐)
  const studentsByGroup = new Map<string, StudentRecord[]>();
  const assignedStudentIds = new Set<string>();
  for (const membership of memberships) {
    const student = studentById.get(membership.student_id);
    if (!student || !activeGroupIds.has(membership.group_id)) {
      continue;
    }
    assignedStudentIds.add(student.id);
    studentsByGroup.set(membership.group_id, [
      ...(studentsByGroup.get(membership.group_id) ?? []),
      student,
    ]);
  }

  const unassigned = activeStudents.filter((student) => !assignedStudentIds.has(student.id));

  const schedulesByGroup = new Map<string, typeof schedules>();
  for (const slot of schedules) {
    schedulesByGroup.set(slot.group_id, [...(schedulesByGroup.get(slot.group_id) ?? []), slot]);
  }

  const sections = groups.map((group) => {
    const groupStudents = (studentsByGroup.get(group.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, "ko"),
    );
    return {
      group,
      total: groupStudents.length,
      students: groupStudents.filter(matches),
      times: groupSchedulesByTime(schedulesByGroup.get(group.id) ?? []).map(formatScheduleBlock),
    };
  });

  const visibleSections = q ? sections.filter((section) => section.students.length > 0) : sections;
  const visibleUnassigned = unassigned.filter(matches).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const nothingFound =
    q && visibleSections.length === 0 && visibleUnassigned.length === 0;

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[1000px]">
          <PageHeader title="학생" description="학생들을 반별로 확인해요." />

          <Card className="mb-5">
            <CardContent className="py-4">
              <form action="/students" className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f6f0fb] text-[#5e4eb5]">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  defaultValue={params.q ?? ""}
                  name="q"
                  className="flex-1 border-none bg-transparent text-sm text-[#433d3d] outline-none placeholder:text-[#9b8e8a]"
                  placeholder="학생 이름 검색"
                />
                <Button type="submit" variant="secondary" size="sm">
                  검색
                </Button>
                {q ? (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/students">전체 보기</Link>
                  </Button>
                ) : null}
              </form>
            </CardContent>
          </Card>

          {activeStudents.length === 0 && !q ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-[#655d5d]">
                아직 등록된 학생이 없어요 🌱
                <StudentCreateDialog groups={groupOptions} label="첫 학생 등록하기" />
              </CardContent>
            </Card>
          ) : nothingFound ? (
            <Card>
              <CardContent className="p-6 text-sm text-[#655d5d]">검색한 학생을 찾지 못했어요.</CardContent>
            </Card>
          ) : (
            <div className="grid items-start gap-4 md:grid-cols-2">
              {visibleSections.map(({ group, total, students: groupStudents, times }) => (
                <Card key={group.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/groups/${group.id}`}
                        className="font-semibold text-[#2d2928] hover:underline"
                      >
                        {group.name}
                      </Link>
                      <span className="rounded-full bg-[#f2effc] px-2 py-0.5 text-[11px] tabular-nums text-[#5f54b8]">
                        {total}명
                      </span>
                    </div>
                    {times.length > 0 ? (
                      <div className="mt-0.5 text-xs tabular-nums text-[#a89a95]">
                        {times.slice(0, 3).join(" · ")}
                      </div>
                    ) : null}

                    <div className="mt-2 divide-y divide-dashed divide-[#f4e2e8]">
                      {groupStudents.length === 0 ? (
                        <div className="py-3 text-xs text-[#a89a95]">
                          아직 이 반에 등록된 학생이 없어요.{" "}
                          <Link href={`/groups/${group.id}`} className="text-[#8f5470] underline">
                            학생 배정하기
                          </Link>
                        </div>
                      ) : (
                        groupStudents.map((student) => (
                          <StudentRow key={student.id} student={student} />
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {(!q && unassigned.length > 0) || (q && visibleUnassigned.length > 0) ? (
                <Card className="border-[#efe0d6] bg-[#fdfaf5]/80">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-semibold text-[#7b6a5e]">
                        <UserRound className="h-4 w-4 text-[#b3a091]" aria-hidden /> 미배정 학생
                      </span>
                      <span className="rounded-full bg-[#f3ece3] px-2 py-0.5 text-[11px] tabular-nums text-[#8a7460]">
                        {unassigned.length}명
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-[#a89a95]">아직 반이 정해지지 않은 학생이에요.</div>

                    <div className="mt-2 divide-y divide-dashed divide-[#f0e5da]">
                      {visibleUnassigned.map((student) => (
                        <StudentRow key={student.id} student={student} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          )}

          {archivedStudents.length > 0 && !q ? (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-medium text-[#756a67]">
                보관된 학생 {archivedStudents.length}명 보기
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {archivedStudents.map((student) => (
                  <Link key={student.id} href={`/students/${student.id}`} className="block">
                    <div className="flex min-h-11 items-center justify-between rounded-xl border border-[#ece0db] bg-white/70 px-3 py-2 text-sm text-[#8a7b77] transition hover:bg-[#faf6f3]">
                      <span>{student.name}</span>
                      <span className="text-xs">{formatGrade(student.grade)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}

          {activeStudents.length > 0 || q ? (
            <div className="mt-6 flex justify-end pb-8">
              <StudentCreateDialog groups={groupOptions} />
            </div>
          ) : (
            <div className="pb-8" />
          )}
        </div>
      </main>
    </AppShell>
  );
}
