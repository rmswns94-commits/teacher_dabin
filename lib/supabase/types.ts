export type StudentGrade =
  | "elementary_1"
  | "elementary_2"
  | "elementary_3"
  | "elementary_4"
  | "elementary_5"
  | "elementary_6"
  | "middle_1"
  | "middle_2"
  | "middle_3"
  | "high_1";

export type StudentRecord = {
  id: string;
  user_id: string;
  name: string;
  grade: StudentGrade;
  school: string | null;
  memo: string | null;
  gender: "male" | "female" | null;
  birth_date: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type PreparationItem = {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string | null; // 완료 시각(UTC ISO) — 완료 당일(KST) 표시/다음날 숨김 판정용
  // 날짜 있는 항목(다음 수업 계획/숙제 연동)용 optional 필드 — 기존 수동 항목은 필드 없음.
  // source가 daily_log_*인 항목은 해당 일지 저장 시에만 생성/갱신/제거된다.
  dueDate?: string | null; // "YYYY-MM-DD"
  source?: "daily_log_next_plan" | "daily_log_homework" | "daily_log_task";
  sourceDailyLogId?: string;
  // 연결 교재 이름 스냅샷 — text에는 내용만 저장하고 표시할 때 "교재명 - 내용"으로 합성
  textbook?: string | null;
  // 시험 기간 ON 당시 학교 context (textbook과 배타적) — 표시는 "학교명 - 내용"
  school?: string | null;
  // linked 항목을 Teacher가 삭제하면 tombstone(dismissed)으로 남긴다 — 화면에는 안 보이지만
  // 일지 단순 재저장으로 부활하지 않게 억제하고, 계획 내용/날짜가 실제 바뀌면 되살린다.
  dismissed?: boolean;
};

// 시험 대비용 교재 한 권 — id는 등록 시 발급하는 안정 식별자(이름 변경/삭제 기준).
// 일반 교재(class_groups.textbook)와 저장 위치가 분리돼 서로 영향을 주지 않는다.
export type ExamTextbook = { id: string; name: string };

export type ClassGroupRecord = {
  id: string;
  user_id: string;
  name: string;
  grade: StudentGrade;
  memo: string | null;
  icon: string | null; // 대표 아이콘 (emoji preset, null이면 기본 아이콘 fallback)
  textbook: string | null;
  school: string | null; // 그룹 학교 이름 (선택 — 시험 기간 ON일 때 숙제/계획/할 일 context)
  is_exam_period: boolean; // 시험 기간 ON/OFF (Teacher가 직접 해제할 때까지 유지, 기본 OFF)
  // 시험 대비용 교재 (일반 textbook과 별개 — OFF로 돌려도 지우지 않는다).
  // 시험 기간 ON이면 수업일지 Excel의 교재 셀이 이 목록을 쓴다 (0개면 "시험 대비" fallback).
  exam_textbooks: ExamTextbook[] | null;
  highlight_memo: string | null;
  preparation_items: PreparationItem[];
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type StudentGroupMembershipRecord = {
  id: string;
  user_id: string;
  student_id: string;
  group_id: string;
  created_at: string;
};

// day_of_week follows JS Date.getDay(): 0 = Sunday ... 6 = Saturday.
export type ClassGroupScheduleRecord = {
  id: string;
  user_id: string;
  group_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
};

export type CalendarEventRecord = {
  id: string;
  user_id: string;
  title: string;
  event_type: string;
  start_date: string;
  end_date: string;
  group_id: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type PrettyWordRecord = {
  id: string;
  user_id: string;
  content: string;
  author: string | null;
  category: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

export type AttendanceStatus = "present" | "late" | "absent" | "early_leave";
export type DailyLogStatus = "draft" | "completed";
export type MakeupStatus = "required" | "scheduled" | "completed" | "cancelled";
export type HomeworkStatus = "completed" | "partial" | "missing";
export type FocusLevel = "good" | "normal" | "distracted";
export type ParticipationLevel = "active" | "normal" | "passive";
export type QuestionLevel = "high" | "normal" | "low";
export type KindnessLevel = "good" | "normal" | "poor";
export type EffortLevel = "high" | "normal" | "low";
export type ParentNoteStatus = "pending" | "completed";
export type PraiseCategory =
  | "homework"
  | "focus"
  | "participation"
  | "vocabulary"
  | "kindness"
  | "other";

export type DailyLogRecord = {
  id: string;
  user_id: string;
  group_id: string;
  class_date: string;
  title: string | null;
  lesson_content: string | null;
  default_progress: string | null;
  memo: string | null;
  homework: string | null;
  homework_due_date: string | null; // 숙제 표시 날짜 (선택 — 있으면 그 날 To Do로 노출)
  next_lesson_plan: string | null;
  next_plan_date: string | null; // 다음 수업 계획의 계획 날짜 (To Do 연동 기준)
  task_content: string | null; // 해야 할 일 (완료 시 공용 Todo source='daily_log_task'로 연결)
  task_due_date: string | null; // 해야 할 일 날짜 "YYYY-MM-DD"
  task_textbook: string | null; // 해야 할 일에 연결한 교재 이름 스냅샷 (표시: "교재명 - 내용")
  // 해야 할 일 다중 항목 — stable id 기반. null이면 legacy 단일 task_* 컬럼이 source.
  // school: 시험 기간 ON 당시 작성한 항목의 학교 context (textbook과 배타적 — 저장 필드가 identity)
  tasks: { id: string; textbook?: string | null; school?: string | null; content: string; dueDate?: string | null }[] | null;
  // 교재별 진도/다음 수업 계획 — [{ name, text }] 스냅샷. default_progress/next_lesson_plan은
  // 이 구조에서 파생된 "교재명 - 내용" mirror(+기타 메모)로 기록된다 (legacy 소비처 호환).
  textbook_progress: { name: string; text: string }[] | null;
  textbook_plans: { name: string; text: string }[] | null;
  // 학교 context 진도/다음 수업 계획 (시험 기간 ON 당시 작성 — name=학교명 스냅샷)
  school_progress: { name: string; text: string }[] | null;
  school_plans: { name: string; text: string }[] | null;
  reflection_good: string | null; // 수업 회고: 잘된 점 (강사 전용 — 학생/성장노트 노출 금지)
  reflection_hard: string | null; // 수업 회고: 아쉬웠던 점
  reflection_next: string | null; // 수업 회고: 다음에 다르게 해볼 것 (다음 일지 작성 화면에 리마인드)
  vocab_total: number | null;
  status: DailyLogStatus;
  created_at: string;
  updated_at: string;
};

// 오늘 숙제(구조화): 한 수업에서 내준 숙제 여러 개 — 각각 독립적인 완료일.
// Teacher Todo/calendar와 무관한 학생 대상 assignment 기록 (자동 Todo/이벤트 생성 없음).
export type DailyLogHomeworkAssignmentRecord = {
  id: string;
  user_id: string;
  daily_log_id: string;
  content: string; // 여러 줄 가능 (내부 \n 보존)
  due_date: string; // "YYYY-MM-DD" (KST date-only)
  textbook: string | null; // 연결 교재 이름 스냅샷 (없으면 null — content만 표시)
  school: string | null; // 시험 기간 ON 당시 학교 context 이름 스냅샷 (textbook과 배타적)
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type StudentLessonLogRecord = {
  id: string;
  user_id: string;
  daily_log_id: string;
  student_id: string;
  attendance: AttendanceStatus;
  progress: string | null;
  strengths: string | null;
  improvements: string | null;
  memo: string | null;
  homework_status: HomeworkStatus | null;
  vocab_correct: number | null;
  vocab_retest: boolean;
  focus_level: FocusLevel | null;
  participation_level: ParticipationLevel | null;
  question_level: QuestionLevel | null;
  kindness_level: KindnessLevel | null;
  effort_level: EffortLevel | null;
  parent_note: string | null;
  parent_note_status: ParentNoteStatus | null;
  parent_note_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GrowthAchievementType =
  | "question_master"
  | "attendance_master"
  | "vocabulary_master"
  | "effort_master"
  | "consistency_master"
  | "presentation_master"
  | "kindness_master"
  | "focus_master"
  | "makeup_master";

export type StudentGrowthCheckRecord = {
  id: string;
  user_id: string;
  student_id: string;
  daily_log_id: string;
  achievement_type: GrowthAchievementType;
  created_at: string;
};

// manual_daily_log: 일지의 [칭찬 한표]로 Teacher가 직접 남긴 코멘트 칭찬.
// comment가 null인 row는 예전 category chip 방식의 legacy 데이터 (보존).
export type PraiseSource = "manual_daily_log";

export type StudentPraiseRecord = {
  id: string;
  user_id: string;
  student_id: string;
  daily_log_id: string | null;
  category: PraiseCategory;
  comment: string | null;
  source: PraiseSource;
  created_at: string;
};

export type WeaknessCategory =
  | "grammar"
  | "vocabulary"
  | "reading"
  | "listening"
  | "writing"
  | "pronunciation"
  | "homework"
  | "other";

export type WeaknessStatus = "active" | "resolved";

// Teacher가 명시적으로 등록한 학생 약점 노트. 관찰값으로 자동 생성하지 않으며,
// 같은 제목이 반복 등록돼도 병합하지 않는다 (record 단위 독립).
export type StudentWeaknessRecord = {
  id: string;
  user_id: string;
  student_id: string;
  group_id: string | null;
  source_daily_log_id: string | null;
  category: WeaknessCategory;
  title: string;
  note: string | null;
  review_due_date: string | null; // "YYYY-MM-DD" — 지나도 자동 변경 없음 (복습 큐에 계속 남음)
  status: WeaknessStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

// 단어시험 오답 occurrence. 점수는 daily_logs.vocab_total + student_lesson_logs.vocab_correct에
// 있고, 이 record는 해당 시험(일지)에서 틀린 단어 하나를 뜻한다.
// 같은 일지 안에서는 저장 시 정규화 기준으로 dedupe되고, 다른 날짜의 같은 단어는 별도 row.
export type VocabMistakeRecord = {
  id: string;
  user_id: string;
  student_id: string;
  daily_log_id: string;
  word: string;
  note: string | null;
  created_at: string;
};

export type SchoolExamType = "midterm" | "final" | "other";
export type SchoolExamPrepStatus = "not_started" | "preparing" | "ready";

// 학교별 시험 metadata. 시험 날짜의 single source는 calendar_events(calendar_event_id) —
// 이 record는 학교/학년/학기/범위/준비 상태만 갖는다. school_name은 등록 당시 snapshot.
export type SchoolExamDetailRecord = {
  id: string;
  user_id: string;
  calendar_event_id: string;
  school_name: string;
  grade: StudentGrade;
  exam_year: number;
  semester: 1 | 2;
  exam_type: SchoolExamType;
  scope_text: string | null; // Phase 7 free-text 범위 (Phase 8 structured scope와 공존 예정)
  memo: string | null;
  prep_status: SchoolExamPrepStatus;
  created_at: string;
  updated_at: string;
};

export type SchoolExamStudentRecord = {
  id: string;
  user_id: string;
  school_exam_id: string;
  student_id: string;
  created_at: string;
};

// 시험 대비 플래너의 날짜별 계획 (school_exam_details 종속, Teacher 직접 등록만)
export type ExamPrepPlanRecord = {
  id: string;
  user_id: string;
  school_exam_id: string;
  plan_date: string; // "YYYY-MM-DD"
  unit_label: string | null; // 단원 구분 (예: "5과")
  title: string;
  memo: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
};

// source: 결석 연동('absence') vs 보충 탭 직접 등록('manual').
// manual은 결석 일지와 연결이 없고(student_lesson_log_id null),
// original_class_date는 NOT NULL 제약 유지를 위해 보충 날짜로 채워진다 (표시는 source 기준).
export type MakeupSource = "absence" | "manual";

export type MakeupLessonRecord = {
  id: string;
  user_id: string;
  student_id: string;
  student_lesson_log_id: string | null;
  // 직접 등록 보충의 수업 그룹 (결석 연동 legacy row는 null — 일지 경유로 파생)
  group_id: string | null;
  source: MakeupSource;
  original_class_date: string;
  missed_progress: string | null;
  status: MakeupStatus;
  scheduled_date: string | null;
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;
  completed_date: string | null;
  completed_progress: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
};
