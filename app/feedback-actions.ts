"use server";

import { z } from "zod";

import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

const feedbackSchema = z.object({
  category: z.enum(["bug", "ux", "feature", "other"]),
  message: z.string().trim().min(1, "내용을 입력해주세요.").max(2000, "내용은 2000자 이내로 입력해주세요."),
  pagePath: z.string().max(300).optional().or(z.literal("")),
});

export async function sendFeedbackAction(input: {
  category: string;
  message: string;
  pagePath?: string;
}) {
  const parsed = feedbackSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "내용을 다시 확인해주세요." };
  }

  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { error: "로그인이 필요해요." };
  }

  const { error } = await supabase.from("beta_feedback").insert({
    user_id: user.id,
    category: parsed.data.category,
    message: parsed.data.message,
    page_path: parsed.data.pagePath || null,
  });

  if (error) {
    console.error("sendFeedbackAction error", error);
    return { error: "피드백을 보내지 못했어요. 다시 시도해주세요." };
  }

  return { success: true as const };
}
