// 양식 template 기반 Excel의 인쇄 레이아웃 공용 helper (서버 전용).
//
// 월간 내보내기는 원본 양식의 한 "인쇄 블록"(= A4 한 장)을 아래로 이어 붙여 만든다.
// - cloneRowBlock: 블록의 값(라벨)/스타일/행높이/병합을 그대로 복제 — 새로 그리지 않는다
// - setBlockPageBreaks: 블록 경계마다 수동 페이지 나누기 (마지막 블록 뒤에는 넣지 않음 → 빈 페이지 없음)
// - setPrintArea: 인쇄 영역 = 실제 블록 범위 (빈 행/열로 인한 빈 페이지 방지)
// exceljs 타입만 사용한다 — 런타임 import는 각 export 모듈이 담당.
import type { Worksheet } from "exceljs";

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

// "C13" + 73 → "C86" (블록 offset만큼 아래로 옮긴 같은 양식 칸)
export function offsetAddress(address: string, rowOffset: number) {
  const match = /^([A-Z]+)(\d+)$/i.exec(address);
  if (!match) {
    throw new Error(`잘못된 셀 주소예요: ${address}`);
  }
  return `${match[1]}${Number(match[2]) + rowOffset}`;
}

// 블록 [fromRow, fromRow + rowCount) 안에 완전히 들어 있는 병합 범위
export function mergesWithin(sheet: Worksheet, fromRow: number, rowCount: number): CellRange[] {
  const lastRow = fromRow + rowCount - 1;
  return sheet.model.merges
    .map(parseRange)
    .filter((range) => range.top >= fromRow && range.bottom <= lastRow);
}

// 블록 복제 — 행높이/스타일/라벨 값/병합을 원본 그대로 toRow부터 다시 만든다.
// 병합은 mergeCellsWithoutStyle: 병합된 칸들의 개별 테두리를 master 스타일로 덮어쓰지 않는다.
export function cloneRowBlock(
  sheet: Worksheet,
  block: { fromRow: number; rowCount: number; columnCount: number; merges: CellRange[] },
  toRow: number,
) {
  for (let offset = 0; offset < block.rowCount; offset += 1) {
    const source = sheet.getRow(block.fromRow + offset);
    const target = sheet.getRow(toRow + offset);
    target.height = source.height;
    for (let column = 1; column <= block.columnCount; column += 1) {
      const sourceCell = source.getCell(column);
      const targetCell = target.getCell(column);
      targetCell.style = sourceCell.style;
      // 병합의 master 칸에만 값이 있다 (나머지 칸은 병합 후 master를 가리킨다)
      const isMergeSlave = sourceCell.isMerged && sourceCell.master.address !== sourceCell.address;
      if (!isMergeSlave && sourceCell.value !== null && sourceCell.value !== undefined) {
        targetCell.value = sourceCell.value;
      }
    }
  }

  const shift = toRow - block.fromRow;
  for (const range of block.merges) {
    sheet.mergeCellsWithoutStyle(range.top + shift, range.left, range.bottom + shift, range.right);
  }
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
