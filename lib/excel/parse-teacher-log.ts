import * as XLSX from "xlsx";

// 수업진도 Excel(1차 지원 template) 파서.
//
// 지원 구조 (실제 사용 양식 기반):
//   2026.09.01 (화)          ← 날짜 헤더 (연.월.일 + 요일, Excel date cell도 지원)
//   2:30 ~ 3:20              ← 수업 시간 블록 시작
//   교재: Susie's Day 1      ← 교재 (여러 권: 쉼표/줄바꿈//)
//   수업내용(진도): Review 4~6 ← 진도 (여러 줄 보존)
//
// 저장용 원본 텍스트는 그대로 보존하고, normalize는 매칭 단계에서만 한다.

export type ParsedLesson = {
  date: string; // YYYY-MM-DD
  weekdayInFile: string | null; // "화" 등 파일에 표기된 요일
  weekdayMismatch: boolean; // 날짜에서 계산한 요일과 표기가 다른 경우
  rawTime: string; // "3:30 ~ 4:20" 원본
  startHour: number; // 파일에 적힌 그대로 (AM/PM 미확정)
  startMinute: number;
  endHour: number;
  endMinute: number;
  textbooks: string[];
  progress: string; // 줄바꿈 보존
};

export type ParseResult = {
  sheetName: string | null;
  rowCount: number;
  lessons: ParsedLesson[];
};

const DATE_RE =
  /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\s*(?:\(?\s*([월화수목금토일])\s*(?:요일)?\s*\)?)?/;
const TIME_RE = /(\d{1,2})\s*:\s*(\d{2})\s*[~\-–]\s*(\d{1,2})\s*:\s*(\d{2})/;
const TEXTBOOK_LABEL_RE = /^교\s*재\s*[:：]?\s*(.*)$/;
const PROGRESS_LABEL_RE = /^(?:수업\s*내용(?:\s*\(\s*진도\s*\))?|진\s*도)\s*[:：]?\s*(.*)$/;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// Excel date serial → YYYY-MM-DD (기준 1899-12-30, 순수 산술이라 timezone 밀림 없음)
function serialToYmd(serial: number) {
  const ms = Math.round((serial - 25569) * 86400 * 1000); // 25569 = 1970-01-01
  const date = new Date(ms);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekdayOfYmd(ymd: string) {
  return WEEKDAYS[new Date(`${ymd}T12:00:00Z`).getUTCDay()];
}

// 셀 값 → 표시 텍스트 (날짜 serial cell은 날짜 문자열로)
function cellToText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    // Excel date serial로 보이는 숫자 (1990~2100년대 범위)
    if (value > 32874 && value < 73050 && Number.isInteger(value)) {
      return serialToYmd(value).replaceAll("-", ".");
    }

    return String(value);
  }

  if (value instanceof Date) {
    // cellDates 옵션이 켜졌을 때 대비 (UTC 기준으로 date-only 추출)
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}.${m}.${d}`;
  }

  return String(value);
}

// merged cell을 좌상단 값으로 채운 텍스트 행렬을 만든다.
function sheetToMatrix(sheet: XLSX.WorkSheet): string[][] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  const merges = sheet["!merges"] ?? [];

  for (const merge of merges) {
    const topLeft = matrix[merge.s.r]?.[merge.s.c];

    if (topLeft === null || topLeft === undefined) {
      continue;
    }

    for (let r = merge.s.r; r <= merge.e.r; r += 1) {
      for (let c = merge.s.c; c <= merge.e.c; c += 1) {
        if (!matrix[r]) matrix[r] = [];
        if (matrix[r][c] === null || matrix[r][c] === undefined) {
          matrix[r][c] = topLeft;
        }
      }
    }
  }

  return matrix.map((row) => (row ?? []).map(cellToText));
}

// 행렬 → 줄 단위 텍스트 (셀 내부 줄바꿈 유지, merge로 인한 연속 중복 제거)
function matrixToLines(matrix: string[][]): string[] {
  const lines: string[] = [];

  for (const row of matrix) {
    let previous = "";

    for (const cell of row) {
      const text = cell.trim();

      if (!text || text === previous) {
        continue;
      }

      previous = text;

      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) {
          lines.push(line.trim());
        }
      }
    }
  }

  return lines;
}

// 데이터가 들어 있는 sheet 선택: 날짜/시간 패턴이 가장 많은 sheet
function pickSheet(workbook: XLSX.WorkBook): string | null {
  let best: { name: string; score: number } | null = null;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];

    if (!sheet) {
      continue;
    }

    const lines = matrixToLines(sheetToMatrix(sheet));
    const score =
      lines.filter((line) => TIME_RE.test(line)).length * 2 +
      lines.filter((line) => DATE_RE.test(line)).length;

    if (score > 0 && (!best || score > best.score)) {
      best = { name, score };
    }
  }

  return best?.name ?? workbook.SheetNames[0] ?? null;
}

export function parseTeacherLogWorkbook(buffer: Buffer | Uint8Array): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = pickSheet(workbook);

  if (!sheetName || !workbook.Sheets[sheetName]) {
    return { sheetName: null, rowCount: 0, lessons: [] };
  }

  const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
  const lines = matrixToLines(matrix);

  const lessons: ParsedLesson[] = [];
  let currentDate: string | null = null;
  let currentWeekday: string | null = null;

  type Draft = {
    rawTime: string;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    textbookLines: string[];
    progressLines: string[];
    mode: "textbook" | "progress" | null;
  };
  let draft: Draft | null = null;

  const finalize = () => {
    if (!draft || !currentDate) {
      draft = null;
      return;
    }

    const textbooks = draft.textbookLines
      .join("\n")
      .split(/[,/\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const progress = draft.progressLines.join("\n").trim();

    lessons.push({
      date: currentDate,
      weekdayInFile: currentWeekday,
      weekdayMismatch: currentWeekday !== null && weekdayOfYmd(currentDate) !== currentWeekday,
      rawTime: draft.rawTime,
      startHour: draft.startHour,
      startMinute: draft.startMinute,
      endHour: draft.endHour,
      endMinute: draft.endMinute,
      textbooks,
      progress,
    });

    draft = null;
  };

  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);

    // 날짜 헤더 (시간 패턴이 같이 있으면 날짜 헤더가 아님)
    if (dateMatch && !TIME_RE.test(line)) {
      finalize();
      const [, y, m, d, weekday] = dateMatch;
      currentDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      currentWeekday = weekday ?? null;
      continue;
    }

    const timeMatch = line.match(TIME_RE);

    if (timeMatch) {
      finalize();
      draft = {
        rawTime: `${timeMatch[1]}:${timeMatch[2]} ~ ${timeMatch[3]}:${timeMatch[4]}`,
        startHour: Number(timeMatch[1]),
        startMinute: Number(timeMatch[2]),
        endHour: Number(timeMatch[3]),
        endMinute: Number(timeMatch[4]),
        textbookLines: [],
        progressLines: [],
        mode: null,
      };

      // 시간 뒤에 같은 줄에 내용이 붙어 있으면 진도 후보로
      const rest = line.replace(TIME_RE, "").trim();
      if (rest) {
        draft.progressLines.push(rest);
        draft.mode = "progress";
      }

      continue;
    }

    if (!draft) {
      continue; // 날짜/시간 블록 밖의 장식 행은 skip
    }

    const textbookMatch = line.match(TEXTBOOK_LABEL_RE);

    if (textbookMatch) {
      draft.mode = "textbook";
      if (textbookMatch[1].trim()) {
        draft.textbookLines.push(textbookMatch[1].trim());
      }
      continue;
    }

    const progressMatch = line.match(PROGRESS_LABEL_RE);

    if (progressMatch) {
      draft.mode = "progress";
      if (progressMatch[1].trim()) {
        draft.progressLines.push(progressMatch[1].trim());
      }
      continue;
    }

    // 라벨 없는 줄: 현재 모드에 이어 붙인다 (라벨이 아직 없으면 진도로 취급)
    if (draft.mode === "textbook") {
      draft.textbookLines.push(line);
    } else {
      draft.progressLines.push(line);
    }
  }

  finalize();

  return { sheetName, rowCount: matrix.length, lessons };
}
