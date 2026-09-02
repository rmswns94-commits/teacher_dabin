import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

const itemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupId: z.string().uuid(),
  progress: z.string().trim().min(1).max(4000),
  textbooks: z.array(z.string().trim().max(200)).max(20),
  // 기존 일지가 있을 때의 처리 (기본: keep — 자동 overwrite 금지)
  resolution: z.enum(["keep", "append", "replace"]),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(100),
});

export type ImportApplyResult = {
  created: number;
  updated: number;
  kept: number;
  failed: { index: number; reason: string }[];
};

// Preview에서 사용자가 확정한 수업만 daily_logs에 반영한다.
// - 신규는 status=draft (Excel은 진도만 제공 — 자동 완료 처리 금지)
// - 기존 일지는 keep/append/replace만, status는 절대 변경하지 않는다.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식을 확인해주세요." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "가져올 수업 정보를 확인해주세요." }, { status: 400 });
  }

  const items = parsed.data.items;

  // ownership/기존 일지 확인은 batch 조회 (row별 쿼리 금지)
  const groupIds = [...new Set(items.map((item) => item.groupId))];
  const dates = [...new Set(items.map((item) => item.date))];

  const [{ data: ownedGroups }, { data: existingRows }] = await Promise.all([
    supabase.from("class_groups").select("id").eq("user_id", user.id).in("id", groupIds),
    supabase
      .from("daily_logs")
      .select("id, group_id, class_date, status, default_progress")
      .eq("user_id", user.id)
      .in("class_date", dates),
  ]);

  const ownedGroupIds = new Set((ownedGroups ?? []).map((row) => row.id as string));
  const existingByKey = new Map(
    (existingRows ?? []).map((row) => [`${row.group_id}:${row.class_date}`, row]),
  );

  const result: ImportApplyResult = { created: 0, updated: 0, kept: 0, failed: [] };
  const inserts: Record<string, unknown>[] = [];
  const insertedKeys = new Set<string>(); // 같은 요청 안 중복 row 방지
  const updates: { id: string; default_progress: string }[] = [];

  for (const [index, item] of items.entries()) {
    if (!ownedGroupIds.has(item.groupId)) {
      result.failed.push({ index, reason: "수업 그룹을 확인하지 못했어요." });
      continue;
    }

    const key = `${item.groupId}:${item.date}`;
    const existing = existingByKey.get(key);
    const progress = item.progress.trim();

    if (existing) {
      const current = (existing.default_progress ?? "").trim();

      if (item.resolution === "keep") {
        result.kept += 1;
      } else if (item.resolution === "replace") {
        updates.push({ id: existing.id as string, default_progress: progress });
      } else {
        // append: 같은 내용을 중복으로 붙이지 않는다
        if (current.includes(progress)) {
          result.kept += 1;
        } else {
          updates.push({
            id: existing.id as string,
            default_progress: current ? `${current}\n\n${progress}` : progress,
          });
        }
      }

      continue;
    }

    if (insertedKeys.has(key)) {
      result.kept += 1; // 같은 파일 안에서 같은 그룹+날짜가 중복되면 첫 항목만 생성
      continue;
    }

    insertedKeys.add(key);
    inserts.push({
      user_id: user.id,
      group_id: item.groupId,
      class_date: item.date,
      default_progress: progress,
      lesson_content: item.textbooks.length > 0 ? `교재: ${item.textbooks.join(", ")}` : null,
      status: "draft",
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("daily_logs").insert(inserts);

    if (error) {
      console.error("excel import insert error", error.code);
      return NextResponse.json(
        { error: "수업일지를 저장하지 못했어요. 다시 시도해주세요." },
        { status: 500 },
      );
    }

    result.created = inserts.length;
  }

  for (const update of updates) {
    const { error } = await supabase
      .from("daily_logs")
      .update({ default_progress: update.default_progress })
      .eq("id", update.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("excel import update error", error.code);
      result.failed.push({ index: -1, reason: "기존 일지 업데이트에 실패했어요." });
    } else {
      result.updated += 1;
    }
  }

  revalidatePath("/daily-logs");
  revalidatePath("/groups");
  revalidatePath("/dashboard");
  revalidatePath("/growth-notes", "layout");

  console.log(
    `excel import apply: created=${result.created} updated=${result.updated} kept=${result.kept} failed=${result.failed.length}`,
  );

  return NextResponse.json(result);
}
