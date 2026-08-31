import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getCurrentUserStudents } from "@/lib/supabase/queries/students";
import { createStudentAction } from "./actions";

const gradeOptions = [
  { value: "middle_1", label: "중1" },
  { value: "middle_2", label: "중2" },
  { value: "middle_3", label: "중3" },
  { value: "high_1", label: "고1" },
];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim();
  const [students, groups] = await Promise.all([
    getCurrentUserStudents(),
    getCurrentUserGroups(),
  ]);
  const visibleStudents = students.filter((student) =>
    !q || student.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title="학생 관리"
          description="학생 정보와 수업 그룹을 관리해요."
          action={
            <Button className="gap-2" asChild>
              <a href="#new-student">
                <Plus className="h-4 w-4" />
                학생 추가
              </a>
            </Button>
          }
        />

        <Card className="mb-5" id="new-student">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f6f0fb] text-[#5e4eb5]">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold text-[#2d2424]">학생 등록</div>
                <div className="text-xs text-[#7b6d6b]">이름, 학년, 학교, 그룹을 함께 추가하세요.</div>
              </div>
            </div>

            <form action={createStudentAction} className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-1">
                <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">학생 이름</span>
                <input
                  name="name"
                  className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none placeholder:text-[#a79996]"
                  placeholder="김다빈"
                  required
                />
              </label>

              <label className="block md:col-span-1">
                <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">학년</span>
                <select
                  name="grade"
                  className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                  defaultValue="middle_2"
                  required
                >
                  {gradeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block md:col-span-1">
                <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">학교</span>
                <input
                  name="school"
                  className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none placeholder:text-[#a79996]"
                  placeholder="테스트중학교"
                />
              </label>

              <label className="block md:col-span-1">
                <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">수업 그룹</span>
                <select name="groupId" className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none">
                  <option value="">그룹 선택</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">메모</span>
                <textarea
                  name="memo"
                  rows={3}
                  className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none placeholder:text-[#a79996]"
                  placeholder="단어 암기 점검 필요"
                />
              </label>

              <div className="md:col-span-2">
                <Button type="submit" className="gap-2">
                  <Plus className="h-4 w-4" />
                  학생 등록
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="mb-5">
          <CardContent className="py-4">
            <form action="/students" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f6f0fb] text-[#5e4eb5]">
                <Search className="h-4 w-4" />
              </div>
              <input
                defaultValue={q}
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

        {visibleStudents.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-[#655d5d]">
              {q ? "검색 결과가 없어요." : "아직 등록된 학생이 없어요. 첫 학생을 등록해보세요."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleStudents.map((student) => (
              <Link key={student.id} href={`/students/${student.id}`}>
                <Card className="p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(120,109,164,0.12)]">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-[#2b2323]">{student.name}</h3>
                        <span className="rounded-full bg-[#edf9f3] px-2 py-1 text-[10px] font-medium text-[#3d7f64]">
                          {student.archived ? "보관" : "활성"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[#665b5a]">
                        <span>{student.grade === "middle_1" ? "중1" : student.grade === "middle_2" ? "중2" : student.grade === "middle_3" ? "중3" : "고1"}</span>
                        <span>•</span>
                        <span>{student.school || "학교 미입력"}</span>
                      </div>
                    </div>

                    <div className="grid gap-2 text-sm text-[#5a4f4d] md:min-w-[260px] md:grid-cols-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-[#8a7b7a]">최근 등록</div>
                        <div className="mt-1 font-medium">{new Date(student.created_at).toLocaleDateString("ko-KR")}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-[#8a7b7a]">메모</div>
                        <div className="mt-1 font-medium">{student.memo || "메모 없음"}</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
