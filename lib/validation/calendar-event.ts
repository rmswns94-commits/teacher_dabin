import { z } from "zod";

export const calendarEventTypes = [
  "exam",
  "holiday",
  "makeup",
  "special_class",
  "consultation",
  "personal",
  "other",
] as const;

export type CalendarEventType = (typeof calendarEventTypes)[number];

// 라벨 + 파스텔 스타일 (배지/캘린더 바) 단일 소스.
export const calendarEventMeta: Record<
  CalendarEventType,
  { label: string; badge: string; bar: string }
> = {
  exam: { label: "시험", badge: "bg-[#efe8fb] text-[#5d4ba5]", bar: "bg-[#b3a5ec]" },
  holiday: { label: "휴무", badge: "bg-[#fdeee3] text-[#a2643c]", bar: "bg-[#eebfa0]" },
  makeup: { label: "보강", badge: "bg-[#e4f4ec] text-[#3d7f64]", bar: "bg-[#8fc7ab]" },
  special_class: { label: "특강", badge: "bg-[#e8ecfa] text-[#4d5ba5]", bar: "bg-[#a8b3e6]" },
  consultation: { label: "상담", badge: "bg-[#fdf3e4] text-[#94702f]", bar: "bg-[#e3c98a]" },
  personal: { label: "개인 일정", badge: "bg-[#fbe9f0] text-[#a05a7c]", bar: "bg-[#e6a8c0]" },
  other: { label: "기타", badge: "bg-[#f1ece9] text-[#6f6157]", bar: "bg-[#c9bcb4]" },
};

export function eventMetaOf(type: string) {
  return calendarEventMeta[type as CalendarEventType] ?? calendarEventMeta.other;
}

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식을 확인해주세요.");

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시간을 선택해주세요.");

export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(1, "일정 이름을 입력해주세요.").max(100, "일정 이름은 100자 이내로 입력해주세요."),
    eventType: z.enum(calendarEventTypes, { message: "일정 종류를 선택해주세요." }),
    startDate: dateString,
    endDate: dateString.optional().or(z.literal("")),
    groupId: z.string().uuid().optional().or(z.literal("")),
    memo: z.string().trim().max(500, "메모는 500자 이내로 입력해주세요.").optional().or(z.literal("")),
    // 보강(반을 지정한 1회성 수업)일 때만 쓴다. 일반 일정은 빈 값.
    startTime: timeString.optional().or(z.literal("")),
    endTime: timeString.optional().or(z.literal("")),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: "종료일은 시작일보다 빠를 수 없어요.",
    path: ["endDate"],
  })
  .refine((value) => Boolean(value.startTime) === Boolean(value.endTime), {
    message: "수업 시작 시간과 종료 시간을 모두 선택해주세요.",
    path: ["endTime"],
  })
  .refine((value) => !value.startTime || !value.endTime || value.startTime < value.endTime, {
    message: "종료 시간은 시작 시간보다 늦어야 해요.",
    path: ["endTime"],
  })
  // 보강 수업으로 쓰려면 반과 시간이 함께 있어야 한다 (시간만 넣고 반이 없으면 수업이 아니다)
  .refine((value) => !value.startTime || Boolean(value.groupId), {
    message: "보강 수업을 등록하려면 수업 반을 선택해주세요.",
    path: ["groupId"],
  })
  // 수업은 하루짜리다 — 기간 일정에 시간을 붙이지 않는다
  .refine((value) => !value.startTime || !value.endDate || value.endDate === value.startDate, {
    message: "보강 수업은 하루 일정이에요. 종료일을 비워주세요.",
    path: ["endDate"],
  });

// 이 일정이 "그날 1회 진행하는 실제 그룹 수업(보강)"인지 — 저장/표시 양쪽이 같은 규칙을 쓴다.
export function isSupplementClass(value: {
  eventType: string;
  groupId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  startDate?: string;
  endDate?: string | null;
}) {
  return (
    value.eventType === "makeup" &&
    Boolean(value.groupId) &&
    Boolean(value.startTime) &&
    Boolean(value.endTime) &&
    (!value.endDate || !value.startDate || value.endDate === value.startDate)
  );
}

export type CalendarEventFormInput = z.infer<typeof calendarEventSchema>;
