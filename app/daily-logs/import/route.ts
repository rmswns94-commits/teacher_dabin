import { NextResponse } from "next/server";

import { matchLessons, type MatchedLesson } from "@/lib/excel/match-lessons";
import { parseTeacherLogWorkbook } from "@/lib/excel/parse-teacher-log";
import { getDailyLogsForDates, type DailyLogForImport } from "@/lib/supabase/queries/daily-logs";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { getServerUser } from "@/lib/supabase/server";

const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel serverless 요청 한도(4.5MB) 안쪽

export type ImportPreviewResponse = {
  fileName: string;
  sheetName: string | null;
  items: MatchedLesson[];
  groups: { id: string; name: string }[];
  existingLogs: DailyLogForImport[];
};

// Excel 파일을 메모리에서 parse → 매칭 preview 반환. 파일은 어디에도 저장하지 않는다.
export async function POST(request: Request) {
  const user = await getServerUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: ".xlsx 형식의 Excel 파일만 지원해요." }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "파일이 너무 커요. 수업진도 Excel 파일을 확인해주세요." },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = parseTeacherLogWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    console.error("excel parse error", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Excel 파일을 읽지 못했어요. 파일이 손상되지 않았는지 확인해주세요." },
      { status: 400 },
    );
  }

  if (parsed.lessons.length === 0) {
    return NextResponse.json(
      {
        error: "이 Excel 파일에서 수업진도 형식을 찾지 못했어요.",
        sheetName: parsed.sheetName,
        rowCount: parsed.rowCount,
      },
      { status: 422 },
    );
  }

  // 매칭에 필요한 데이터를 batch 조회 (Excel row별 쿼리 금지)
  const dates = [...new Set(parsed.lessons.map((lesson) => lesson.date))];
  const [groups, slots, existingLogs] = await Promise.all([
    getCurrentUserGroups(),
    getCurrentUserSchedulesWithGroup(),
    getDailyLogsForDates(dates),
  ]);

  const matchGroups = groups.map((group) => ({
    id: group.id,
    name: group.name,
    textbooks: (group.textbook ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  }));

  const items = matchLessons(parsed.lessons, matchGroups, slots);

  // debug log는 개인 내용 없이 개수만
  console.log(
    `excel import preview: ${items.length} lessons, ${items.filter((item) => item.confidence === "auto").length} auto-matched`,
  );

  const response: ImportPreviewResponse = {
    fileName: file.name,
    sheetName: parsed.sheetName,
    items,
    groups: groups.map((group) => ({ id: group.id, name: group.name })),
    existingLogs,
  };

  return NextResponse.json(response);
}
