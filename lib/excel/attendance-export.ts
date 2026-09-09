// 월간 출석부 Excel 내보내기 — 기존 양식(출석부.xlsx) template 기반.
//
// 새 workbook을 그리지 않고, 원본에서 샘플 데이터만 지운 clean template
// (templates/attendance-template.xlsx, 코드에는 base64로 내장)을 load한 뒤 값만 채운다
// → 병합/테두리/폰트/열너비/행높이/인쇄(가로, A1:AJ 인쇄영역) 설정이 원본 그대로 유지된다.
//
// 원본 구조: 24행 "밴드"(=인쇄 1페이지) × 4개, 밴드마다 10명짜리 반 블록 2개.
// 밴드 = [제목행 | 여백 | 열머리글(No./수업시간/이름/학년/수강료납부일/1~31) | 블록×2 | 범례]
// 범례(출석 O · 지각 △ · 조퇴 Φ · 결석 X)와 "담당교사 : 김다빈 (Harvard)"는 template 고정값.
//
// exceljs는 서버(route handler)에서만 import한다.
import ExcelJS from "exceljs";

import { attendanceTemplateBase64 } from "./attendance-template-data";

export const ATTENDANCE_TEMPLATE = {
  sheetName: "출석부",
  // 각 밴드의 제목행 (병합 A:C — "YYYY 년       MM 월"을 채운다)
  bandHeaderRows: [1, 25, 49, 74],
  // 각 밴드의 마지막 행(범례) — 사용한 밴드까지의 인쇄 영역 계산용
  bandLastRows: [24, 48, 72, 97],
  // 밴드 1/2/3의 시작 행 (뒤쪽 미사용 밴드 제거용 — 밴드3은 r73 여백행 포함)
  bandTrimStartRows: [25, 49, 73],
  lastRow: 97,
  lastColumn: 36, // AJ
  // 반 블록의 첫 행 (블록당 10행, No. 1~10은 template에 고정)
  blockStartRows: [4, 14, 28, 38, 52, 62, 77, 87],
  blockSize: 10,
  maxBlocks: 8,
  timeColumn: 2, // B — 수업시간 (블록 첫 행에만)
  nameColumn: 3, // C
  gradeColumn: 4, // D
  dayStartColumn: 6, // F = 1일 → 일(day) d의 열 = 5 + d
  guards: [
    { cell: "A3", value: "No." },
    { cell: "B3", value: "수업시간" },
  ],
} as const;

// DB "14:30:00" → 원본 표기 "2:30" (12시간제, 오전/오후 없음, 12시는 12 유지)
export function toAttendanceClock(time: string) {
  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Number(hourRaw);
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minuteRaw}`;
}

// 원본 수업시간 표기: "2:30-3:20" (요일 없이 시간만)
export function formatAttendanceTimeRange(startTime: string, endTime: string) {
  return `${toAttendanceClock(startTime.slice(0, 5))}-${toAttendanceClock(endTime.slice(0, 5))}`;
}

export type AttendanceExportStudent = {
  name: string;
  gradeLabel: string;
  // 일(day of month) → 기호(O/△/Φ/X). 기록 없는 날은 키 없음 → 공란.
  marks: Map<number, string>;
};

export type AttendanceExportGroup = {
  timeLabel: string;
  students: AttendanceExportStudent[];
};

export type AttendanceExportBlock = {
  timeLabel: string;
  students: AttendanceExportStudent[]; // blockSize 이하
};

// 반 → 10명 블록으로 나눈다 (10명 초과 반은 이어지는 블록에 같은 수업시간 표기).
export function chunkAttendanceGroups(groups: AttendanceExportGroup[]): AttendanceExportBlock[] {
  const blocks: AttendanceExportBlock[] = [];

  for (const group of groups) {
    if (group.students.length === 0) {
      continue;
    }
    for (let i = 0; i < group.students.length; i += ATTENDANCE_TEMPLATE.blockSize) {
      blocks.push({
        timeLabel: group.timeLabel,
        students: group.students.slice(i, i + ATTENDANCE_TEMPLATE.blockSize),
      });
    }
  }

  return blocks;
}

export async function fillAttendanceTemplate({
  year,
  month,
  blocks,
}: {
  year: number;
  month: number; // 1~12
  blocks: AttendanceExportBlock[];
}) {
  if (blocks.length === 0) {
    throw new Error("내보낼 출결 기록이 없어요.");
  }
  if (blocks.length > ATTENDANCE_TEMPLATE.maxBlocks) {
    throw new Error(
      `출석부 양식에는 반 칸이 최대 ${ATTENDANCE_TEMPLATE.maxBlocks}개예요. (한 칸 ${ATTENDANCE_TEMPLATE.blockSize}명) 이번 달은 ${blocks.length}칸이 필요해서 내보내지 못했어요.`,
    );
  }

  const workbook = new ExcelJS.Workbook();
  // exceljs 타입 정의가 구버전 Node Buffer 시그니처라 파라미터 타입으로만 맞춘다 (런타임 동일)
  type XlsxLoadInput = Parameters<(typeof workbook.xlsx)["load"]>[0];
  await workbook.xlsx.load(
    Buffer.from(attendanceTemplateBase64, "base64") as unknown as XlsxLoadInput,
  );

  const sheet = workbook.getWorksheet(ATTENDANCE_TEMPLATE.sheetName);
  if (!sheet) {
    throw new Error("출석부 template을 찾을 수 없어요.");
  }

  // template drift guard — 구조가 바뀌었으면 잘못된 위치에 쓰지 않고 바로 실패
  for (const guard of ATTENDANCE_TEMPLATE.guards) {
    if (sheet.getCell(guard.cell).value !== guard.value) {
      throw new Error(`출석부 template 형식이 예상과 달라요. (${guard.cell})`);
    }
  }

  const bandsUsed = Math.max(1, Math.ceil(blocks.length / 2));
  const monthText = `${year} 년       ${String(month).padStart(2, "0")} 월`;

  for (let band = 0; band < bandsUsed; band += 1) {
    sheet.getCell(ATTENDANCE_TEMPLATE.bandHeaderRows[band], 1).value = monthText;
  }

  blocks.forEach((block, blockIndex) => {
    const startRow = ATTENDANCE_TEMPLATE.blockStartRows[blockIndex];
    sheet.getCell(startRow, ATTENDANCE_TEMPLATE.timeColumn).value = block.timeLabel;

    block.students.forEach((student, studentIndex) => {
      const row = startRow + studentIndex;
      sheet.getCell(row, ATTENDANCE_TEMPLATE.nameColumn).value = student.name;
      sheet.getCell(row, ATTENDANCE_TEMPLATE.gradeColumn).value = student.gradeLabel;

      for (const [day, symbol] of student.marks) {
        if (day >= 1 && day <= 31) {
          sheet.getCell(row, ATTENDANCE_TEMPLATE.dayStartColumn + day - 1).value = symbol;
        }
      }
    });
  });

  // 미사용 밴드 정리: 병합 해제 → 값/스타일 제거 → 행 숨김.
  // (exceljs spliceRows는 병합·행높이를 함께 옮기지 못해 파일이 애매하게 남는다 —
  //  숨김 + printArea 제한으로 화면/인쇄 모두에서 미사용 밴드가 보이지 않게 한다)
  if (bandsUsed < ATTENDANCE_TEMPLATE.bandHeaderRows.length) {
    const fromRow = ATTENDANCE_TEMPLATE.bandTrimStartRows[bandsUsed - 1];
    const merges = [...((sheet.model.merges ?? []) as string[])];

    for (const merge of merges) {
      const topRow = Number(/^[A-Z]+(\d+):/.exec(merge)?.[1] ?? 0);
      if (topRow >= fromRow) {
        sheet.unMergeCells(merge);
      }
    }

    for (let rowNumber = fromRow; rowNumber <= ATTENDANCE_TEMPLATE.lastRow; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      for (let column = 1; column <= ATTENDANCE_TEMPLATE.lastColumn; column += 1) {
        const cell = row.getCell(column);
        cell.value = null;
        cell.style = {};
      }
      row.hidden = true;
    }

    sheet.pageSetup.printArea = `A1:AJ${ATTENDANCE_TEMPLATE.bandLastRows[bandsUsed - 1]}`;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
