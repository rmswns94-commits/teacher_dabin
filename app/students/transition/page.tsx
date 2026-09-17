import { AppShell } from "@/components/app-shell";
import { AcademicTransitionWizard } from "@/components/academic-transition-wizard";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getCurrentUserMemberships, getCurrentUserStudents } from "@/lib/supabase/queries/students";

// 학기·학년 전환 — 여러 학생의 "현재 학년 + 현재 소속"을 한 화면에서 검토하고 한 번에 적용한다.
// - 대상: 재원 학생만 (휴원/퇴원은 자동 승급하지 않는다 — PHASE 1 lifecycle의 명시적 액션 전용).
// - 데이터: 학생/그룹/멤버십 batch 3쿼리 (학생별 개별 조회 없음 — N+1 없음).
// - 이 화면은 읽기만 한다. 실제 변경은 마법사 마지막 [적용]의 단일 RPC 트랜잭션뿐이다.
export default async function AcademicTransitionPage() {
  const [students, groups, memberships] = await Promise.all([
    getCurrentUserStudents(), // archived=false = 재원
    getCurrentUserGroups(), // 보관된 그룹 제외
    getCurrentUserMemberships(),
  ]);

  const groupIdsByStudent = new Map<string, string[]>();
  const groupExists = new Set(groups.map((group) => group.id));
  for (const membership of memberships) {
    if (!groupExists.has(membership.group_id)) {
      continue; // 보관된 그룹 소속은 전환 후보로 보여주지 않는다 (데이터는 그대로)
    }
    groupIdsByStudent.set(membership.student_id, [
      ...(groupIdsByStudent.get(membership.student_id) ?? []),
      membership.group_id,
    ]);
  }

  // 학생 순서는 학생 관리 기본 정렬(이름순)과 동일하게 유지
  const wizardStudents = [...students]
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .map((student) => ({
      studentId: student.id,
      name: student.name,
      school: student.school,
      grade: student.grade,
      groupIds: groupIdsByStudent.get(student.id) ?? [],
    }));

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[860px] pb-10">
          <PageHeader
            backHref="/students"
            title="학기·학년 전환"
            description="새 학기에 맞춰 여러 학생의 학년과 수업 그룹을 한 번에 정리해요."
          />

          {groups.length === 0 ? (
            <Card className="mb-4">
              <CardContent className="body-text p-5 text-[#655d5d]">
                새 학년 수업 그룹이 아직 없어요. 수업 그룹을 먼저 만들면 반 이동까지 함께 정리할
                수 있어요.
              </CardContent>
            </Card>
          ) : null}

          <AcademicTransitionWizard
            students={wizardStudents}
            groups={groups.map((group) => ({
              id: group.id,
              name: group.name,
              grade: group.grade,
            }))}
          />
        </div>
      </main>
    </AppShell>
  );
}
