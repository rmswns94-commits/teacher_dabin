import type { ParsedLesson } from "./parse-teacher-log";

// Excel 수업 ↔ 등록된 수업 그룹 매칭 (순수 로직, DB 접근 없음).
//
// 우선순위:
//  1. 요일 + 시작/종료 시간이 정확히 일치하는 schedule → 그룹 1개면 자동 매칭
//  2. 같은 시간 그룹이 여러 개면 교재 exact match로 좁힘 → 1개면 자동 매칭
//  3. 시작 시간만 일치(종료 다름) → 추천만 하고 "확인 필요"
//  4. 후보 여러 개 → 사용자 선택
//  5. 매칭 없음 → 사용자가 그룹 직접 선택 (자동 저장 금지)
//
// 시간 AM/PM: "3:30"처럼 12시간제로 보이는 시간은 [03:30, 15:30] 두 후보를
// 만들어 등록된 시간표와 비교해서 판정한다. 추측으로 확정하지 않는다.

export type MatchGroupInfo = {
  id: string;
  name: string;
  textbooks: string[]; // class_groups.textbook 줄바꿈 분리
};

export type MatchSlotInfo = {
  group_id: string;
  day_of_week: number; // 0=일 ... 6=토
  start_time: string; // "HH:MM" 또는 "HH:MM:SS"
  end_time: string;
};

export type ExistingLogInfo = {
  id: string;
  group_id: string;
  class_date: string;
  status: "draft" | "completed";
  default_progress: string | null;
};

export type MatchConfidence = "auto" | "review" | "none";

export type MatchedLesson = ParsedLesson & {
  key: string;
  startTime: string | null; // 판정된 24시간제 "HH:MM"
  endTime: string | null;
  matchedGroupId: string | null;
  confidence: MatchConfidence;
  matchReason: string | null;
  timeNote: string | null;
  candidates: { id: string; name: string }[];
  emptyContent: boolean;
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function hm(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeHM(time: string) {
  return time.slice(0, 5);
}

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

// "Susie's Day 2(구권)" → "susie's day 2" (보조 매칭용 — 자동 확정에는 쓰지 않음)
function stripParen(value: string) {
  return normalizeText(value.replace(/\([^)]*\)/g, " "));
}

// 12시간제로 보이는 시간의 (시작, 종료) 24시간제 후보 조합
function timeCandidates(lesson: ParsedLesson): { start: string; end: string }[] {
  const startOffsets = lesson.startHour >= 13 ? [0] : lesson.startHour === 12 ? [0] : [0, 12];
  const endOffsets = lesson.endHour >= 13 ? [0] : lesson.endHour === 12 ? [0] : [0, 12];
  const results: { start: string; end: string }[] = [];

  for (const so of startOffsets) {
    for (const eo of endOffsets) {
      const startTotal = (lesson.startHour + so) * 60 + lesson.startMinute;
      const endTotal = (lesson.endHour + eo) * 60 + lesson.endMinute;
      const duration = endTotal - startTotal;

      if (lesson.startHour + so > 23 || lesson.endHour + eo > 23) continue;
      if (duration <= 0 || duration > 360) continue; // 6시간 초과 수업은 비현실적

      results.push({
        start: hm(lesson.startHour + so, lesson.startMinute),
        end: hm(lesson.endHour + eo, lesson.endMinute),
      });
    }
  }

  return results;
}

function dayOfWeekOf(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

export function matchLessons(
  lessons: ParsedLesson[],
  groups: MatchGroupInfo[],
  slots: MatchSlotInfo[],
): MatchedLesson[] {
  const groupById = new Map(groups.map((group) => [group.id, group]));

  return lessons.map((lesson, index) => {
    const dow = dayOfWeekOf(lesson.date);
    const candidates = timeCandidates(lesson);
    const daySlots = slots.filter((slot) => slot.day_of_week === dow);

    // 1) 시작+종료 정확 일치
    const exactHits: { groupId: string; start: string; end: string }[] = [];
    for (const cand of candidates) {
      for (const slot of daySlots) {
        if (timeHM(slot.start_time) === cand.start && timeHM(slot.end_time) === cand.end) {
          exactHits.push({ groupId: slot.group_id, start: cand.start, end: cand.end });
        }
      }
    }

    const uniqueExactGroups = [...new Set(exactHits.map((hit) => hit.groupId))];

    const lessonBooksNorm = lesson.textbooks.map(normalizeText);
    const lessonBooksBase = lesson.textbooks.map(stripParen);
    const bookExactMatch = (groupId: string) => {
      const group = groupById.get(groupId);
      if (!group || lessonBooksNorm.length === 0) return false;
      const groupBooks = group.textbooks.map(normalizeText);
      return lessonBooksNorm.some((book) => groupBooks.includes(book));
    };
    const bookBaseMatch = (groupId: string) => {
      const group = groupById.get(groupId);
      if (!group || lessonBooksBase.length === 0) return false;
      const groupBooks = group.textbooks.map(stripParen);
      return lessonBooksBase.some((book) => book && groupBooks.includes(book));
    };

    const base = {
      ...lesson,
      key: `lesson-${index}`,
      emptyContent: lesson.textbooks.length === 0 && !lesson.progress,
    };

    const timeLabel = (start: string, end: string) =>
      `${DAY_LABELS[dow]}요일 ${start}~${end} 시간표와 일치`;

    if (uniqueExactGroups.length === 1) {
      const hit = exactHits.find((item) => item.groupId === uniqueExactGroups[0])!;
      return {
        ...base,
        startTime: hit.start,
        endTime: hit.end,
        matchedGroupId: hit.groupId,
        confidence: "auto" as const,
        matchReason: timeLabel(hit.start, hit.end),
        timeNote: null,
        candidates: [],
      };
    }

    if (uniqueExactGroups.length > 1) {
      // 2) 교재로 좁히기 (exact normalized만 자동 확정에 사용)
      const byBook = uniqueExactGroups.filter(bookExactMatch);

      if (byBook.length === 1) {
        const hit = exactHits.find((item) => item.groupId === byBook[0])!;
        return {
          ...base,
          startTime: hit.start,
          endTime: hit.end,
          matchedGroupId: hit.groupId,
          confidence: "auto" as const,
          matchReason: `${timeLabel(hit.start, hit.end)} · 교재 일치`,
          timeNote: null,
          candidates: [],
        };
      }

      // 보조: 부가설명 제거 후 일치하면 추천만 (확인 필요)
      const byBase = uniqueExactGroups.filter(bookBaseMatch);
      const suggested = byBase.length === 1 ? byBase[0] : null;
      const hit = exactHits[0];

      return {
        ...base,
        startTime: hit.start,
        endTime: hit.end,
        matchedGroupId: suggested,
        confidence: "review" as const,
        matchReason: suggested ? `${timeLabel(hit.start, hit.end)} · 교재 유사` : null,
        timeNote: null,
        candidates: uniqueExactGroups.map((groupId) => ({
          id: groupId,
          name: groupById.get(groupId)?.name ?? "수업 그룹",
        })),
      };
    }

    // 3) 시작 시간만 일치 (종료 시간이 다름)
    const startHits: { groupId: string; start: string; slotEnd: string }[] = [];
    for (const cand of candidates) {
      for (const slot of daySlots) {
        if (timeHM(slot.start_time) === cand.start) {
          startHits.push({ groupId: slot.group_id, start: cand.start, slotEnd: timeHM(slot.end_time) });
        }
      }
    }
    const uniqueStartGroups = [...new Set(startHits.map((hit) => hit.groupId))];

    if (uniqueStartGroups.length >= 1) {
      const narrowed =
        uniqueStartGroups.length > 1 ? uniqueStartGroups.filter(bookExactMatch) : uniqueStartGroups;
      const suggested = narrowed.length === 1 ? narrowed[0] : null;
      const hit = suggested
        ? startHits.find((item) => item.groupId === suggested)!
        : startHits[0];

      return {
        ...base,
        startTime: hit.start,
        endTime: null,
        matchedGroupId: suggested,
        confidence: "review" as const,
        matchReason: suggested ? `${DAY_LABELS[dow]}요일 ${hit.start} 시작 시간이 일치` : null,
        timeNote: `등록된 수업은 ${hit.slotEnd}까지예요 (엑셀: ${lesson.rawTime})`,
        candidates: uniqueStartGroups.map((groupId) => ({
          id: groupId,
          name: groupById.get(groupId)?.name ?? "수업 그룹",
        })),
      };
    }

    // 5) 매칭 없음
    return {
      ...base,
      startTime: null,
      endTime: null,
      matchedGroupId: null,
      confidence: "none" as const,
      matchReason: null,
      timeNote: null,
      candidates: [],
    };
  });
}
