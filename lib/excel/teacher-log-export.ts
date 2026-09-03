// 교사일지 Excel 내보내기 — 기존 양식(20260901화~02수11.xlsx) template 기반.
//
// 새 workbook을 그리지 않고, 원본 1일차 섹션을 스타일째 복제한 clean template
// (templates/teacher-log-template.xlsx, 코드에는 base64로 내장)을 load한 뒤
// 값만 채운다 → 병합/테두리/폰트/열너비/행높이/인쇄 설정이 원본 그대로 유지된다.
//
// exceljs는 서버(route handler)에서만 import한다.
import ExcelJS from "exceljs";

import { teacherLogTemplateBase64 } from "./teacher-log-template-data";

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

export async function fillTeacherLogTemplate(data: TeacherLogExportData) {
  if (data.rows.length > TEACHER_LOG_CONSTANTS.MAX_PERIODS) {
    throw new Error("교사일지는 하루 최대 7교시까지 내보낼 수 있어요.");
  }

  const workbook = new ExcelJS.Workbook();
  // exceljs 타입 정의가 구버전 Node Buffer 시그니처라 파라미터 타입으로만 맞춘다 (런타임 동일)
  type XlsxLoadInput = Parameters<(typeof workbook.xlsx)["load"]>[0];
  await workbook.xlsx.load(Buffer.from(teacherLogTemplateBase64, "base64") as unknown as XlsxLoadInput);

  const sheet = workbook.getWorksheet(TEACHER_LOG_TEMPLATE.sheetName);

  // Template drift guard: 잘못된 template이면 엉뚱한 셀에 쓰지 않고 즉시 실패
  if (!sheet || TEACHER_LOG_TEMPLATE.guards.some((g) => sheet.getCell(g.cell).value !== g.value)) {
    throw new Error("교사일지 template이 올바르지 않아요.");
  }

  sheet.getCell(TEACHER_LOG_TEMPLATE.dateCell).value = data.dateLabel;
  sheet.getCell(TEACHER_LOG_TEMPLATE.teacherCell).value = TEACHER_LOG_CONSTANTS.TEACHER_NAME;

  // 값만 clear 후 채움 (스타일/병합은 건드리지 않는다 — template은 이미 clean이지만 방어적으로)
  TEACHER_LOG_TEMPLATE.periods.forEach((anchor, index) => {
    const row = data.rows[index];
    sheet.getCell(anchor.timeCell).value = row
      ? formatPeriodTime(row.startTime, row.endTime)
      : null;
    sheet.getCell(anchor.textbookCell).value = row?.textbook ? row.textbook : null;
    sheet.getCell(anchor.progressCell).value = row?.progress ? row.progress : null;
    sheet.getCell(anchor.noteCell).value = null; // 비고는 이번 요구에서 항상 blank
  });

  // 출근 2:00 / 퇴근 9:20은 template 원본 셀 값(h:mm 시간값)을 그대로 유지한다.

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
