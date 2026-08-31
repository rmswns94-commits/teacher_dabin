import type { RecentLessonRecord } from "@/lib/supabase/queries/student-history";

// 학생 목록의 "관리 필요" 판정과 상태 배지 계산 (순수 유틸).
// 기준: 최근 30일 기록에서
//   - 결석 1회 이상          → 관리 필요
//   - 지각 2회 이상          → 관리 필요
//   - 미해결 보충(필요/예정) → 관리 필요
// 숙제는 학생별 완료 데이터가 없으므로 판정에 사용하지 않는다.

export type StudentStatusBadge = { label: string; className: string };

export type StudentStatus = {
  attention: boolean;
  badges: StudentStatusBadge[];
  latestDate: string | null;
  latestComment: string | null;
  recordCount: number;
};

const tone = {
  rose: "bg-[#f9e7e5] text-[#a25a54]",
  peach: "bg-[#fdeee3] text-[#a2643c]",
  lavender: "bg-[#efe8fb] text-[#5d4ba5]",
  mint: "bg-[#e4f4ec] text-[#3d7f64]",
};

export function computeStudentStatuses(
  records: RecentLessonRecord[],
  openMakeupStudentIds: Set<string>,
) {
  const byStudent = new Map<string, RecentLessonRecord[]>();

  for (const record of records) {
    byStudent.set(record.student_id, [...(byStudent.get(record.student_id) ?? []), record]);
  }

  const statuses = new Map<string, StudentStatus>();
  const studentIds = new Set([...byStudent.keys(), ...openMakeupStudentIds]);

  for (const studentId of studentIds) {
    const rows = (byStudent.get(studentId) ?? []).sort((a, b) =>
      b.class_date.localeCompare(a.class_date),
    );

    const absentCount = rows.filter((row) => row.attendance === "absent").length;
    const lateCount = rows.filter((row) => row.attendance === "late").length;
    const needsMakeup = openMakeupStudentIds.has(studentId);

    const badges: StudentStatusBadge[] = [];
    if (absentCount > 0) {
      badges.push({ label: `결석 ${absentCount}회`, className: tone.rose });
    }
    if (lateCount > 0) {
      badges.push({ label: `지각 ${lateCount}회`, className: tone.peach });
    }
    if (needsMakeup) {
      badges.push({ label: "보충 필요", className: tone.lavender });
    }

    const attention = absentCount >= 1 || lateCount >= 2 || needsMakeup;

    if (!attention && badges.length === 0 && rows.length > 0) {
      badges.push({ label: "출석 안정적", className: tone.mint });
    }

    const latest = rows[0] ?? null;
    const latestWithComment = rows.find(
      (row) => row.memo?.trim() || row.strengths?.trim() || row.improvements?.trim(),
    );

    statuses.set(studentId, {
      attention,
      badges: badges.slice(0, 3),
      latestDate: latest?.class_date ?? null,
      latestComment:
        latestWithComment?.memo?.trim() ||
        latestWithComment?.strengths?.trim() ||
        latestWithComment?.improvements?.trim() ||
        null,
      recordCount: rows.length,
    });
  }

  return statuses;
}

export const emptyStudentStatus: StudentStatus = {
  attention: false,
  badges: [],
  latestDate: null,
  latestComment: null,
  recordCount: 0,
};
