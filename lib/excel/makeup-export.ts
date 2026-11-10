// 보충 수업 Excel 내보내기 — 기존 양식("보충 수업.xlsx") template 기반.
//
// 새 workbook을 그리지 않고 원본 template(templates/makeup-template.xlsx, 코드에는
// base64로 내장)을 load한 뒤 값만 채운다 — 제목/병합/테두리/폰트/열너비/행높이/
// 인쇄 설정(A4 세로, 가로 가운데)이 원본 그대로 유지된다.
//
// 원본 구조: 25행 "밴드" × 2개 (R1~R25, R26~R50).
// 밴드 = [제목 "보 충 수 업"(A:F 병합) | 헤더(날짜/수업시간/이름/보충 내용(D:E)/결석일)
//        | 데이터 22행(행마다 D:E 병합) | 빈 구분행(A:F 병합)]
// 완료 기록이 44건(2밴드)을 넘으면 두 번째 밴드의 스타일/병합/행높이를 그대로 복제해
// 밴드를 뒤에 이어붙인다 — 다음 페이지에서도 제목+헤더가 동일 양식으로 반복된다.
// 밴드 = 인쇄 1페이지: 밴드 경계마다 수동 페이지 나누기, 인쇄 영역 = 실제 밴드 범위
// (여러 줄 내용으로 밴드가 길어져도 다음 밴드는 항상 새 페이지의 제목부터 시작한다).
//
// exceljs는 서버(route handler)에서만 import한다.
import ExcelJS from "exceljs";

import { makeupTemplateBase64 } from "./makeup-template-data";
import { fitToPageWidth, mergesWithin, setBlockPageBreaks, setPrintArea } from "./print-layout";

export const MAKEUP_TEMPLATE = {
  sheetName: "보충수업",
  bandSize: 25, // 제목 1 + 헤더 1 + 데이터 22 + 구분행 1
  dataRowsPerBand: 22,
  templateBands: 2,
  columns: { date: 1, time: 2, name: 3, content: 4, absence: 6 }, // D:E 병합 → D(4)에 기록
  guards: [
    { cell: "A2", value: "날짜" },
    { cell: "B2", value: "수업시간" },
    { cell: "C2", value: "이름" },
    { cell: "D2", value: "보충 내용" },
    { cell: "F2", value: "결석일" },
  ],
} as const;

export type MakeupExportRow = {
  date: string; // 실제 보충 진행일 (completed_date, YYYY-MM-DD) — 없으면 ""
  timeLabel: string; // 원래 결석 수업 그룹의 해당 요일 수업시간 ("17:00 ~ 18:30") — 없으면 ""
  name: string; // Student.name
  content: string; // 놓친 진도 snapshot (multiline 그대로)
  absenceDate: string; // 원래 결석 lesson_date — 직접 등록 보충은 결석이 아니므로 ""
};

// 완료된 보충 record 1건 = Excel row 1개 (이름 기준 merge/dedupe 없음)
// options.minBands: 전체 완료 기록 export는 원본처럼 2밴드(2페이지) 유지(기본값),
//   월간 export는 1 — 필요한 밴드만 남겨 빈 양식 페이지를 인쇄하지 않는다.
// options.sheetName: 월간 시트 이름 ("11월 보충수업")
// options.fitToWidth: 월간 — 가로 1페이지 맞춤(세로 자동). 원본 양식은 A4 세로 인쇄 폭보다 조금 넓어
//   Excel에서 가로로 두 장으로 잘리므로 축소해 한 장 폭에 맞춘다 (수동 페이지 나누기는 유지됨).
export async function fillMakeupTemplate(
  rows: MakeupExportRow[],
  options: { minBands?: number; sheetName?: string; fitToWidth?: boolean } = {},
) {
  if (rows.length === 0) {
    throw new Error("내보낼 완료된 보충 수업이 없어요.");
  }

  const workbook = new ExcelJS.Workbook();
  type XlsxLoadInput = Parameters<(typeof workbook.xlsx)["load"]>[0];
  await workbook.xlsx.load(Buffer.from(makeupTemplateBase64, "base64") as unknown as XlsxLoadInput);

  const sheet = workbook.getWorksheet(MAKEUP_TEMPLATE.sheetName);
  if (!sheet) {
    throw new Error("보충 수업 template을 찾을 수 없어요.");
  }

  // template drift guard — 구조가 바뀌었으면 잘못된 위치에 쓰지 않고 바로 실패
  for (const guard of MAKEUP_TEMPLATE.guards) {
    if (String(sheet.getCell(guard.cell).value ?? "").trim() !== guard.value) {
      throw new Error(`보충 수업 template 형식이 예상과 달라요. (${guard.cell})`);
    }
  }

  const { bandSize, dataRowsPerBand, templateBands, columns } = MAKEUP_TEMPLATE;
  const bandsNeeded = Math.max(
    options.minBands ?? templateBands,
    Math.ceil(rows.length / dataRowsPerBand),
  );

  // 필요한 밴드가 template보다 적으면(월간 22건 이하) 남는 template 밴드를 병합째 비운다.
  // (exceljs spliceRows는 시트 끝 행 삭제가 동작하지 않아 값/스타일/행높이를 지운다 —
  //  빈 행만 남고 인쇄 영역 밖이라 인쇄되지 않는다)
  if (bandsNeeded < templateBands) {
    const firstUnused = bandsNeeded * bandSize + 1;
    const unusedRows = (templateBands - bandsNeeded) * bandSize;
    for (const range of mergesWithin(sheet, firstUnused, unusedRows)) {
      sheet.unMergeCells(range.top, range.left, range.bottom, range.right);
    }
    for (let rowNumber = firstUnused; rowNumber < firstUnused + unusedRows; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      row.height = undefined as unknown as number;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.value = null;
        cell.style = {};
      });
    }
  }

  // 44건 초과: 두 번째 밴드(R26~R50)를 스타일 원본으로 밴드를 뒤에 복제한다.
  // 스타일/행높이/제목·헤더 값을 먼저 복사한 뒤 병합(A:F 제목/구분행, D:E 헤더+데이터)을 건다.
  const styleBandTop = bandSize + 1; // R26
  for (let band = templateBands; band < bandsNeeded; band += 1) {
    const top = band * bandSize + 1;
    for (let offset = 0; offset < bandSize; offset += 1) {
      const src = sheet.getRow(styleBandTop + offset);
      const dst = sheet.getRow(top + offset);
      dst.height = src.height;
      for (let col = 1; col <= 6; col += 1) {
        const srcCell = src.getCell(col);
        const dstCell = dst.getCell(col);
        dstCell.style = srcCell.style;
        if (srcCell.value !== null && srcCell.value !== undefined) {
          dstCell.value = srcCell.value; // 제목/헤더 라벨
        }
      }
    }
    sheet.mergeCells(top, 1, top, 6); // 제목 A:F
    sheet.mergeCells(top + 1, 4, top + 1, 5); // 헤더 "보충 내용" D:E
    for (let dataRow = 0; dataRow < dataRowsPerBand; dataRow += 1) {
      sheet.mergeCells(top + 2 + dataRow, 4, top + 2 + dataRow, 5);
    }
    sheet.mergeCells(top + bandSize - 1, 1, top + bandSize - 1, 6); // 구분행 A:F
  }

  rows.forEach((row, index) => {
    const band = Math.floor(index / dataRowsPerBand);
    const rowNumber = band * bandSize + 3 + (index % dataRowsPerBand);
    sheet.getCell(rowNumber, columns.date).value = row.date;
    sheet.getCell(rowNumber, columns.time).value = row.timeLabel;
    sheet.getCell(rowNumber, columns.name).value = row.name;
    sheet.getCell(rowNumber, columns.content).value = row.content;
    sheet.getCell(rowNumber, columns.absence).value = row.absenceDate;

    // 놓친 진도 multiline: 줄바꿈 그대로 + wrap — 여러 줄인 행만 높이를 늘린다
    // (한 줄 데이터/빈 행은 원본 행높이 30 유지)
    const lines = row.content.split("\n").length;
    if (lines > 1) {
      const cell = sheet.getCell(rowNumber, columns.content);
      cell.style = { ...cell.style, alignment: { ...cell.style.alignment, wrapText: true } };
      sheet.getRow(rowNumber).height = Math.max(30, lines * 16 + 6);
    }
  });

  // 밴드 = 인쇄 1페이지 — 밴드 경계마다 수동 페이지 나누기(마지막 뒤에는 없음), 인쇄 영역 = 밴드 범위
  setBlockPageBreaks(sheet, bandSize, bandsNeeded);
  setPrintArea(sheet, 6, bandSize * bandsNeeded);
  if (options.sheetName) {
    sheet.name = options.sheetName;
  }

  // 인쇄 설정을 원본과 동일하게 유지 — 원본 XML은
  // <pageSetup paperSize="9" orientation="portrait"/> 뿐인데 exceljs가 load 시
  // 기본값(scale/fitToWidth 등)을 merge해 저장 때 원본에 없던 attribute를 함께 쓴다.
  // 일부 뷰어가 fitTo* 존재를 "페이지 맞춤"으로 해석하므로 원본에 없는 key는 제거한다.
  const pageSetup = sheet.pageSetup as unknown as Record<string, unknown>;
  for (const key of [
    "scale",
    "fitToPage",
    "fitToWidth",
    "fitToHeight",
    "firstPageNumber",
    "useFirstPageNumber",
    "copies",
    "horizontalDpi",
    "verticalDpi",
  ]) {
    delete pageSetup[key];
  }
  if (options.fitToWidth) {
    fitToPageWidth(sheet);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
