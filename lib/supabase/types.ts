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
};

export type ClassGroupRecord = {
  id: string;
  user_id: string;
  name: string;
  grade: StudentGrade;
  memo: string | null;
  icon: string | null; // 대표 아이콘 (emoji preset, null이면 기본 아이콘 fallback)
  textbook: string | null;
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

export type AttendanceStatus = "present" | "late" | "absent";
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
  next_lesson_plan: string | null;
  vocab_total: number | null;
  status: DailyLogStatus;
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

export type MakeupLessonRecord = {
  id: string;
  user_id: string;
  student_id: string;
  student_lesson_log_id: string | null;
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
