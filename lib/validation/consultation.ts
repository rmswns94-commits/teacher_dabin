import { z } from "zod";

// 학생/학부모 상담 기록의 입력 규칙 — 화면과 서버 action이 같은 스키마를 쓴다.
// 값은 표시 문구가 아니라 안정적인 코드로 저장한다 (라벨이 바뀌어도 기록은 그대로).

export const consultationTargetValues = ["student", "parent"] as const;
export type ConsultationTarget = (typeof consultationTargetValues)[number];

export const consultationTargetLabels: Record<ConsultationTarget, string> = {
  student: "학생 상담",
  parent: "학부모 상담",
};

export const consultationMethodValues = [
  "in_person",
  "phone",
  "message",
  "online",
  "other",
] as const;
export type ConsultationMethod = (typeof consultationMethodValues)[number];

export const consultationMethodLabels: Record<ConsultationMethod, string> = {
  in_person: "대면",
  phone: "전화",
  message: "문자·메신저",
  online: "온라인",
  other: "기타",
};

// 상담 내용은 실무에서 길어질 수 있어 넉넉하게 둔다 (DB는 text).
export const CONSULTATION_SUMMARY_MAX = 120;
export const CONSULTATION_CONTENT_MAX = 4000;
export const CONSULTATION_FOLLOW_UP_MAX = 1000;

export const consultationFieldsSchema = z.object({
  consultationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "상담 날짜를 선택해주세요."),
  // 선택 — 모르면 비워 둔다 (created_at을 상담 시각으로 대신 쓰지 않는다)
  consultationTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "상담 시간을 확인해주세요.")
    .optional()
    .or(z.literal("")),
  target: z.enum(consultationTargetValues, { message: "상담 대상을 선택해주세요." }),
  method: z.enum(consultationMethodValues, { message: "상담 방식을 선택해주세요." }),
  summary: z
    .string()
    .trim()
    .min(1, "상담 요약을 입력해주세요.")
    .max(CONSULTATION_SUMMARY_MAX, `상담 요약은 ${CONSULTATION_SUMMARY_MAX}자 이내로 입력해주세요.`),
  content: z
    .string()
    .trim()
    .min(1, "상담 내용을 입력해주세요.")
    .max(CONSULTATION_CONTENT_MAX, `상담 내용은 ${CONSULTATION_CONTENT_MAX}자 이내로 입력해주세요.`),
  followUpNote: z
    .string()
    .trim()
    .max(CONSULTATION_FOLLOW_UP_MAX, `후속 메모는 ${CONSULTATION_FOLLOW_UP_MAX}자 이내로 입력해주세요.`)
    .optional()
    .or(z.literal("")),
});

export type ConsultationFields = z.infer<typeof consultationFieldsSchema>;
