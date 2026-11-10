import { monthLabel, monthRange } from "@/lib/calendar";
import { fillMakeupTemplate } from "@/lib/excel/makeup-export";
import { buildMakeupExportRows } from "@/lib/excel/makeup-rows";
import { monthlySheetName } from "@/lib/excel/print-layout";
import {
  excelErrorResponse as errorResponse,
  MONTH_PARAM_PATTERN,
  monthlyExportFilename,
  xlsxDownloadResponse,
} from "@/lib/excel/xlsx-response";
import { getCompletedMakeupsForExport } from "@/lib/supabase/queries/makeups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 보충 수업 Excel 내보내기 — 기존 양식("보충 수업.xlsx") template에 값만 채운다.
// - 대상: status = completed 만 (required/scheduled/cancelled 제외)
// - (파라미터 없음) 전체 완료 history — 기존 동작
// - ?month=YYYY-MM  그 달(KST 달력 월)에 실제로 보충한(completed_date) 기록만 — 월간 파일
// 행 조립/정렬은 두 경우 모두 lib/excel/makeup-rows (같은 기록 = 같은 행).
// - read-only: 어떤 makeup/attendance/daily log row도 수정하지 않는다
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return errorResponse("로그인이 필요합니다.", 401);
  }

  const month = new URL(request.url).searchParams.get("month");

  if (month !== null && !MONTH_PARAM_PATTERN.test(month)) {
    return errorResponse("내보낼 달을 확인해주세요.");
  }

  let makeups;
  let schedules;
  try {
    [makeups, schedules] = await Promise.all([
      getCompletedMakeupsForExport(month ? monthRange(month) : undefined),
      getCurrentUserSchedulesWithGroup(),
    ]);
  } catch (error) {
    console.error("makeup export query error", error);
    return errorResponse("완료된 보충 수업을 불러오지 못했어요. 다시 시도해주세요.", 500);
  }

  if (makeups.length === 0) {
    return errorResponse(
      month
        ? `${monthLabel(month)}에는 내보낼 완료된 보충 수업이 없어요.`
        : "내보낼 완료된 보충 수업이 없어요.",
    );
  }

  const rows = buildMakeupExportRows(makeups, schedules);

  let buffer: Buffer;
  try {
    buffer = await fillMakeupTemplate(
      rows,
      month
        ? { minBands: 1, sheetName: monthlySheetName(month, "보충수업"), fitToWidth: true }
        : {},
    );
  } catch (error) {
    if (error instanceof Error && error.message) {
      console.error("makeup export template error", error.message);
      return errorResponse(error.message, 500);
    }
    return errorResponse("보충 수업 엑셀을 만들지 못했어요. 다시 시도해주세요.", 500);
  }

  return month
    ? xlsxDownloadResponse(
        buffer,
        monthlyExportFilename("강사일지_보충수업", month),
        `makeups-${month}.xlsx`,
      )
    : xlsxDownloadResponse(buffer, "강사일지_보충수업.xlsx", "makeups.xlsx");
}
