// 교사일지 Excel 내보내기 — 기존 양식(20260901화~02수11.xlsx) template 기반.
//
// 새 workbook을 그리지 않고, 원본 1일차 섹션을 스타일째 복제한 clean template
// (templates/teacher-log-template.xlsx, 코드에는 base64로 내장)을 load한 뒤
// 값만 채운다 → 병합/테두리/폰트/열너비/행높이/인쇄 설정이 원본 그대로 유지된다.
//
// exceljs는 서버(route handler)에서만 import한다.
import ExcelJS from "exceljs";

import { addWorksheetCopy, fitToSinglePage } from "./print-layout";
import { teacherLogTemplateBase64 } from "./teacher-log-template-data";
import { estimateWrappedLines } from "./text-fit";

// ---- Business constants (요구사항 고정값 — 한 곳에서 관리) ----
export const TEACHER_LOG_CONSTANTS = {
  TEACHER_NAME: "김다빈",
  CLOCK_IN_DISPLAY: "2:00", // template 셀에 이미 원본 시간값(h:mm)으로 들어 있음
  CLOCK_OUT_DISPLAY: "9:20",
  MAX_PERIODS: 7,
} as const;

// ---- Template cell 좌표 (원본 workbook 분석 결과 — hard-code 분산 금지) ----
const periodAnchor = (index: number) => {
  const row = 13 + index * 8; // 1교시 13행부터 8행 병합 밴드
  return {
    period: index + 1,
    row,
    timeCell: `C${row}`,
    textbookCell: `E${row}`,
    progressCell: `L${row}`,
    noteCell: `AN${row}`,
  };
};

export const TEACHER_LOG_TEMPLATE = {
  sheetName: "교사일지",
  dateCell: "A5",
  teacherCell: "H7",
  // template drift guard용 필수 anchor
  guards: [
    { cell: "A11", value: "교시" },
    { cell: "A71", value: "출근시간" },
  ],
  clockInCell: "I71",
  clockOutCell: "AE71",
  periods: Array.from({ length: TEACHER_LOG_CONSTANTS.MAX_PERIODS }, (_, index) =>
    periodAnchor(index),
  ),
} as const;

// 교시 칸 자동 높이 — 원본 양식은 교시당 8행 고정이라 진도/교재가 길면 인쇄에서 잘린다.
// 넘칠 때만 그 교시의 8행을 같은 비율로 늘린다 (줄이지 않음 → 내용이 짧은 날은 원본과 완전히 같다).
// Excel 실측: NanumGothic 8pt 한 줄 ≈ 10pt, 진도 칸 폭 350pt / 교재 칸 폭 70pt,
// 이 양식의 XML 행높이는 Excel에서 0.67배로 그려진다(10.75 → 7.2pt) — 필요한 높이를 그 비율로 환산.
const PERIOD_FIT = {
  rows: 8,
  fontSizePt: 8,
  lineHeightPt: 10,
  paddingPt: 6, // 위아래 여백 — 첫/마지막 줄이 칸 테두리에 붙지 않게 (5줄까지는 원래 칸 그대로)
  excelRowScale: 0.67,
  textbookWidthPt: 70,
  progressWidthPt: 350,
  defaultRowHeight: 10.75,
} as const;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// DB "14:30:00" → 원본 표기 "2:30" (12시간제, 오전/오후 없음, 12시는 12 유지)
export function toTemplateClock(time: string) {
  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Number(hourRaw);
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minuteRaw}`;
}

// 원본과 동일한 multiline 시간 표기: "3:20\n~\n4:20"
export function formatPeriodTime(startTime: string, endTime: string) {
  return `${toTemplateClock(startTime)}\n~\n${toTemplateClock(endTime)}`;
}

// 원본과 동일한 날짜 표기: "2026 . 09 . 03 ( 목 )"
export function formatDateLabel(ymd: string, dayOfWeek: number) {
  const [year, month, day] = ymd.split("-");
  return `${year} . ${month} . ${day} ( ${WEEKDAYS[dayOfWeek]} )`;
}

export type TeacherLogExportRow = {
  startTime: string; // "HH:MM(:SS)"
  endTime: string;
  textbook: string;
  progress: string;
};

export type TeacherLogExportData = {
  dateLabel: string;
  rows: TeacherLogExportRow[]; // 시작 시간순, 최대 7개 (1교시부터 채움)
};

async function loadTeacherLogTemplate() {
  const workbook = new ExcelJS.Workbook();
  // exceljs 타입 정의가 구버전 Node Buffer 시그니처라 파라미터 타입으로만 맞춘다 (런타임 동일)
  type XlsxLoadInput = Parameters<(typeof workbook.xlsx)["load"]>[0];
  await workbook.xlsx.load(Buffer.from(teacherLogTemplateBase64, "base64") as unknown as XlsxLoadInput);

  const sheet = workbook.getWorksheet(TEACHER_LOG_TEMPLATE.sheetName);

  // Template drift guard: 잘못된 template이면 엉뚱한 셀에 쓰지 않고 즉시 실패
  if (!sheet || TEACHER_LOG_TEMPLATE.guards.some((g) => sheet.getCell(g.cell).value !== g.value)) {
    throw new Error("교사일지 template이 올바르지 않아요.");
  }

  return { workbook, sheet };
}

function assertPeriodLimit(data: TeacherLogExportData) {
  if (data.rows.length > TEACHER_LOG_CONSTANTS.MAX_PERIODS) {
    throw new Error("교사일지는 하루 최대 7교시까지 내보낼 수 있어요.");
  }
}

// 내용이 교시 칸보다 길면 그 교시의 8행 높이를 비율대로 늘린다 (잘려서 안 보이는 내용 없게)
function fitPeriodBand(sheet: ExcelJS.Worksheet, firstRow: number, row: TeacherLogExportRow) {
  const lines = Math.max(
    estimateWrappedLines(row.textbook, PERIOD_FIT.textbookWidthPt, PERIOD_FIT.fontSizePt),
    estimateWrappedLines(row.progress, PERIOD_FIT.progressWidthPt, PERIOD_FIT.fontSizePt),
  );
  const neededPt = lines * PERIOD_FIT.lineHeightPt + PERIOD_FIT.paddingPt;
  const bandRows = Array.from({ length: PERIOD_FIT.rows }, (_, index) => sheet.getRow(firstRow + index));
  const currentHeight = bandRows.reduce(
    (sum, bandRow) => sum + (bandRow.height ?? PERIOD_FIT.defaultRowHeight),
    0,
  );
  const scale = neededPt / (currentHeight * PERIOD_FIT.excelRowScale);
  if (scale <= 1) {
    return;
  }
  for (const bandRow of bandRows) {
    // 0.25pt 단위 올림 — 원래 얇은 구분 행은 얇은 비율 그대로
    bandRow.height = Math.ceil((bandRow.height ?? PERIOD_FIT.defaultRowHeight) * scale * 4) / 4;
  }
}

// 하루치 값 채우기 — 일 단위/월 단위가 같은 함수를 쓴다 (출력 내용 drift 방지).
// 하루 = 시트 1개 = 양식 1장. "한 페이지에 맞춤"으로 어느 앱에서 인쇄해도 한 장에 들어간다
// (앱마다 행 높이/열 너비를 다르게 그려 Windows에선 남는 양식이 맥·아이패드에선 넘칠 수 있어,
//  고정 배율 대신 인쇄하는 앱이 직접 한 장에 맞추게 한다 — 짧은 날은 축소 없이 원본 크기).
function writeTeacherLogDay(sheet: ExcelJS.Worksheet, data: TeacherLogExportData) {
  sheet.getCell(TEACHER_LOG_TEMPLATE.dateCell).value = data.dateLabel;
  sheet.getCell(TEACHER_LOG_TEMPLATE.teacherCell).value = TEACHER_LOG_CONSTANTS.TEACHER_NAME;

  // 값만 clear 후 채움 (스타일/병합은 건드리지 않는다 — template은 이미 clean이지만 방어적으로)
  TEACHER_LOG_TEMPLATE.periods.forEach((anchor, index) => {
    const row = data.rows[index];
    sheet.getCell(anchor.timeCell).value = row ? formatPeriodTime(row.startTime, row.endTime) : null;
    sheet.getCell(anchor.textbookCell).value = row?.textbook ? row.textbook : null;
    sheet.getCell(anchor.progressCell).value = row?.progress ? row.progress : null;
    sheet.getCell(anchor.noteCell).value = null; // 비고는 이번 요구에서 항상 blank
    if (row) {
      fitPeriodBand(sheet, anchor.row, row);
    }
  });

  // 출근 2:00 / 퇴근 9:20은 template 원본 셀 값(h:mm 시간값)을 그대로 유지한다.
  fitToSinglePage(sheet);
}

export async function fillTeacherLogTemplate(data: TeacherLogExportData) {
  assertPeriodLimit(data);

  const { workbook, sheet } = await loadTeacherLogTemplate();
  writeTeacherLogDay(sheet, data);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

const SHEET_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 월간 시트 이름 — "2026-11-02" → "11-02(월)" (date-only 문자열에서 바로, 요일은 UTC 정오 기준)
export function teacherLogSheetName(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = SHEET_WEEKDAYS[new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()];
  return `${date.slice(5, 7)}-${date.slice(8, 10)}(${weekday})`;
}

// 월간 교사일지 — 기록이 있는 날짜마다 원본 양식 시트 1개 (날짜 오름차순 = 시트 순서).
// 시트마다 "한 페이지에 맞춤"이라 어느 앱에서든 날짜 하나 = 정확히 한 장이고,
// "통합 문서 전체"를 양면 인쇄하면 날짜 순서대로 앞/뒤가 이어진다.
// (한 시트에 이어 붙이고 "세로 N장 맞춤"을 쓰면 Excel이 날짜 경계 페이지 나누기를 무시해
//  날짜가 섞이므로 — Excel에서 확인 — 날짜별 시트로 나눈다)
export async function fillMonthlyTeacherLogTemplate(
  days: (TeacherLogExportData & { date: string })[], // 날짜 오름차순, 기록이 있는 날짜만
) {
  if (days.length === 0) {
    throw new Error("내보낼 수업 기록이 없어요.");
  }
  days.forEach(assertPeriodLimit);

  const { workbook, sheet: template } = await loadTeacherLogTemplate();

  // 값을 채우기 전에 clean template을 날짜 수만큼 복제한다 (첫 날짜는 template 시트 자체)
  const sheets = days.map((day, index) =>
    index === 0 ? template : addWorksheetCopy(workbook, template, teacherLogSheetName(day.date)),
  );
  template.name = teacherLogSheetName(days[0].date);

  days.forEach((day, index) => writeTeacherLogDay(sheets[index], day));

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
