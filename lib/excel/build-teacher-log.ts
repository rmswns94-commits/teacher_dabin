// 교사일지 Excel 내보내기 빌더.
// 예시 파일(20260901화~02수11.xlsx)의 실제 구조를 그대로 재현한다:
// - 하루 = 73행 섹션 (제목 3행 / 날짜·참고·교사명 / 교시 헤더 2행 / 8행 병합 밴드 × 7교시 / 출근·퇴근 footer)
// - 열 A~AU(47열), 병합 좌표·시간 표시 서식(h:mm)까지 원본과 동일
// - 교시 1~7 고정, 출근 2:00 / 퇴근 9:20 고정, 교사명 김다빈 고정
// xlsx(SheetJS)는 서버 route handler에서만 import한다 (클라이언트 번들 제외).
import * as XLSX from "xlsx";

export type TeacherLogPeriod = {
  time: string; // "2:30\n~\n3:20" 형태 (빈 교시는 "")
  textbook: string;
  progress: string;
};

export type TeacherLogDay = {
  dateLabel: string; // "2026 . 09 . 01 ( 화 )"
  periods: TeacherLogPeriod[]; // 항상 7개 (교시 1~7)
};

const TEACHER_NAME = "김다빈";
const CLOCK_IN = 2 / 24; // 2:00
const CLOCK_OUT = 560 / 1440; // 9:20
const SECTION_ROWS = 73;
const LAST_COL = 46; // AU

// DB의 "14:30:00" → 원본 표기 "2:30" (12시간제, 오전/오후 표기 없음)
export function toTemplateClock(time: string) {
  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Number(hourRaw);
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minuteRaw}`;
}

export function formatPeriodTime(startTime: string, endTime: string) {
  return `${toTemplateClock(startTime)}\n~\n${toTemplateClock(endTime)}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function formatDateLabel(ymd: string, dayOfWeek: number) {
  const [year, month, day] = ymd.split("-");
  return `${year} . ${month} . ${day} ( ${WEEKDAYS[dayOfWeek]} )`;
}

type Sheet = XLSX.WorkSheet;

function setCell(ws: Sheet, r: number, c: number, cell: XLSX.CellObject) {
  ws[XLSX.utils.encode_cell({ r, c })] = cell;
}

function addMerge(ws: Sheet, r1: number, c1: number, r2: number, c2: number) {
  (ws["!merges"] as XLSX.Range[]).push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
}

const col = (letters: string) => XLSX.utils.decode_col(letters);

export function buildTeacherLogWorkbook(days: TeacherLogDay[]) {
  const ws: Sheet = { "!merges": [] as XLSX.Range[] };

  days.forEach((day, dayIndex) => {
    const o = dayIndex * SECTION_ROWS;

    // 제목 (A1:AU3)
    setCell(ws, o, 0, { t: "s", v: "교   사   일   지" });
    addMerge(ws, o, 0, o + 2, LAST_COL);

    // 날짜 (A5:Q6) · 참고 (S5:U9 / V5:AU9)
    setCell(ws, o + 4, 0, { t: "s", v: day.dateLabel });
    addMerge(ws, o + 4, 0, o + 5, col("Q"));
    setCell(ws, o + 4, col("S"), { t: "s", v: "참고" });
    addMerge(ws, o + 4, col("S"), o + 8, col("U"));
    addMerge(ws, o + 4, col("V"), o + 8, LAST_COL);

    // 교사명 (A7:G9 / H7:Q9)
    setCell(ws, o + 6, 0, { t: "s", v: "교사명" });
    addMerge(ws, o + 6, 0, o + 8, col("G"));
    setCell(ws, o + 6, col("H"), { t: "s", v: TEACHER_NAME });
    addMerge(ws, o + 6, col("H"), o + 8, col("Q"));

    // 교시 헤더 (11~12행)
    const headerRow = o + 10;
    setCell(ws, headerRow, 0, { t: "s", v: "교시" });
    addMerge(ws, headerRow, 0, headerRow + 1, col("B"));
    setCell(ws, headerRow, col("C"), { t: "s", v: "시간" });
    addMerge(ws, headerRow, col("C"), headerRow + 1, col("D"));
    setCell(ws, headerRow, col("E"), { t: "s", v: "교재" });
    addMerge(ws, headerRow, col("E"), headerRow + 1, col("K"));
    setCell(ws, headerRow, col("L"), { t: "s", v: "수업내용(진도)" });
    addMerge(ws, headerRow, col("L"), headerRow + 1, col("AM"));
    setCell(ws, headerRow, col("AN"), { t: "s", v: "비고" });
    addMerge(ws, headerRow, col("AN"), headerRow + 1, LAST_COL);

    // 교시 1~7 — 8행 병합 밴드
    day.periods.forEach((period, index) => {
      const top = o + 12 + index * 8;
      const bottom = top + 7;

      setCell(ws, top, 0, { t: "n", v: index + 1 });
      addMerge(ws, top, 0, bottom, col("B"));

      if (period.time) {
        setCell(ws, top, col("C"), { t: "s", v: period.time, z: "h:mm" });
      }
      addMerge(ws, top, col("C"), bottom, col("D"));

      if (period.textbook) {
        setCell(ws, top, col("E"), { t: "s", v: period.textbook });
      }
      addMerge(ws, top, col("E"), bottom, col("K"));

      if (period.progress) {
        setCell(ws, top, col("L"), { t: "s", v: period.progress });
      }
      addMerge(ws, top, col("L"), bottom, col("AM"));

      addMerge(ws, top, col("AN"), bottom, LAST_COL);
    });

    // 출근/퇴근 footer (71~73행)
    const footerRow = o + 70;
    setCell(ws, footerRow, 0, { t: "s", v: "출근시간" });
    addMerge(ws, footerRow, 0, footerRow + 2, col("H"));
    setCell(ws, footerRow, col("I"), { t: "n", v: CLOCK_IN, z: "h:mm" });
    addMerge(ws, footerRow, col("I"), footerRow + 2, col("V"));
    setCell(ws, footerRow, col("W"), { t: "s", v: "퇴근시간" });
    addMerge(ws, footerRow, col("W"), footerRow + 2, col("AD"));
    setCell(ws, footerRow, col("AE"), { t: "n", v: CLOCK_OUT, z: "h:mm" });
    addMerge(ws, footerRow, col("AE"), footerRow + 2, LAST_COL);
  });

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(days.length, 1) * SECTION_ROWS - 1, c: LAST_COL },
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "교사일지");
  return wb;
}

export function writeWorkbookBuffer(wb: XLSX.WorkBook) {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
