// 동일 숙제를 여러 학생에게 배정 — 선택 학생 수만큼 "독립적인 학생 지정 숙제 항목"을
// 만들어 주는 순수 helper. Common(공통) 숙제로 변환하지 않는다: 항목마다
// assignedStudentId가 각각 다르고, key/id도 항목마다 새로 발급된다(공유 금지).
// content/dueDate/textbook/school은 동일하게 시작하고, 생성 후에는 기존 숙제 항목과
// 똑같이 개별 수정된다. completion 관련 필드는 폼 항목에 존재하지 않는다 —
// 저장 시 기존 sync 경로가 새 row로 취급한다 (기존 항목 clone/metadata 복사 없음).

export type MultiAssignHomeworkItem = {
  key: string;
  id: string;
  content: string;
  dueDate: string;
  textbook: string;
  school: string;
  assignedStudentId: string;
  section?: "exam" | "regular";
};

export function buildStudentHomeworkItems(input: {
  // 이미 canonical 순서(현재 후보 목록 순)로 정렬된 학생 id 목록
  studentIds: readonly string[];
  content: string;
  dueDate: string;
  textbook: string;
  school: string;
  section?: "exam" | "regular";
  // 테스트 주입용 — 실제 호출은 기존 항목과 동일하게 crypto.randomUUID
  createId?: () => string;
}): MultiAssignHomeworkItem[] {
  const createId = input.createId ?? (() => globalThis.crypto.randomUUID());
  return input.studentIds.map((studentId) => ({
    key: createId(),
    id: createId(),
    content: input.content,
    dueDate: input.dueDate,
    textbook: input.textbook,
    school: input.school,
    assignedStudentId: studentId,
    ...(input.section ? { section: input.section } : {}),
  }));
}
