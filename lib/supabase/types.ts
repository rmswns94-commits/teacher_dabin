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
  parent_note: string | null;
  parent_note_status: ParentNoteStatus | null;
  parent_note_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentPraiseRecord = {
  id: string;
  user_id: string;
  student_id: string;
  daily_log_id: string | null;
  category: PraiseCategory;
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
