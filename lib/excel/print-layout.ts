// 양식 template 기반 Excel의 인쇄 레이아웃 공용 helper (서버 전용).
//
// - addWorksheetCopy: 양식 시트를 같은 workbook 안에 통째로 복제 (값/스타일/행높이/열너비/병합/인쇄 설정)
// - fitToSinglePage: 시트 = 한 장 맞춤 (교사일지 — 어느 앱에서든 날짜 하나가 한 장)
// - setBlockPageBreaks: 블록(밴드) 경계마다 수동 페이지 나누기 (마지막 블록 뒤에는 넣지 않음 → 빈 페이지 없음)
// - setPrintArea: 인쇄 영역 = 실제 블록 범위 (빈 행/열로 인한 빈 페이지 방지)
// - fitToPageWidth: 가로 1페이지 맞춤(세로 자동) — 보충 수업 밴드 페이지 나누기와 함께
// exceljs 타입만 사용한다 — 런타임 import는 각 export 모듈이 담당.
import type { Workbook, Worksheet, WorksheetModel } from "exceljs";

export type CellRange = { top: number; left: number; bottom: number; right: number };

// "AU" → 47
function columnNumber(letters: string) {
  return [...letters.toUpperCase()].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

// 47 → "AU"
export function columnLetter(column: number) {
  let result = "";
  let rest = column;
  while (rest > 0) {
    const remainder = (rest - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    rest = Math.floor((rest - 1) / 26);
  }
  return result;
}

// "A1:AU3" / "A1" → 숫자 좌표
export function parseRange(range: string): CellRange {
  const [start, end = start] = range.split(":");
  const parse = (address: string) => {
    const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(address.trim());
    if (!match) {
      throw new Error(`잘못된 셀 주소예요: ${address}`);
    }
    return { column: columnNumber(match[1]), row: Number(match[2]) };
  };
  const a = parse(start);
  const b = parse(end);
  return {
    top: Math.min(a.row, b.row),
    left: Math.min(a.column, b.column),
    bottom: Math.max(a.row, b.row),
    right: Math.max(a.column, b.column),
  };
}

// 블록 [fromRow, fromRow + rowCount) 안에 완전히 들어 있는 병합 범위
export function mergesWithin(sheet: Worksheet, fromRow: number, rowCount: number): CellRange[] {
  const lastRow = fromRow + rowCount - 1;
  return sheet.model.merges
    .map(parseRange)
    .filter((range) => range.top >= fromRow && range.bottom <= lastRow);
}

// 양식 시트를 같은 workbook에 복제 — exceljs의 model 왕복으로 행/셀 값·스타일/열너비/병합을 옮긴다.
// (model setter는 병합을 mergeCellsWithoutStyle로 다시 건다 — master 스타일로 덮어쓰지 않음.)
// 인쇄 설정/보기/속성 객체는 model이 원본과 같은 참조를 넘기므로 복사해서 시트마다 독립시킨다.
// 복제본은 탭 선택을 끈다 — 여러 시트가 선택(그룹)된 채 열리면 편집이 전 시트에 적용되기 때문.
export function addWorksheetCopy(workbook: Workbook, source: Worksheet, name: string) {
  const model = source.model as WorksheetModel & { merges: string[] };
  const copy = workbook.addWorksheet(name);
  copy.model = {
    ...model,
    id: copy.id,
    name,
    mergeCells: model.merges,
    pageSetup: structuredClone(model.pageSetup),
    properties: structuredClone(model.properties),
    views: (model.views ?? []).map((view) => ({ ...view, tabSelected: false })),
  } as WorksheetModel;
  // exceljs의 행 model setter는 병합 칸(첫 칸 외)을 건너뛰어 그 칸들의 스타일이 빠진다 —
  // 병합 영역 오른쪽/아래 테두리가 사라지지 않게 모든 칸의 스타일을 원본에서 다시 입힌다.
  source.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      copy.getCell(rowNumber, columnNumber).style = cell.style;
    });
  });
  return copy;
}

// 시트 전체(인쇄 영역)를 한 장에 맞춤 — 축소만 하고 확대는 하지 않는다 (Excel 규칙).
export function fitToSinglePage(sheet: Worksheet) {
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 1;
}

// blockCount개 블록(각 blockSize행, 1행부터 연속) 사이에 수동 페이지 나누기.
// 마지막 블록 뒤에는 넣지 않는다 — 끝에 빈 페이지가 생기지 않게.
export function setBlockPageBreaks(sheet: Worksheet, blockSize: number, blockCount: number) {
  for (let block = 1; block < blockCount; block += 1) {
    sheet.getRow(block * blockSize).addPageBreak(0, 16384);
  }
}

// 가로 1페이지 맞춤(세로는 자동) — 양식이 프린터 인쇄 폭보다 넓어도 가로로 두 장으로 잘리지 않게.
// Excel은 맞춤 배율을 축소 방향으로만 적용하고(100% 초과 확대 없음), 세로가 "자동"이면
// 수동 페이지 나누기를 그대로 지킨다 (Excel 인쇄 미리보기로 확인: 블록마다 새 페이지 유지).
export function fitToPageWidth(sheet: Worksheet) {
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;
}

// 인쇄 영역 = A1 ~ (마지막 열, 마지막 행)
export function setPrintArea(sheet: Worksheet, lastColumn: number, lastRow: number) {
  sheet.pageSetup.printArea = `A1:${columnLetter(lastColumn)}${lastRow}`;
}

// 월간 시트 이름 — "2026-11" + "교사일지" → "11월 교사일지" (Excel 시트명 31자 제한 안)
export function monthlySheetName(month: string, title: string) {
  return `${Number(month.slice(5, 7))}월 ${title}`;
}
