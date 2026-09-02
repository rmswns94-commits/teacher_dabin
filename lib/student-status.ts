import type { RecentLessonRecord } from "@/lib/supabase/queries/student-history";

// 학생 목록의 "관리 필요" 판정과 상태 배지 계산 (순수 유틸).
// 기준: 최근 30일 기록에서
//   - 결석 1회 이상            → 관리 필요
//   - 지각 2회 이상            → 관리 필요
//   - 미해결 보충(필요/예정)   → 관리 필요
//   - 숙제 미제출(연속 포함)   → 관리 필요
//   - 최근 단어시험 재시험 필요 → 관리 필요
//   - 학부모 전달 pending      → 관리 필요

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

    // 연속 숙제 미제출: 숙제 체크가 있는 기록만 최신순으로 보고,
    // 가장 최근 체크가 missing일 때부터 연속 개수를 센다 (과거 누적 아님).
    const homeworkRows = rows.filter((row) => row.homework_status !== null);
    let consecutiveMissing = 0;
    for (const row of homeworkRows) {
      if (row.homework_status !== "missing") break;
      consecutiveMissing += 1;
    }

    // 재시험 필요: 단어시험 관련 기록(점수 또는 재시험 체크) 중 가장 최근 것이
    // 재시험 체크 상태일 때. 이후 시험을 다시 봤으면 자동으로 해제된 것으로 본다.
    const latestVocabRow = rows.find((row) => row.vocab_correct !== null || row.vocab_retest);
    const retest = Boolean(latestVocabRow?.vocab_retest);

    const parentPending = rows.some((row) => row.parent_note_status === "pending");

    const badges: StudentStatusBadge[] = [];
    if (needsMakeup) {
      badges.push({ label: "보충 필요", className: tone.lavender });
    }
    if (parentPending) {
      badges.push({ label: "학부모 전달 필요", className: tone.rose });
    }
    if (consecutiveMissing >= 2) {
      badges.push({ label: `숙제 ${consecutiveMissing}회 연속 미제출`, className: tone.peach });
    } else if (consecutiveMissing === 1) {
      badges.push({ label: "숙제 미제출", className: tone.peach });
    }
    if (retest) {
      badges.push({ label: "단어 재시험 필요", className: tone.lavender });
    }
    if (absentCount > 0) {
      badges.push({ label: `결석 ${absentCount}회`, className: tone.rose });
    }
    if (lateCount > 0) {
      badges.push({ label: `지각 ${lateCount}회`, className: tone.peach });
    }

    const attention =
      absentCount >= 1 ||
      lateCount >= 2 ||
      needsMakeup ||
      consecutiveMissing >= 1 ||
      retest ||
      parentPending;

    if (!attention && badges.length === 0 && rows.length > 0) {
      badges.push({ label: "최근 기록 안정적", className: tone.mint });
    }

    // 배지는 중요한 것 3개까지만, 나머지는 +N
    const hiddenCount = badges.length > 3 ? badges.length - 3 : 0;
    const cappedBadges = badges.slice(0, 3);
    if (hiddenCount > 0) {
      cappedBadges.push({ label: `+${hiddenCount}`, className: "bg-[#f0f0f3] text-[#6b6b74]" });
    }

    const latest = rows[0] ?? null;
    const latestWithComment = rows.find(
      (row) => row.memo?.trim() || row.strengths?.trim() || row.improvements?.trim(),
    );

    statuses.set(studentId, {
      attention,
      badges: cappedBadges,
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
