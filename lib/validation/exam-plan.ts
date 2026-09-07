import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식을 확인해주세요.");

// 시험 대비 계획 — MVP는 날짜 + 할 내용 두 가지만 (단원/구분·메모 UI 제거,
// DB의 unit_label/memo 컬럼은 legacy 보존용으로 유지된다).
// 할 내용은 여러 줄 입력을 지원한다: .trim()은 앞뒤 공백만 다듬고 내부 \n은 보존된다.
export const examPlanSchema = z.object({
  planDate: dateString,
  title: z
    .string()
    .trim()
    .min(1, "할 내용을 입력해주세요.")
    .max(500, "할 내용은 500자 이내로 입력해주세요."),
});

export type ExamPlanFormInput = z.infer<typeof examPlanSchema>;
