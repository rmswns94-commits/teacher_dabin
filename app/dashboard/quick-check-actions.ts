"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { saveQuickAttendance, saveQuickHomeworkStatus } from "@/lib/supabase/queries/quick-check";

// Dashboard QUICK CLASS CHECK 서버 액션 — 출결/숙제 검사를 Daily Log 학생 기록(canonical)에 바로 쓴다.
// 저장 규칙/guard(identity, draft 차단, Finalized 차단, 결석 규칙)는 전부 queries/quick-check 한 곳.
// 성공 시 같은 source를 쓰는 화면만 revalidate (대시보드 badge/마무리 체크리스트, 수업일지, 출결 현황, 성장노트).

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const attendanceSchema = z.enum(["present", "late", "absent", "early_leave"]);
const homeworkStatusSchema = z.enum(["completed", "partial", "missing"]).nullable();

const quickAttendanceSchema = z.object({
  groupId: z.string().uuid(),
  classDate: dateSchema,
  entries: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        attendance: attendanceSchema,
        attendanceReason: z.string().max(500).optional().nullable(),
      }),
    )
    .min(1)
    .max(100),
});

const quickHomeworkSchema = z.object({
  groupId: z.string().uuid(),
  classDate: dateSchema,
  entries: z.array(z.object({ studentId: z.string().uuid(), homeworkStatus: homeworkStatusSchema })).min(1).max(100),
});

function revalidateQuickCheck(logId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/daily-logs");
  revalidatePath(`/daily-logs/${logId}`);
  revalidatePath(`/daily-logs/${logId}/edit`);
  revalidatePath("/attendance");
  // 숙제 검사(homework_status)는 성장노트 꾸준함왕 source
  revalidatePath("/growth-notes", "layout");
}

export async function quickAttendanceAction(input: unknown) {
  const parsed = quickAttendanceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "출결 입력을 확인해주세요." as string, code: "invalid" as const };
  }
  const result = await saveQuickAttendance(parsed.data);
  if ("error" in result) {
    return { error: result.error, code: result.code };
  }
  revalidateQuickCheck(result.logId);
  return { success: true as const, logId: result.logId, logStatus: result.logStatus, rows: result.rows };
}

export async function quickHomeworkCheckAction(input: unknown) {
  const parsed = quickHomeworkSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "숙제 검사 입력을 확인해주세요." as string, code: "invalid" as const };
  }
  const result = await saveQuickHomeworkStatus(parsed.data);
  if ("error" in result) {
    return { error: result.error, code: result.code };
  }
  revalidateQuickCheck(result.logId);
  return { success: true as const, logId: result.logId };
}
