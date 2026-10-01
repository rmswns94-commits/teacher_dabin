import { CalendarClock } from "lucide-react";

import { describeExamAutoOff, type ExamAutoOffResult } from "@/lib/exam-mode-auto-off";

// 그룹 상세(시험 대비 ON)의 compact 자동 종료 상태 — resolver 결과만 표시 (mutation과 같은 계산, 추가 쿼리 없음)
const STATUS_LABEL: Record<ExamAutoOffResult["schools"][number]["status"], string> = {
  ended: "종료",
  not_ended: "진행·예정",
  unknown: "시험 일정 없음",
};

function shortDate(date: string | null) {
  if (!date) {
    return "";
  }
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function ExamAutoOffStatus({ result }: { result: ExamAutoOffResult }) {
  const { headline, detail } = describeExamAutoOff(result);
  if (!headline) {
    return null;
  }
  return (
    <div data-exam-auto-off-status data-eligible={result.eligible ? "true" : "false"} className="rounded-2xl bg-[#faf6f3] px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-[#7a4f2e]">
        <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
        {headline}
      </div>
      {detail ? <p className="caption-text mt-0.5 text-[#8a7b77]">{detail}</p> : null}
      {result.schools.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {result.schools.map((school) => (
            <li key={school.school} data-school-status={school.status} className="caption-text text-[#655d5d]">
              {school.school} ·{" "}
              {school.status === "unknown"
                ? STATUS_LABEL.unknown
                : `${school.endDate ? `${shortDate(school.endDate)} ` : ""}${STATUS_LABEL[school.status]}`}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
