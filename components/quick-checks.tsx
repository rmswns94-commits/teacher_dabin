"use client";

import { BookCheck, CircleCheck, CircleX, Clock3, DoorOpen, UserCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { quickAttendanceAction, quickHomeworkCheckAction } from "@/app/dashboard/quick-check-actions";
import { useClassCardClock, useLocalClock } from "@/components/class-card-clock";
import { Button } from "@/components/ui/button";
import { DragGrip, dialogDragHandleClass, useDraggableDialog } from "@/components/ui/draggable-dialog";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { ATTENDANCE_ORDER } from "@/lib/attendance";
import {
  HOMEWORK_STATUS_ORDER,
  attendanceBreakdown,
  attendanceLabels,
  attendanceProgress,
  attendanceQuickLabel,
  homeworkProgress,
  homeworkQuickLabel,
  homeworkResultSummary,
  homeworkStatusLabels,
  isHomeworkCheckTarget,
  quickCheckLockText,
  resolveQuickCheckLock,
  wholeAttendanceTargets,
  type QuickCheckModel,
  type QuickCheckStudent,
} from "@/lib/quick-check";
import type { AttendanceStatus, HomeworkStatus } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

// Dashboard QUICK CLASS CHECK — 출결 초고속 체크 / 숙제 검사 (client).
// - 데이터는 서버가 브리핑 batch에서 만든 model(props)뿐: 열 때 쿼리 0, 학생별 요청 0.
// - 각 탭은 낙관적으로 즉시 반영하고 서버 액션 1회(학생별 또는 [전체 출석] batch)로 저장, 실패 시 그 학생만 롤백.
//   학생별 순서는 queue로 보장(빠른 연타에도 마지막 선택이 저장된다). Dialog를 닫을 때 변경이 있었으면
//   router.refresh() 한 번으로 같은 source를 쓰는 다른 카드(마무리 체크리스트 등)를 맞춘다.
// - 수정 가능 여부는 카드 clock(context)·local clock으로 판정: 현재 수업 / 방금 끝난 수업(wrap-up, 미완료)만.
// - 숙제 검사는 Daily Log 학생 평가의 homework_status(완료/일부/미제출, null=미검사) 그대로 — 별도 저장소 없음.

export type QuickCheckTiming = { key: string; startEpoch: number; endEpoch: number; finalized: boolean };

type ActionResult = { success: true } | { error: string; code: string };

const ATTENDANCE_ICON: Record<AttendanceStatus, typeof CircleCheck> = {
  present: CircleCheck,
  late: Clock3,
  early_leave: DoorOpen,
  absent: CircleX,
};
// Daily Log 폼의 출결 버튼과 같은 색 체계 (선택은 테두리/배경 + 아이콘 + aria-pressed로 전달)
const ATTENDANCE_ACTIVE: Record<AttendanceStatus, string> = {
  present: "border-[#bfe3d2] bg-[#edf9f3] text-[#2f6d54]",
  late: "border-[#ecd9b4] bg-[#fdf3e4] text-[#8a6828]",
  early_leave: "border-[#d8cdf0] bg-[#f3eefc] text-[#5d4ba5]",
  absent: "border-[#f0ccc7] bg-[#fff0ef] text-[#96534c]",
};
const HOMEWORK_ACTIVE: Record<HomeworkStatus, string> = {
  completed: "border-[#bfe3d2] bg-[#edf9f3] text-[#2f6d54]",
  partial: "border-[#ecd9b4] bg-[#fdf3e4] text-[#8a6828]",
  missing: "border-[#f0ccc7] bg-[#fff0ef] text-[#96534c]",
};
const CHOICE_BASE =
  "flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";
const CHOICE_IDLE = "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]";

function reasonLabel(status: AttendanceStatus) {
  return status === "late" ? "지각 사유" : status === "early_leave" ? "조퇴 사유" : "결석 사유";
}

export function QuickCheckButtons({
  model,
  timing,
  variant,
  initialNow,
}: {
  model: QuickCheckModel;
  timing: QuickCheckTiming;
  variant: "hero" | "wrapup";
  initialNow: number;
}) {
  const router = useRouter();
  const clock = useClassCardClock();
  const localNow = useLocalClock(initialNow);
  const now = clock?.now ?? localNow;

  // 서버 데이터가 바뀌면(refresh 후) local state도 그 값으로 — render-phase 동기화 (effect 없이)
  const [seed, setSeed] = useState(model);
  const [students, setStudents] = useState(model.students);
  if (seed !== model) {
    setSeed(model);
    setStudents(model.students);
  }

  const [open, setOpen] = useState<"attendance" | "homework" | null>(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(model.hasAutosaveDraft);
  const [pending, setPending] = useState(0);
  const changedRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const wrapUpAllowed = variant === "wrapup" && Boolean(clock && clock.autoKey === timing.key);
  const lock = resolveQuickCheckLock({
    startEpoch: timing.startEpoch,
    endEpoch: timing.endEpoch,
    now,
    finalized: timing.finalized,
    wrapUpAllowed,
  });
  const editable = lock.editable && !blocked;
  const lockText = lock.editable ? null : quickCheckLockText[lock.reason];

  const attendance = attendanceProgress(students);
  const homework = homeworkProgress(students);

  const enqueue = (task: () => Promise<void>) => {
    setPending((count) => count + 1);
    queueRef.current = queueRef.current
      .then(task)
      .catch(() => {})
      .finally(() => setPending((count) => count - 1));
  };

  const handleFailure = (result: { error: string; code: string }, restore: () => void) => {
    restore();
    setError(result.error);
    if (result.code === "draft_blocked") {
      setBlocked(true);
    }
  };

  const patchStudent = (studentId: string, patch: Partial<QuickCheckStudent>) =>
    setStudents((current) => current.map((student) => (student.id === studentId ? { ...student, ...patch } : student)));

  const saveAttendance = (entries: { studentId: string; attendance: AttendanceStatus; attendanceReason: string }[], restore: () => void) =>
    enqueue(async () => {
      const result = (await quickAttendanceAction({
        groupId: model.groupId,
        classDate: model.classDate,
        entries: entries.map((entry) => ({
          studentId: entry.studentId,
          attendance: entry.attendance,
          attendanceReason: entry.attendance === "present" ? null : entry.attendanceReason,
        })),
      })) as ActionResult;
      if (!("success" in result)) {
        handleFailure(result, restore);
        return;
      }
      setError("");
      changedRef.current = true;
    });

  const setAttendance = (studentId: string, status: AttendanceStatus) => {
    const before = students.find((student) => student.id === studentId);
    if (!before || !editable) {
      return;
    }
    const reason = status === "present" ? "" : before.attendanceReason;
    patchStudent(studentId, { attendance: status, attendanceReason: reason });
    saveAttendance([{ studentId, attendance: status, attendanceReason: reason }], () =>
      patchStudent(studentId, { attendance: before.attendance, attendanceReason: before.attendanceReason }),
    );
  };

  // 사유는 로컬 입력(한글 조합 보존) → blur 시 현재 상태와 함께 저장
  const commitReason = (studentId: string) => {
    const student = students.find((item) => item.id === studentId);
    if (!student || !editable || !student.attendance || student.attendance === "present") {
      return;
    }
    const previousReason = model.students.find((item) => item.id === studentId)?.attendanceReason ?? "";
    saveAttendance([{ studentId, attendance: student.attendance, attendanceReason: student.attendanceReason }], () =>
      patchStudent(studentId, { attendanceReason: previousReason }),
    );
  };

  // [전체 출석] — 아직 상태가 없는 학생만 present (이미 정한 지각/조퇴/결석/출석은 그대로)
  const wholePresent = () => {
    const targets = wholeAttendanceTargets(students);
    if (targets.length === 0 || !editable) {
      return;
    }
    setStudents((current) =>
      current.map((student) => (targets.includes(student.id) ? { ...student, attendance: "present", attendanceReason: "" } : student)),
    );
    saveAttendance(
      targets.map((studentId) => ({ studentId, attendance: "present" as const, attendanceReason: "" })),
      () =>
        setStudents((current) =>
          current.map((student) => (targets.includes(student.id) ? { ...student, attendance: null, attendanceReason: "" } : student)),
        ),
    );
  };

  const setHomework = (studentId: string, status: HomeworkStatus) => {
    const before = students.find((student) => student.id === studentId);
    if (!before || !editable || before.attendance === null || before.attendance === "absent") {
      return;
    }
    patchStudent(studentId, { homeworkStatus: status });
    enqueue(async () => {
      const result = (await quickHomeworkCheckAction({
        groupId: model.groupId,
        classDate: model.classDate,
        entries: [{ studentId, homeworkStatus: status }],
      })) as ActionResult;
      if (!("success" in result)) {
        handleFailure(result, () => patchStudent(studentId, { homeworkStatus: before.homeworkStatus }));
        return;
      }
      setError("");
      changedRef.current = true;
    });
  };

  const close = () => {
    setOpen(null);
    setError("");
    if (changedRef.current) {
      changedRef.current = false;
      router.refresh();
    }
  };

  const attendanceLabel = attendanceQuickLabel(attendance);
  const homeworkLabel = homeworkQuickLabel(homework);
  const commonData = (kind: "attendance" | "homework", progress: typeof attendance) => ({
    "data-quick-check": kind,
    "data-checked": progress.checked,
    "data-total": progress.total,
    "data-complete": progress.complete ? "true" : "false",
    "data-editable": editable ? "true" : "false",
  });

  const dialogs = (
    <>
      {open === "attendance" ? (
        <QuickAttendanceDialog
          model={model}
          students={students}
          editable={editable}
          lockText={lockText}
          blocked={blocked}
          error={error}
          pending={pending > 0}
          onSet={setAttendance}
          onReason={(studentId, text) => patchStudent(studentId, { attendanceReason: text })}
          onReasonCommit={commitReason}
          onWholePresent={wholePresent}
          onClose={close}
        />
      ) : null}
      {open === "homework" ? (
        <HomeworkCheckDialog
          model={model}
          students={students}
          editable={editable}
          lockText={lockText}
          blocked={blocked}
          error={error}
          pending={pending > 0}
          onSet={setHomework}
          onClose={close}
        />
      ) : null}
    </>
  );

  if (variant === "wrapup") {
    const homeworkDetail =
      homework.total === 0
        ? "확인할 지난 숙제 없음"
        : `${homework.checked}/${homework.total} 확인${homeworkResultSummary(students) ? ` · ${homeworkResultSummary(students)}` : ""}`;
    const rows = [
      {
        kind: "attendance" as const,
        progress: attendance,
        label: "출결 확인",
        detail: `${attendance.checked}/${attendance.total} 확인${attendanceBreakdown(students) ? ` · ${attendanceBreakdown(students)}` : ""}`,
        done: attendance.complete,
      },
      {
        kind: "homework" as const,
        progress: homework,
        label: "숙제 확인",
        detail: homeworkDetail,
        done: homework.total === 0 || homework.complete,
      },
    ];
    return (
      <>
        <ul className="space-y-1.5" data-quick-check-rows>
          {rows.map((row) => (
            <li key={row.kind} data-check-key={`${row.kind}_check`} data-check-state={row.done ? "done" : "review"}>
              <button
                type="button"
                {...commonData(row.kind, row.progress)}
                aria-haspopup="dialog"
                onClick={() => setOpen(row.kind)}
                className="tap-press-subtle flex min-h-11 w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl bg-white/70 px-3 py-1.5 text-left transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b9a5e3]"
              >
                <span aria-hidden className={cn("w-3 shrink-0 text-center font-semibold", row.done ? "text-[#3d7f64]" : "text-[#a2643c]")}>
                  {row.done ? "✓" : "!"}
                </span>
                <span className="body-text font-medium text-[#2d2928]">{row.label}</span>
                <span className="secondary-text min-w-0 break-words text-[#8a7b77]">{row.detail}</span>
                {!editable ? (
                  <span className="caption-text min-w-0 break-words text-[#a79996]">
                    {blocked ? "임시저장 작성 중 · 수업일지에서 확인" : lockText}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        aria-haspopup="dialog"
        title={!lock.editable ? lockText ?? undefined : undefined}
        onClick={() => setOpen("attendance")}
        {...commonData("attendance", attendance)}
      >
        <UserCheck className="h-4 w-4" aria-hidden /> {attendanceLabel}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        aria-haspopup="dialog"
        title={homework.total === 0 ? "확인할 지난 숙제가 없어요" : !lock.editable ? lockText ?? undefined : undefined}
        onClick={() => setOpen("homework")}
        {...commonData("homework", homework)}
      >
        <BookCheck className="h-4 w-4" aria-hidden /> {homeworkLabel}
      </Button>
      {dialogs}
    </>
  );
}

// ---- Dialog shell: Header(drag handle) / Body(scroll) / Footer(항상 접근) — 공용 Draggable/Portal/bounded 패턴 ----
function QuickDialogShell({
  kind,
  label,
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  kind: "attendance" | "homework";
  label: string;
  title: string;
  subtitle: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const { attachPanel, handleProps } = useDraggableDialog();
  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/30 px-4 py-6"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-quick-dialog={kind}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            return;
          }
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          ref={attachPanel}
          className="flex max-h-[calc(100dvh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#efe4dc] bg-[#fffdfb] shadow-[0_22px_60px_rgba(60,48,90,0.25)]"
        >
          <div
            {...handleProps}
            className={`flex shrink-0 items-start justify-between gap-3 border-b border-dashed border-[#eee3dc] px-5 pb-3 pt-5 ${dialogDragHandleClass}`}
          >
            <div className="min-w-0">
              <div className="card-title flex items-center gap-2 text-[#2a2323]">
                <DragGrip />
                {title}
              </div>
              <p className="secondary-text mt-0.5 text-[#8a7b77]">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#8a7b77] transition hover:bg-[#faf0f2]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4" data-quick-dialog-body>
            {children}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-dashed border-[#eee3dc] px-5 py-3">
            {footer}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

function DialogNotices({
  blocked,
  lockText,
  error,
  formHref,
}: {
  blocked: boolean;
  lockText: string | null;
  error: string;
  formHref: string;
}) {
  return (
    <>
      {blocked ? (
        <div className="mb-3 rounded-2xl border border-[#ecd9b4] bg-[#fdf3e4] px-3 py-2.5 text-sm text-[#8a6828]" data-quick-blocked>
          작성 중인 임시저장이 있어요. 대시보드에서는 바꾸지 않고,{" "}
          <Link href={`${formHref}#attendance`} className="font-semibold underline underline-offset-2">
            수업일지에서 이어서 확인
          </Link>
          해주세요.
        </div>
      ) : lockText ? (
        <div className="mb-3 rounded-2xl bg-[#f6f1ec] px-3 py-2.5 text-sm text-[#7c6d69]" data-quick-locked>
          {lockText}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
          {error}
        </p>
      ) : null}
    </>
  );
}

function QuickAttendanceDialog({
  model,
  students,
  editable,
  lockText,
  blocked,
  error,
  pending,
  onSet,
  onReason,
  onReasonCommit,
  onWholePresent,
  onClose,
}: {
  model: QuickCheckModel;
  students: QuickCheckStudent[];
  editable: boolean;
  lockText: string | null;
  blocked: boolean;
  error: string;
  pending: boolean;
  onSet: (studentId: string, status: AttendanceStatus) => void;
  onReason: (studentId: string, text: string) => void;
  onReasonCommit: (studentId: string) => void;
  onWholePresent: () => void;
  onClose: () => void;
}) {
  const progress = attendanceProgress(students);
  const targets = wholeAttendanceTargets(students);
  return (
    <QuickDialogShell
      kind="attendance"
      label={`출결 체크 · ${model.groupName}`}
      title={`출결 체크 · ${model.groupName}`}
      subtitle={model.timeLabel}
      onClose={onClose}
      footer={
        <>
          <span className="secondary-text tabular-nums text-[#655d5d]" aria-live="polite" data-quick-progress>
            확인 {progress.checked} / {progress.total}
            {pending ? " · 저장 중..." : ""}
          </span>
          <Button type="button" size="sm" onClick={onClose} data-quick-done>
            완료
          </Button>
        </>
      }
    >
      <DialogNotices blocked={blocked} lockText={lockText} error={error} formHref={model.formHref} />
      {students.length === 0 ? (
        <p className="secondary-text rounded-2xl bg-[#f6f1ec] px-3 py-3 text-[#8a7b77]">이 반에 등록된 학생이 없어요.</p>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mb-3 gap-1.5"
            disabled={!editable || targets.length === 0}
            onClick={onWholePresent}
            data-whole-attendance
            title="아직 확인하지 않은 학생만 출석으로 표시해요"
          >
            <CircleCheck className="h-4 w-4" aria-hidden /> 전체 출석
            {targets.length > 0 ? ` (미확인 ${targets.length}명)` : ""}
          </Button>
          <ul className="space-y-2">
            {students.map((student) => (
              <li
                key={student.id}
                data-student-id={student.id}
                data-attendance={student.attendance ?? "none"}
                className="rounded-2xl border border-[#f0e6e0] bg-white px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-base font-semibold text-[#2b2323]">{student.name}</span>
                  <span className="caption-text text-[#a79996]">
                    {student.attendance ? attendanceLabels[student.attendance] : "미확인"}
                  </span>
                </div>
                <div role="group" aria-label={`${student.name} 출결`} className="mt-2 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
                  {ATTENDANCE_ORDER.map((status) => {
                    const Icon = ATTENDANCE_ICON[status];
                    const selected = student.attendance === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={selected}
                        data-status={status}
                        disabled={!editable}
                        onClick={() => onSet(student.id, status)}
                        className={cn(CHOICE_BASE, selected ? ATTENDANCE_ACTIVE[status] : CHOICE_IDLE)}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden /> {attendanceLabels[status]}
                      </button>
                    );
                  })}
                </div>
                {student.attendance && student.attendance !== "present" ? (
                  <label className="mt-2 block">
                    <span className="caption-text mb-1 block text-[#8a7b77]">
                      {reasonLabel(student.attendance)} <span className="font-normal text-[#a79996]">(선택)</span>
                    </span>
                    <textarea
                      value={student.attendanceReason}
                      onChange={(event) => onReason(student.id, event.target.value)}
                      onBlur={() => onReasonCommit(student.id)}
                      rows={1}
                      maxLength={500}
                      disabled={!editable}
                      aria-label={`${student.name} 출결 사유`}
                      placeholder="사유를 입력하세요 (선택)"
                      className="min-h-[44px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-base leading-6 outline-none focus:border-[#e3b9c9] disabled:opacity-60"
                    />
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </QuickDialogShell>
  );
}

function HomeworkCheckDialog({
  model,
  students,
  editable,
  lockText,
  blocked,
  error,
  pending,
  onSet,
  onClose,
}: {
  model: QuickCheckModel;
  students: QuickCheckStudent[];
  editable: boolean;
  lockText: string | null;
  blocked: boolean;
  error: string;
  pending: boolean;
  onSet: (studentId: string, status: HomeworkStatus) => void;
  onClose: () => void;
}) {
  const progress = homeworkProgress(students);
  // 적용되는 지난 숙제가 있는 학생만 (결석 학생은 안내만 — 검사 대상/분모 아님)
  const listed = students.filter((student) => student.homeworkItems.length > 0);
  const summary = homeworkResultSummary(students);
  return (
    <QuickDialogShell
      kind="homework"
      label={`숙제 검사 · ${model.groupName}`}
      title={`숙제 검사 · ${model.groupName}`}
      subtitle={
        model.previousLessonDate
          ? `지난 수업 숙제 · ${model.previousLessonDate.slice(5).replace("-", "/")} · 검사 결과는 수업일지 학생 평가의 숙제 항목과 같아요`
          : "지난 수업 숙제"
      }
      onClose={onClose}
      footer={
        <>
          <span className="secondary-text tabular-nums text-[#655d5d]" aria-live="polite" data-quick-progress>
            확인 {progress.checked} / {progress.total}
            {summary ? ` · ${summary}` : ""}
            {pending ? " · 저장 중..." : ""}
          </span>
          <Button type="button" size="sm" onClick={onClose} data-quick-done>
            완료
          </Button>
        </>
      }
    >
      <DialogNotices blocked={blocked} lockText={lockText} error={error} formHref={model.formHref} />
      {listed.length === 0 ? (
        <p className="secondary-text rounded-2xl bg-[#f6f1ec] px-3 py-3 text-[#8a7b77]" data-quick-empty>
          확인할 지난 숙제가 없어요.
        </p>
      ) : (
        <ul className="space-y-2">
          {listed.map((student) => {
            const target = isHomeworkCheckTarget(student);
            return (
              <li
                key={student.id}
                data-student-id={student.id}
                data-homework-status={student.homeworkStatus ?? "none"}
                data-homework-target={target ? "true" : "false"}
                className="rounded-2xl border border-[#f0e6e0] bg-white px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-base font-semibold text-[#2b2323]">{student.name}</span>
                  {student.attendance === "absent" ? (
                    <span className="caption-text rounded-full bg-[#fff0ef] px-2 py-0.5 text-[#96534c]">오늘 결석 · 검사 대상 아님</span>
                  ) : student.attendance === null ? (
                    <span className="caption-text rounded-full bg-[#f6f1ec] px-2 py-0.5 text-[#8a7b77]">출결을 먼저 확인해주세요</span>
                  ) : (
                    <div role="group" aria-label={`${student.name} 숙제 검사`} className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:w-auto">
                      {HOMEWORK_STATUS_ORDER.map((status) => {
                        const selected = student.homeworkStatus === status;
                        return (
                          <button
                            key={status}
                            type="button"
                            aria-pressed={selected}
                            data-status={status}
                            disabled={!editable}
                            onClick={() => onSet(student.id, status)}
                            className={cn(CHOICE_BASE, selected ? HOMEWORK_ACTIVE[status] : CHOICE_IDLE)}
                          >
                            {homeworkStatusLabels[status]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {student.homeworkItems.map((item) => (
                    <li key={item.id} data-homework-item={item.id} data-audience={item.audience} className="secondary-text flex gap-1.5 text-[#453b3b]">
                      <span aria-hidden>•</span>
                      <span className="min-w-0 whitespace-pre-wrap break-words">{item.label}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </QuickDialogShell>
  );
}
