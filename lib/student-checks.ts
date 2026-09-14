// 편의성 PHASE 5 — 수업 직전 학생 체크의 순수 파생 helper.
// READ-ONLY derived briefing: DB에 alert/flag를 저장하지 않고, 페이지 load마다
// canonical data(개인 숙제/직전 finalized 출결·온라인 복습/오늘 보충)에서 계산한다.
// 모든 학생 명단이 아니라 "오늘 수업 전에 한 번 더 확인할 예외 학생"만 낸다.
//
// 규약:
// - identity는 student_id (이름 금지 — 동명이인 안전). 한 학생의 여러 signal은 한 row에 묶는다.
// - 숙제 signal은 학생 지정(assigned_student_id) 숙제만 — 공통 숙제를 전원에게 배분하지 않는다.
//   (완료 상태가 assignment 단위라 학생별 미완료가 아니다.) due<=오늘 + 미완료만, undated 제외.
// - 출결/온라인 복습 source는 브리핑과 "같은" 직전 eligible finalized 일지의 rows —
//   class-end lock을 그대로 물려받는다 (별도 previous resolver를 만들지 않는다).
//   absent/late/early_leave만 signal, present/null(미평가)은 아님.
//   online_review_completed는 false만 미완료 (null=미선택은 signal 아님).
// - 오늘 보충은 exact group relation(groupId)이 이 브리핑 그룹과 일치할 때만 —
//   student.groups[0] 같은 추측 금지. relation 없는 manual 보충은 어느 그룹에도 안 붙는다.
//   (source 쿼리가 scheduled만 주므로 completed/cancelled는 이미 제외.)

export type StudentCheckSignal = {
  type:
    | "homework_overdue"
    | "previous_absent"
    | "previous_late"
    | "previous_early_leave"
    | "online_review_missing"
    | "makeup_today";
  label: string;
};

export type StudentCheckRow = {
  studentId: string;
  name: string;
  signals: StudentCheckSignal[];
};

const ATTENDANCE_SIGNALS: Record<string, { type: StudentCheckSignal["type"]; label: string }> = {
  absent: { type: "previous_absent", label: "지난 수업 결석" },
  late: { type: "previous_late", label: "지난 수업 지각" },
  early_leave: { type: "previous_early_leave", label: "지난 수업 조퇴" },
};

export function buildStudentCheckSignals(input: {
  // 현재 브리핑 그룹의 멤버 (이 목록에 없는 학생은 signal이 있어도 표시하지 않는다 —
  // 오늘 수업 전 체크이므로 현재 membership 기준. 순서는 이 목록 순서를 그대로 따른다.)
  members: readonly { id: string; name: string }[];
  // 멤버에게 배정된 미완료 + due<=오늘 개인 숙제 (batch 조회 결과)
  overdueStudentHomework: readonly { assigned_student_id: string | null }[];
  // 직전 eligible finalized 일지의 학생 rows (없으면 [] — 새 학생/기록 없음은 signal 아님)
  previousRows: readonly {
    student_id: string;
    attendance: string | null;
    online_review_completed?: boolean | null;
  }[];
  // 오늘 scheduled 보충 (exact relation만 매칭)
  todayMakeups: readonly {
    studentId: string | null;
    groupId: string | null;
    startTime: string | null;
  }[];
  briefingGroupId: string;
}): StudentCheckRow[] {
  const overdueIds = new Set(
    input.overdueStudentHomework
      .map((item) => item.assigned_student_id)
      .filter((id): id is string => Boolean(id)),
  );
  const previousByStudent = new Map(input.previousRows.map((row) => [row.student_id, row]));
  const makeupByStudent = new Map<string, { startTime: string | null }>();
  for (const makeup of input.todayMakeups) {
    if (makeup.studentId && makeup.groupId && makeup.groupId === input.briefingGroupId) {
      if (!makeupByStudent.has(makeup.studentId)) {
        makeupByStudent.set(makeup.studentId, { startTime: makeup.startTime });
      }
    }
  }

  const rows: StudentCheckRow[] = [];
  for (const member of input.members) {
    const signals: StudentCheckSignal[] = [];

    // 1) 개인 숙제 미완료 (오늘 마감 + 밀린 것)
    if (overdueIds.has(member.id)) {
      signals.push({ type: "homework_overdue", label: "개인 숙제 미완료" });
    }

    // 2) 지난 수업 출결 예외
    const previous = previousByStudent.get(member.id);
    const attendanceSignal = previous?.attendance
      ? ATTENDANCE_SIGNALS[previous.attendance]
      : undefined;
    if (attendanceSignal) {
      signals.push({ type: attendanceSignal.type, label: attendanceSignal.label });
    }

    // 3) 지난 수업 온라인 복습 미완료 — 명시적 false만 (null != false)
    if (previous?.online_review_completed === false) {
      signals.push({ type: "online_review_missing", label: "지난 수업 온라인 복습 미완료" });
    }

    // 4) 오늘 보충 예정
    const makeup = makeupByStudent.get(member.id);
    if (makeup) {
      signals.push({
        type: "makeup_today",
        label: makeup.startTime ? `오늘 ${makeup.startTime} 보충 예정` : "오늘 보충 예정",
      });
    }

    if (signals.length > 0) {
      rows.push({ studentId: member.id, name: member.name, signals });
    }
  }
  return rows;
}
