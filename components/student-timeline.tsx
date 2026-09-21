import Link from "next/link";
import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  MessageCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { praiseCategoryLabels } from "@/lib/elementary";
import { groupIconOf } from "@/lib/group-icons";
import { getKoreanHolidaysInRange } from "@/lib/korean-holidays";
import { mergeLegacyLessonContent } from "@/lib/progress";
import { formatTimeRange, groupClassTimeLabelOn } from "@/lib/schedule";
import { buildScheduleExceptionIndex } from "@/lib/schedule-exceptions";
import {
  TIMELINE_PAGE_SIZE,
  filterTimelineItems,
  groupTimelineByDate,
  kstDateAndTime,
  sortTimelineItems,
  timelineRangeStart,
  type LessonTimelineItem,
  type StudentTimelineItem,
  type TimelineCategory,
  type TimelineHomework,
  type TimelineRange,
} from "@/lib/student-timeline";
import { getAcademyClosuresInRange } from "@/lib/supabase/queries/academy-closures";
import { getScheduleExceptionsInRange } from "@/lib/supabase/queries/schedule-exceptions";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import {
  getStudentTimelineExams,
  getStudentTimelineHomework,
  getStudentTimelineLessons,
  getStudentTimelineMakeups,
  getStudentTimelinePraises,
} from "@/lib/supabase/queries/student-timeline";
import { getStudentConsultations } from "@/lib/supabase/queries/consultations";
import { getSupplementsInRange } from "@/lib/supabase/queries/supplements";
import { linkedContextLabel } from "@/lib/textbooks";
import { AttendanceBadge, MakeupStatusBadge } from "@/components/status-badge";
import {
  consultationMethodLabels,
  consultationTargetLabels,
} from "@/lib/validation/consultation";
import { examTypeLabels, semesterLabels } from "@/lib/validation/school-exam";
import { cn } from "@/lib/utils";

// 학생 통합 타임라인 (읽기 전용).
// - 기존 기록을 학생 기준으로 합쳐 날짜순으로 보여줄 뿐, 어떤 row도 만들지 않는다.
// - 출결/평가/온라인 복습은 그날 수업 카드 안에 담는다 (같은 기록을 두 카드로 반복하지 않는다).
// - 조회는 source마다 range batch — 수업마다 출결/평가/숙제를 다시 묻지 않는다.

const TYPE_META = {
  lesson: { icon: BookOpen, label: "수업", tint: "bg-[#f3eefa] text-[#6d5aa8]" },
  homework: { icon: ClipboardList, label: "숙제", tint: "bg-[#fdf3e4] text-[#94702f]" },
  makeup: { icon: RotateCcw, label: "보충 수업", tint: "bg-[#e4f4ec] text-[#3d7f64]" },
  praise: { icon: Sparkles, label: "칭찬", tint: "bg-[#fdeef0] text-[#b05a63]" },
  exam: { icon: GraduationCap, label: "시험", tint: "bg-[#e7eefb] text-[#4a5f96]" },
  consultation: { icon: MessageCircle, label: "상담", tint: "bg-[#eef3ea] text-[#5b7a54]" },
} as const;

function homeworkOf(row: {
  id: string;
  content: string;
  due_date: string;
  textbook: string | null;
  school: string | null;
  assigned_student_id: string | null;
  completed: boolean;
  completed_at: string | null;
}, studentName: string): TimelineHomework {
  return {
    id: row.id,
    content: row.content,
    dueDate: row.due_date,
    contextLabel: linkedContextLabel({ textbook: row.textbook, school: row.school }),
    audienceLabel: row.assigned_student_id ? studentName : "공통",
    completed: row.completed,
    completedDate: row.completed_at ? kstDateAndTime(row.completed_at).date : null,
  };
}

function HomeworkLine({ item }: { item: TimelineHomework }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="rounded-full bg-[#f3eefa] px-1.5 py-0.5 text-xs font-medium text-[#6d5aa8]">
        {item.audienceLabel}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words text-[#33333b]">
        {item.contextLabel ? `${item.contextLabel} - ` : ""}
        {item.content}
      </span>
      <span className="secondary-text tabular-nums text-[#8a7b77]">
        마감 {formatKoreanDate(item.dueDate)}
      </span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-xs font-semibold",
          item.completed ? "bg-[#e4f4ec] text-[#3d7f64]" : "bg-[#f5f1eb] text-[#8a7b77]",
        )}
      >
        {item.completed
          ? item.completedDate
            ? `완료 · ${formatKoreanDate(item.completedDate)}`
            : "완료"
          : "미완료"}
      </span>
    </li>
  );
}

function LessonCard({ item, category }: { item: LessonTimelineItem; category: TimelineCategory }) {
  const showHomework = category === "all" || category === "lesson" || category === "homework";
  const showProgress = category === "all" || category === "lesson";
  const showEvaluation = category === "all" || category === "lesson" || category === "evaluation";

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {item.groupName ? (
          <span className="flex min-w-0 items-center gap-1 font-medium text-[#2b2323]">
            <span aria-hidden>{groupIconOf(item.groupIcon)}</span>
            <span className="min-w-0 truncate">{item.groupName}</span>
          </span>
        ) : null}
        {item.timeLabel ? (
          <span className="secondary-text tabular-nums text-[#655d5d]">{item.timeLabel}</span>
        ) : null}
        <AttendanceBadge status={item.attendance} />
      </div>

      {/* 출결 사유 — 지각/조퇴/결석에 사유가 있을 때만 (없으면 줄 자체를 만들지 않는다) */}
      {item.attendance !== "present" && item.attendanceReason ? (
        <p className="whitespace-pre-wrap break-words text-sm text-[#564d4d]">
          <span className="secondary-text font-semibold text-[#8a7b77]">사유 </span>
          {item.attendanceReason}
        </p>
      ) : null}

      {item.title ? <div className="text-sm text-[#564d4d]">{item.title}</div> : null}

      {showProgress && item.progress ? (
        <div>
          <div className="secondary-text font-semibold text-[#8a7b77]">
            {item.progressIsCommon ? "진도 (반 공통)" : "진도"}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-[#33333b]">{item.progress}</p>
        </div>
      ) : null}

      {showEvaluation && item.evaluation ? (
        <div>
          <div className="secondary-text font-semibold text-[#8a7b77]">학생 평가</div>
          <p className="whitespace-pre-wrap break-words text-sm text-[#33333b]">{item.evaluation}</p>
        </div>
      ) : null}

      {/* 온라인 복습은 3-state 그대로 — 기록이 없으면(null) 아무것도 표시하지 않는다 */}
      {showEvaluation && item.onlineReviewCompleted !== null ? (
        <div className="secondary-text flex items-center gap-1.5 text-[#655d5d]">
          <span className="font-semibold text-[#8a7b77]">온라인 복습</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-xs font-semibold",
              item.onlineReviewCompleted ? "bg-[#e4f4ec] text-[#3d7f64]" : "bg-[#f5f1eb] text-[#8a7b77]",
            )}
          >
            {item.onlineReviewCompleted ? "완료" : "미완료"}
          </span>
        </div>
      ) : null}

      {showHomework && item.homework.length > 0 ? (
        <div>
          <div className="secondary-text font-semibold text-[#8a7b77]">숙제</div>
          <ul className="mt-0.5 space-y-1 text-sm">
            {item.homework.map((homework) => (
              <HomeworkLine key={homework.id} item={homework} />
            ))}
          </ul>
        </div>
      ) : null}

      <Button variant="secondary" size="sm" className="gap-1.5" asChild>
        <Link href={`/daily-logs/${item.dailyLogId}/edit`}>
          <BookOpen className="h-3.5 w-3.5" aria-hidden /> 수업일지 보기
        </Link>
      </Button>
    </div>
  );
}

function TimelineCard({
  item,
  category,
  studentIdForLinks,
}: {
  item: StudentTimelineItem;
  category: TimelineCategory;
  studentIdForLinks: string;
}) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;

  return (
    <li data-timeline-item={item.type} className="relative flex min-w-0 gap-3">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          meta.tint,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1 rounded-2xl border border-[#f0e8e4] bg-white/90 px-3.5 py-3">
        <div className="secondary-text mb-1 font-semibold text-[#8a7b77]">{meta.label}</div>

        {item.type === "lesson" ? <LessonCard item={item} category={category} /> : null}

        {item.type === "homework" ? (
          <div className="min-w-0 space-y-1.5">
            {item.groupName ? (
              <span className="flex min-w-0 items-center gap-1 text-sm font-medium text-[#2b2323]">
                <span aria-hidden>{groupIconOf(item.groupIcon)}</span>
                <span className="min-w-0 truncate">{item.groupName}</span>
              </span>
            ) : null}
            <ul className="space-y-1 text-sm">
              <HomeworkLine item={item.homework} />
            </ul>
            {item.dailyLogId ? (
              <Button variant="secondary" size="sm" className="gap-1.5" asChild>
                <Link href={`/daily-logs/${item.dailyLogId}/edit`}>
                  <BookOpen className="h-3.5 w-3.5" aria-hidden /> 수업일지 보기
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        {item.type === "makeup" ? (
          <div className="min-w-0 space-y-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {item.groupName ? (
                <span className="flex min-w-0 items-center gap-1 font-medium text-[#2b2323]">
                  <span aria-hidden>{groupIconOf(item.groupIcon)}</span>
                  <span className="min-w-0 truncate">{item.groupName}</span>
                </span>
              ) : null}
              {item.timeLabel ? (
                <span className="secondary-text tabular-nums text-[#655d5d]">{item.timeLabel}</span>
              ) : null}
              <MakeupStatusBadge status={item.status} />
            </div>
            <div className="secondary-text tabular-nums text-[#8a7b77]">
              원래 결석일 {formatKoreanDate(item.originalClassDate)}
            </div>
            {item.missedProgress ? (
              <p className="whitespace-pre-wrap break-words text-[#33333b]">
                <span className="secondary-text font-semibold text-[#8a7b77]">미진도 </span>
                {item.missedProgress}
              </p>
            ) : null}
            {item.completedProgress ? (
              <p className="whitespace-pre-wrap break-words text-[#33333b]">
                <span className="secondary-text font-semibold text-[#8a7b77]">보충 진도 </span>
                {item.completedProgress}
              </p>
            ) : null}
            {item.comment ? (
              <p className="whitespace-pre-wrap break-words text-[#564d4d]">{item.comment}</p>
            ) : null}
          </div>
        ) : null}

        {item.type === "praise" ? (
          <div className="min-w-0 space-y-1 text-sm">
            <span className="rounded-full bg-[#fdeef0] px-2 py-0.5 text-xs font-semibold text-[#b05a63]">
              {praiseCategoryLabels[item.category] ?? "칭찬"}
            </span>
            {item.comment ? (
              <p className="whitespace-pre-wrap break-words text-[#33333b]">{item.comment}</p>
            ) : null}
          </div>
        ) : null}

        {item.type === "consultation" ? (
          <div className="min-w-0 space-y-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-[#f3eefa] px-2 py-0.5 text-xs font-semibold text-[#5c4ca8]">
                {consultationTargetLabels[item.target]}
              </span>
              <span className="rounded-full bg-[#f5f1eb] px-2 py-0.5 text-xs font-semibold text-[#6f625f]">
                {consultationMethodLabels[item.method]}
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words font-medium text-[#2b2323]">{item.summary}</p>
            {item.followUpNote ? (
              <p className="whitespace-pre-wrap break-words text-[#33333b]">
                <span className="secondary-text font-semibold text-[#8a7b77]">후속 메모 </span>
                {item.followUpNote}
              </p>
            ) : null}
            {/* 타임라인은 읽기 전용 — 수정/삭제는 상담 기록 탭에서 한다 */}
            <Button variant="secondary" size="sm" className="gap-1.5" asChild>
              <Link href={`/students/${studentIdForLinks}?tab=consultations`}>
                <MessageCircle className="h-3.5 w-3.5" aria-hidden /> 상담 기록 보기
              </Link>
            </Button>
          </div>
        ) : null}

        {item.type === "exam" ? (
          <div className="min-w-0 space-y-1 text-sm">
            <div className="font-medium text-[#2b2323]">
              {item.schoolName} {examTypeLabels[item.examType]}
            </div>
            <div className="secondary-text tabular-nums text-[#655d5d]">
              {item.examYear}년 {semesterLabels[item.semester]}
              {item.endDate > item.date ? ` · ~ ${formatKoreanDate(item.endDate)}` : ""}
            </div>
            {item.scopeText ? (
              <p className="whitespace-pre-wrap break-words text-[#33333b]">{item.scopeText}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export async function StudentTimeline({
  studentId,
  studentName,
  category,
  range,
  limit,
  moreHref,
}: {
  studentId: string;
  studentName: string;
  category: TimelineCategory;
  range: TimelineRange;
  limit: number;
  // "이전 기록 더 보기" 링크 (현재 탭/필터/기간 유지)
  moreHref: (nextLimit: number) => string;
}) {
  const today = todayDateString();
  const since = timelineRangeStart(range, today);

  // 1단계 — 학생과 직접 연결된 기록들 (source마다 batch 1쿼리)
  const [lessons, makeups, praises, exams, consultations, schedules] = await Promise.all([
    getStudentTimelineLessons(studentId, since),
    getStudentTimelineMakeups(studentId),
    getStudentTimelinePraises(studentId, since),
    getStudentTimelineExams(studentId, since),
    // 상담 기록 — 학생 1명 기준 range batch 1쿼리 (상담마다 학생을 다시 조회하지 않는다)
    getStudentConsultations(studentId, { sinceDate: since }),
    // AppShell과 같은 쿼리라 요청당 1회로 dedupe된다
    getCurrentUserSchedulesWithGroup(),
  ]);

  const lessonDates = lessons.map((row) => row.dailyLog.class_date).sort();
  // 수업 시각 계산에 필요한 범위 — "전체"면 실제 기록이 있는 구간만 본다
  const spanStart = since ?? lessonDates[0] ?? today;
  const spanEnd = lessonDates[lessonDates.length - 1] ?? today;

  // 2단계 — 1단계 결과가 있어야 정할 수 있는 것들 (공통 숙제 대상 수업, 수업 시각 계산 범위)
  const [homeworkRows, exceptions, closures, supplements, holidays] = await Promise.all([
    getStudentTimelineHomework(
      studentId,
      lessons.map((row) => row.dailyLog.id),
      since,
    ),
    getScheduleExceptionsInRange(spanStart, spanEnd),
    getAcademyClosuresInRange(spanStart, spanEnd),
    getSupplementsInRange(spanStart, spanEnd),
    getKoreanHolidaysInRange(spanStart, spanEnd),
  ]);

  const exceptionIndex = buildScheduleExceptionIndex(exceptions, closures, supplements, holidays);

  // 숙제를 수업별로 묶는다 — 그 수업 카드 안에서 보여주기 위해서다 (중복 카드 방지)
  const homeworkByLog = new Map<string, TimelineHomework[]>();
  const attendedLogIds = new Set(lessons.map((row) => row.dailyLog.id));
  const standaloneHomework: typeof homeworkRows = [];

  for (const row of homeworkRows) {
    if (attendedLogIds.has(row.daily_log_id)) {
      homeworkByLog.set(row.daily_log_id, [
        ...(homeworkByLog.get(row.daily_log_id) ?? []),
        homeworkOf(row, studentName),
      ]);
      continue;
    }
    // 이 학생에게 배정됐지만 그 수업 기록이 없는 숙제 — 별도 항목으로 둔다(숨기지 않는다)
    standaloneHomework.push(row);
  }

  const items: StudentTimelineItem[] = [];

  for (const row of lessons) {
    const log = row.dailyLog;
    const commonProgress = mergeLegacyLessonContent(log.default_progress, log.lesson_content);
    const personalProgress = row.progress?.trim() ?? "";
    const timeLabel = log.group
      ? groupClassTimeLabelOn(schedules, log.group.id, log.class_date, exceptionIndex)
      : null;

    items.push({
      type: "lesson",
      id: `lesson-${row.id}`,
      date: log.class_date,
      sortTime: timeLabel ? timeLabel.slice(0, 5) : null,
      dailyLogId: log.id,
      groupId: log.group?.id ?? null,
      groupName: log.group?.name ?? null,
      groupIcon: log.group?.icon ?? null,
      timeLabel,
      title: log.title?.trim() || null,
      progress: personalProgress || commonProgress,
      progressIsCommon: !personalProgress && Boolean(commonProgress),
      attendance: row.attendance,
      attendanceReason: row.attendance_reason?.trim() || null,
      // 평가는 저장된 그대로 (줄바꿈 보존) — 칭찬/개선점이 따로 있으면 이어 붙인다
      evaluation:
        [row.memo?.trim(), row.strengths?.trim(), row.improvements?.trim()]
          .filter(Boolean)
          .join("\n") || null,
      onlineReviewCompleted: row.online_review_completed,
      homework: (homeworkByLog.get(log.id) ?? []).sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
      ),
    });
  }

  for (const row of standaloneHomework) {
    items.push({
      type: "homework",
      id: `homework-${row.id}`,
      date: row.due_date,
      sortTime: null,
      dailyLogId: row.daily_log_id,
      groupName: null,
      groupIcon: null,
      homework: homeworkOf(row, studentName),
    });
  }

  for (const row of makeups) {
    // 실제로 있었던 날이 기준 — 완료일이 있으면 완료일, 없으면 예정일.
    // 날짜가 아직 없는 대기 상태 보충은 "지난 활동"이 아니므로 타임라인에 넣지 않는다.
    const date = row.completed_date ?? row.scheduled_date;
    if (!date || (since && date < since)) {
      continue;
    }

    items.push({
      type: "makeup",
      id: `makeup-${row.id}`,
      date,
      sortTime: row.start_time ? row.start_time.slice(0, 5) : null,
      status: row.status,
      timeLabel:
        row.start_time && row.end_time ? formatTimeRange(row.start_time, row.end_time) : null,
      originalClassDate: row.original_class_date,
      groupName: row.group?.name ?? null,
      groupIcon: row.group?.icon ?? null,
      missedProgress: row.missed_progress?.trim() || null,
      completedProgress: row.completed_progress?.trim() || null,
      comment: row.comment?.trim() || null,
    });
  }

  for (const row of praises) {
    const { date, time } = kstDateAndTime(row.created_at);
    items.push({
      type: "praise",
      id: `praise-${row.id}`,
      date,
      sortTime: time,
      category: row.category,
      comment: row.comment?.trim() || null,
      dailyLogId: row.daily_log_id,
    });
  }

  for (const row of consultations) {
    items.push({
      type: "consultation",
      id: `consultation-${row.id}`,
      date: row.consultation_date,
      sortTime: row.consultation_time ? row.consultation_time.slice(0, 5) : null,
      consultationId: row.id,
      target: row.target,
      method: row.method,
      summary: row.summary,
      followUpNote: row.follow_up_note?.trim() || null,
    });
  }

  for (const row of exams) {
    items.push({
      type: "exam",
      id: `exam-${row.id}`,
      date: row.start_date,
      sortTime: null,
      schoolName: row.school_name,
      examType: row.exam_type,
      examYear: row.exam_year,
      semester: row.semester,
      endDate: row.end_date,
      scopeText: row.scope_text?.trim() || null,
    });
  }

  const sorted = sortTimelineItems(filterTimelineItems(items, category));
  const visible = sorted.slice(0, limit);
  const hasMore = sorted.length > visible.length;
  const groups = groupTimelineByDate(visible);

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-[#f0e8e4] bg-[#fdfbf8] px-4 py-8 text-center text-sm text-[#8a7b77]">
        {category === "all"
          ? "아직 기록이 없어요."
          : `이 기간에는 ${
              {
                lesson: "수업",
                attendance: "출결",
                homework: "숙제",
                evaluation: "평가",
                exam: "시험",
                makeup: "보충",
                praise: "칭찬",
                consultation: "상담",
                all: "",
              }[category]
            } 기록이 없어요.`}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.date} aria-labelledby={`timeline-${group.date}`}>
          <h3
            id={`timeline-${group.date}`}
            className="card-title mb-2 tabular-nums text-[#2d2928]"
          >
            {formatKoreanDate(group.date, true)}
          </h3>
          <ul className="space-y-2.5 border-l border-[#f0e8e4] pl-3">
            {group.items.map((item) => (
              <TimelineCard
                key={item.id}
                item={item}
                category={category}
                studentIdForLinks={studentId}
              />
            ))}
          </ul>
        </section>
      ))}

      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" asChild>
            <Link href={moreHref(limit + TIMELINE_PAGE_SIZE)} scroll={false}>
              이전 기록 더 보기
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function StudentTimelineSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-24 rounded-2xl border border-[#f0e8e4] bg-[#fdfbf8]"
        />
      ))}
    </div>
  );
}
