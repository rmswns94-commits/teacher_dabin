import * as XLSX from "xlsx";

// 수업진도 Excel("교사일지" 양식) 파서.
//
// 1차 지원 template (실제 사용 파일 구조):
//   - 시트 안에 "교사일지" 블록이 1개 이상. 블록마다:
//     · 날짜 헤더: "2026 . 09 . 01 ( 화 )"  (공백 섞임, 빈 템플릿 "2026 . . ( )"는 skip)
//     · 표 헤더 행: 교시 | 시간 | 교재 | 수업내용(진도) | 비고  ← 컬럼 위치를 여기서 판별
//     · 수업 밴드(여러 행 병합): 시간 셀 "2:30⏎~⏎3:20", 교재/진도는 각 컬럼 셀
//     · 밴드 안에 추가 교재 셀이 별도로 있을 수 있음
//   - 교재 구분자: 줄바꿈, 쉼표, /, 2칸 이상 공백
//
// 헤더 행이 없는 파일은 라벨형("교재:" / "수업내용(진도):" 줄) fallback으로 파싱한다.
// 저장용 원본 텍스트는 그대로 보존하고, normalize는 매칭 단계에서만 한다.

export type ParsedLesson = {
  date: string; // YYYY-MM-DD
  weekdayInFile: string | null; // "화" 등 파일에 표기된 요일
  weekdayMismatch: boolean;
  rawTime: string; // "2:30 ~ 3:20"
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

// Excel date serial → YYYY-MM-DD (순수 산술 — timezone 밀림 없음)
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

function cellToText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    if (value > 32874 && value < 73050 && Number.isInteger(value)) {
      return serialToYmd(value).replaceAll("-", ".");
    }

    return String(value);
  }

  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}.${m}.${d}`;
  }

  return String(value);
}

// merged cell을 좌상단 값으로 채운 텍스트 행렬
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

// 셀 내부 줄바꿈을 공백으로 눌러 시간 패턴("2:30⏎~⏎3:20")을 찾는다
function timeOfCell(text: string) {
  const match = text.replace(/\s+/g, " ").match(TIME_RE);

  if (!match) {
    return null;
  }

  return {
    rawTime: `${match[1]}:${match[2]} ~ ${match[3]}:${match[4]}`,
    startHour: Number(match[1]),
    startMinute: Number(match[2]),
    endHour: Number(match[3]),
    endMinute: Number(match[4]),
  };
}

// 교재 셀 → 교재 목록 (줄바꿈/쉼표///2칸 이상 공백 구분)
function splitTextbooks(values: string[]) {
  const books: string[] = [];

  for (const value of values) {
    for (const piece of value.split(/[\n,/]|\s{2,}/)) {
      const book = piece.trim();

      if (book && !books.includes(book)) {
        books.push(book);
      }
    }
  }

  return books;
}

function normalizeCell(text: string) {
  return text.replace(/\s+/g, "");
}

function makeLesson(
  date: string,
  weekday: string | null,
  time: NonNullable<ReturnType<typeof timeOfCell>>,
  textbooks: string[],
  progressParts: string[],
): ParsedLesson {
  return {
    date,
    weekdayInFile: weekday,
    weekdayMismatch: weekday !== null && weekdayOfYmd(date) !== weekday,
    rawTime: time.rawTime,
    startHour: time.startHour,
    startMinute: time.startMinute,
    endHour: time.endHour,
    endMinute: time.endMinute,
    textbooks,
    progress: progressParts.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

// ---- 컬럼형(교사일지 표) 파싱 ----------------------------------------------

type HeaderInfo = { row: number; timeCol: number; textbookCol: number; progressCol: number };

function findHeaderRows(matrix: string[][]): HeaderInfo[] {
  const headers: HeaderInfo[] = [];

  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r];
    let timeCol = -1;
    let textbookCol = -1;
    let progressCol = -1;

    for (let c = 0; c < row.length; c += 1) {
      const text = normalizeCell(row[c]);

      if (text === "시간" && timeCol === -1) timeCol = c;
      else if (text === "교재" && textbookCol === -1) textbookCol = c;
      else if (/^수업내용(\(진도\))?$|^진도$/.test(text) && progressCol === -1) progressCol = c;
    }

    if (timeCol !== -1 && textbookCol !== -1 && progressCol !== -1) {
      const previous = headers[headers.length - 1];

      // 세로 병합으로 같은 헤더가 연속 행에 반복되면 첫 행만 사용
      if (previous && r - previous.row <= 3) {
        continue;
      }

      headers.push({ row: r, timeCol, textbookCol, progressCol });
    }
  }

  return headers;
}

// 헤더 행 위쪽에서 이 블록의 날짜를 찾는다 (빈 템플릿 "2026 . . ( )"는 매칭 안 됨)
function findSectionDate(matrix: string[][], headerRow: number, prevHeaderRow: number) {
  for (let r = headerRow - 1; r > prevHeaderRow; r -= 1) {
    for (const cell of matrix[r] ?? []) {
      const match = cell.match(DATE_RE);

      if (match) {
        const [, y, m, d, weekday] = match;
        return {
          date: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
          weekday: weekday ?? null,
        };
      }
    }
  }

  return null;
}

function parseColumnar(matrix: string[][], headers: HeaderInfo[]): ParsedLesson[] {
  const lessons: ParsedLesson[] = [];

  for (let h = 0; h < headers.length; h += 1) {
    const header = headers[h];
    const sectionEnd = h + 1 < headers.length ? headers[h + 1].row : matrix.length;
    const section = findSectionDate(matrix, header.row, h > 0 ? headers[h - 1].row : -1);

    if (!section) {
      continue; // 날짜가 비어 있는 템플릿 블록은 skip
    }

    // 수업 밴드: 시간 셀 값이 바뀌는 행이 밴드 시작 (merge 전개로 값이 반복됨)
    type Band = { time: NonNullable<ReturnType<typeof timeOfCell>>; start: number; end: number };
    const bands: Band[] = [];
    let previousTimeText = "";

    for (let r = header.row + 1; r < sectionEnd; r += 1) {
      const timeText = (matrix[r]?.[header.timeCol] ?? "").trim();

      if (timeText && timeText !== previousTimeText) {
        const time = timeOfCell(timeText);

        if (time) {
          if (bands.length > 0 && bands[bands.length - 1].end === sectionEnd) {
            bands[bands.length - 1].end = r;
          }
          bands.push({ time, start: r, end: sectionEnd });
        }
      } else if (!timeText && bands.length > 0 && bands[bands.length - 1].end === sectionEnd) {
        // 시간 컬럼이 비는 첫 행에서 표가 끝난 것으로 본다
        // (표 아래 출근/퇴근 시간, 다음 블록 템플릿이 밴드로 흡수되지 않게)
        bands[bands.length - 1].end = r;
      }

      if (timeText) {
        previousTimeText = timeText;
      }
    }

    for (const band of bands) {
      // 밴드 범위의 교재/진도 셀 값 수집 (merge 반복값은 dedupe, 추가 셀은 이어붙임)
      const textbookValues: string[] = [];
      const progressValues: string[] = [];

      for (let r = band.start; r < band.end; r += 1) {
        const textbook = (matrix[r]?.[header.textbookCol] ?? "").trim();
        const progress = (matrix[r]?.[header.progressCol] ?? "").trim();

        if (textbook && !textbookValues.includes(textbook)) textbookValues.push(textbook);
        if (progress && !progressValues.includes(progress)) progressValues.push(progress);
      }

      lessons.push(
        makeLesson(
          section.date,
          section.weekday,
          band.time,
          splitTextbooks(textbookValues),
          progressValues,
        ),
      );
    }
  }

  return lessons;
}

// ---- 라벨형(교재: / 수업내용(진도): 줄) fallback 파싱 -----------------------

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

      // 셀 전체가 시간 패턴이면 줄바꿈("2:30⏎~⏎3:20")을 한 줄로 정규화
      const time = timeOfCell(text);
      if (time && normalizeCell(text).length <= 14) {
        lines.push(time.rawTime);
        continue;
      }

      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) {
          lines.push(line.trim());
        }
      }
    }
  }

  return lines;
}

function parseLabelLines(matrix: string[][]): ParsedLesson[] {
  const lines = matrixToLines(matrix);
  const lessons: ParsedLesson[] = [];
  let currentDate: string | null = null;
  let currentWeekday: string | null = null;

  type Draft = {
    time: NonNullable<ReturnType<typeof timeOfCell>>;
    textbookLines: string[];
    progressLines: string[];
    mode: "textbook" | "progress" | null;
  };
  let draft: Draft | null = null;

  const finalize = () => {
    if (draft && currentDate) {
      lessons.push(
        makeLesson(
          currentDate,
          currentWeekday,
          draft.time,
          splitTextbooks(draft.textbookLines),
          draft.progressLines,
        ),
      );
    }

    draft = null;
  };

  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);

    if (dateMatch && !TIME_RE.test(line)) {
      finalize();
      const [, y, m, d, weekday] = dateMatch;
      currentDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      currentWeekday = weekday ?? null;
      continue;
    }

    const time = timeOfCell(line);

    if (time) {
      finalize();
      draft = { time, textbookLines: [], progressLines: [], mode: null };
      continue;
    }

    if (!draft) {
      continue;
    }

    const textbookMatch = line.match(TEXTBOOK_LABEL_RE);

    if (textbookMatch) {
      draft.mode = "textbook";
      if (textbookMatch[1].trim()) draft.textbookLines.push(textbookMatch[1].trim());
      continue;
    }

    const progressMatch = line.match(PROGRESS_LABEL_RE);

    if (progressMatch) {
      draft.mode = "progress";
      if (progressMatch[1].trim()) draft.progressLines.push(progressMatch[1].trim());
      continue;
    }

    if (draft.mode === "textbook") {
      draft.textbookLines.push(line);
    } else {
      draft.progressLines.push(line);
    }
  }

  finalize();

  return lessons;
}

// ---- entry ------------------------------------------------------------------

function pickSheet(workbook: XLSX.WorkBook): string | null {
  let best: { name: string; score: number } | null = null;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];

    if (!sheet) {
      continue;
    }

    const matrix = sheetToMatrix(sheet);
    let score = 0;

    for (const row of matrix) {
      for (const cell of row) {
        if (timeOfCell(cell)) score += 2;
        else if (DATE_RE.test(cell)) score += 1;
      }
    }

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
  const headers = findHeaderRows(matrix);

  const lessons = headers.length > 0 ? parseColumnar(matrix, headers) : parseLabelLines(matrix);

  return { sheetName, rowCount: matrix.length, lessons };
}
