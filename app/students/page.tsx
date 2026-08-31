import Link from "next/link";
import { Cake, ChevronRight, Search } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StudentCreateDialog } from "@/components/student-create-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addDaysStr } from "@/lib/calendar";
import { formatKoreanDate, formatShortMonthDay, todayDateString } from "@/lib/dates";
import { formatGrade } from "@/lib/grades";
import { computeStudentStatuses, emptyStudentStatus } from "@/lib/student-status";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getCurrentUserMakeups } from "@/lib/supabase/queries/makeups";
import { getRecentLessonRecords } from "@/lib/supabase/queries/student-history";
import { getCurrentUserMemberships, getCurrentUserStudents } from "@/lib/supabase/queries/students";
import type { StudentRecord } from "@/lib/supabase/types";
import { genderShortLabels } from "@/lib/validation/student";
import { cn } from "@/lib/utils";

const avatarTones = [
  "from-[#e8e1ff] to-[#f6dfe9]",
  "from-[#dcefe8] to-[#e8e1ff]",
  "from-[#fbe8df] to-[#f6dfe9]",
  "from-[#fdf3e4] to-[#e4f4ec]",
  "from-[#f4dfe5] to-[#fdeee3]",
];

function avatarTone(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return avatarTones[hash % avatarTones.length];
}

const FILTERS = [
  { key: "", label: "전체" },
  { key: "attention", label: "관리 필요" },
  { key: "birthday", label: "이번 달 생일" },
  { key: "unassigned", label: "미배정" },
] as const;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; filter?: string; saved?: string; deleted?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim().toLowerCase();
  const activeFilter = ["attention", "birthday", "unassigned"].includes(params.filter ?? "")
    ? (params.filter as "attention" | "birthday" | "unassigned")
    : "";

  const today = todayDateString();
  const since = addDaysStr(today, -30);

  const [students, groups, memberships, recentRecords, makeups] = await Promise.all([
    getCurrentUserStudents(true),
    getCurrentUserGroups(),
    getCurrentUserMemberships(),
    getRecentLessonRecords(since),
    getCurrentUserMakeups(),
  ]);

  const groupOptions = groups.map((group) => ({ id: group.id, name: group.name }));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const activeStudents = students.filter((student) => !student.archived);
  const archivedStudents = students.filter((student) => student.archived);

  // 학생별 소속 활성 그룹 badge
  const groupsByStudent = new Map<string, string[]>();
  for (const membership of memberships) {
    const group = groupById.get(membership.group_id);
    if (!group) {
      continue;
    }
    groupsByStudent.set(membership.student_id, [
      ...(groupsByStudent.get(membership.student_id) ?? []),
      group.name,
    ]);
  }

  const openMakeupIds = new Set(
    makeups
      .filter((makeup) => makeup.status === "required" || makeup.status === "scheduled")
      .map((makeup) => makeup.student?.id)
      .filter((id): id is string => Boolean(id)),
  );

  const statuses = computeStudentStatuses(recentRecords, openMakeupIds);
  const statusOf = (student: StudentRecord) => statuses.get(student.id) ?? emptyStudentStatus;

  const currentMonth = today.slice(5, 7);
  const isBirthdayMonth = (student: StudentRecord) =>
    Boolean(student.birth_date && student.birth_date.slice(5, 7) === currentMonth);
  const isUnassigned = (student: StudentRecord) => !(groupsByStudent.get(student.id)?.length);

  const counts = {
    all: activeStudents.length,
    attention: activeStudents.filter((student) => statusOf(student).attention).length,
    birthday: activeStudents.filter(isBirthdayMonth).length,
    unassigned: activeStudents.filter(isUnassigned).length,
  };

  const matchesSearch = (student: StudentRecord) => {
    if (!q) {
      return true;
    }

    const haystack = [
      student.name,
      formatGrade(student.grade),
      ...(groupsByStudent.get(student.id) ?? []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  };

  let visibleStudents = activeStudents.filter((student) => {
    if (activeFilter === "attention" && !statusOf(student).attention) return false;
    if (activeFilter === "birthday" && !isBirthdayMonth(student)) return false;
    if (activeFilter === "unassigned" && !isUnassigned(student)) return false;
    return matchesSearch(student);
  });

  visibleStudents =
    activeFilter === "birthday"
      ? [...visibleStudents].sort((a, b) =>
          (a.birth_date?.slice(8) ?? "").localeCompare(b.birth_date?.slice(8) ?? ""),
        )
      : [...visibleStudents].sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const filterHref = (key: string) => {
    const query = new URLSearchParams();
    if (key) query.set("filter", key);
    if (params.q) query.set("q", params.q);
    const qs = query.toString();
    return qs ? `/students?${qs}` : "/students";
  };

  const emptyMessage =
    activeFilter === "attention"
      ? "현재 특별히 챙겨야 할 학생이 없어요 🌿"
      : activeFilter === "birthday"
        ? "이번 달에는 등록된 생일이 없어요."
        : activeFilter === "unassigned"
          ? "모든 학생이 수업 그룹에 배정되어 있어요."
          : q
            ? "검색한 학생을 찾지 못했어요."
            : "";

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[860px]">
          <PageHeader title="학생" description="학생 한 명 한 명의 최근 모습을 확인해요." />

          {params.saved ? (
            <div className="mb-4 rounded-2xl border border-[#d8ebe0] bg-[#f0faf5] px-4 py-3 text-sm text-[#2f6d54]">
              학생 정보를 수정했어요.
            </div>
          ) : null}
          {params.deleted ? (
            <div className="mb-4 rounded-2xl border border-[#e9d8d3] bg-[#faf3f0] px-4 py-3 text-sm text-[#7f5d57]">
              학생을 삭제했어요.
            </div>
          ) : null}

          <Card className="mb-3">
            <CardContent className="py-4">
              <form action="/students" className="flex items-center gap-3">
                {activeFilter ? <input type="hidden" name="filter" value={activeFilter} /> : null}
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f6f0fb] text-[#5e4eb5]">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  defaultValue={params.q ?? ""}
                  name="q"
                  className="flex-1 border-none bg-transparent text-sm text-[#433d3d] outline-none placeholder:text-[#9b8e8a]"
                  placeholder="학생 이름 · 학년 · 반 이름으로 검색"
                />
                <Button type="submit" variant="secondary" size="sm">
                  검색
                </Button>
                {q ? (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={activeFilter ? `/students?filter=${activeFilter}` : "/students"}>
                      전체 보기
                    </Link>
                  </Button>
                ) : null}
              </form>
            </CardContent>
          </Card>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {FILTERS.map((filter) => {
              const count =
                filter.key === ""
                  ? counts.all
                  : filter.key === "attention"
                    ? counts.attention
                    : filter.key === "birthday"
                      ? counts.birthday
                      : counts.unassigned;

              const isActive = activeFilter === filter.key;

              return (
                <Link
                  key={filter.key}
                  href={filterHref(filter.key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    isActive
                      ? "border-[#e3c9d6] bg-[#fbeff4] text-[#a05a7c]"
                      : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                  )}
                >
                  {filter.label}
                  <span className="tabular-nums opacity-70">{count}</span>
                </Link>
              );
            })}
          </div>

          {activeStudents.length === 0 && !q ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-[#655d5d]">
                아직 등록된 학생이 없어요 🌱
                <br />첫 학생을 등록하고 수업 기록을 시작해볼까요?
                <StudentCreateDialog groups={groupOptions} label="첫 학생 등록하기" />
              </CardContent>
            </Card>
          ) : visibleStudents.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-[#655d5d]">{emptyMessage}</CardContent>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {visibleStudents.map((student) => {
                const status = statusOf(student);
                const studentGroups = groupsByStudent.get(student.id) ?? [];

                return (
                  <Link key={student.id} href={`/students/${student.id}`} className="block">
                    <Card className="p-4 transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(150,100,130,0.1)]">
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className={cn(
                            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-[#4a3c52]",
                            avatarTone(student.id),
                          )}
                        >
                          {student.name.trim().charAt(0)}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-[#2d2928]">{student.name}</span>
                            <span className="text-xs text-[#8a7b77]">
                              {[
                                formatGrade(student.grade),
                                student.gender ? genderShortLabels[student.gender] : "",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            {student.birth_date ? (
                              <span className="flex items-center gap-0.5 text-xs tabular-nums text-[#b08fa0]">
                                <Cake className="h-3 w-3" aria-hidden />
                                {formatShortMonthDay(student.birth_date)}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {studentGroups.length > 0 ? (
                              studentGroups.map((name) => (
                                <span
                                  key={name}
                                  className="rounded-full bg-[#f2edf9] px-2 py-0.5 text-[11px] text-[#5f54b8]"
                                >
                                  {name}
                                </span>
                              ))
                            ) : (
                              <span className="rounded-full bg-[#f3ece3] px-2 py-0.5 text-[11px] text-[#8a7460]">
                                미배정
                              </span>
                            )}
                            <span className="text-[11px] text-[#a89a95]">
                              {status.latestDate
                                ? `최근 수업 · ${formatKoreanDate(status.latestDate)}`
                                : "최근 30일 수업 기록 없음"}
                            </span>
                          </div>

                          {status.latestComment ? (
                            <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-[#564d4d]">
                              “{status.latestComment}”
                            </p>
                          ) : null}

                          {status.badges.length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {status.badges.map((badge) => (
                                <span
                                  key={badge.label}
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                                    badge.className,
                                  )}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[#c4b3ae]" aria-hidden />
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}

          {archivedStudents.length > 0 && !q && !activeFilter ? (
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

          <div className="mt-6 flex justify-end pb-8">
            <StudentCreateDialog groups={groupOptions} />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
