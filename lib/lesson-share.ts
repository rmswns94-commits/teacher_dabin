import { homeworkShareBlocks, type ShareableHomeworkItem } from "@/lib/homework-share";
import { formatTextbookLinked } from "@/lib/textbooks";

// "수업 안내 공유" 텍스트 — source는 항상 현재 Daily Log 폼 state (DB 조회 아님).
// 섹션 순서는 항상 진도 → 숙제 → 다음 계획 (체크 순서와 무관), 빈 섹션은 header째 제외.
// 숙제 블록은 기존 숙제 전용 공유와 같은 헬퍼(homeworkShareBlocks)를 재사용한다.

export const LESSON_SHARE_TITLE = "📚 오늘 수업 안내";

// 진도/다음 계획의 context 구획 — 폼이 이미 파생해 둔 {name, text} 섹션 그대로 받는다.
// schoolSections = 학교(시험) context, textbookSections = 교재 context,
// extra = 기타 메모/legacy raw (mirror가 이미 제거된 값 — 문자열 parsing 금지, 그대로 출력).
export type ShareContextSections = {
  schoolSections: readonly { name: string; text: string }[];
  textbookSections: readonly { name: string; text: string }[];
  extra: string;
};

const sectionLines = (sections: readonly { name: string; text: string }[]) =>
  sections
    .filter((section) => section.text.trim())
    .map((section) => formatTextbookLinked(section.name, section.text.trim()))
    .join("\n");

// 학교+교재가 공존(mixed)하면 구획 라벨(시험 대비/일반 수업)로 구분하고,
// 한 종류뿐이면 라벨 없이 "이름 - 내용" 줄들만. extra는 마지막 블록.
export function formatContextShareSection(input: ShareContextSections): string {
  const schoolText = sectionLines(input.schoolSections);
  const textbookText = sectionLines(input.textbookSections);
  const extra = input.extra.trim();

  const blocks: string[] = [];
  if (schoolText && textbookText) {
    blocks.push(`시험 대비\n${schoolText}`);
    blocks.push(`일반 수업\n${textbookText}`);
  } else if (schoolText) {
    blocks.push(schoolText);
  } else if (textbookText) {
    blocks.push(textbookText);
  }
  if (extra) {
    blocks.push(extra);
  }
  return blocks.join("\n\n");
}

export function hasShareableContextSection(input: ShareContextSections): boolean {
  return formatContextShareSection(input).length > 0;
}

export type LessonShareInput = {
  // null = 해당 섹션 미선택 (섹션 자체를 조립하지 않음)
  progress: ShareContextSections | null;
  homework: readonly ShareableHomeworkItem[] | null;
  nextPlan: ShareContextSections | null;
};

// 최종 텍스트: 제목 + 빈 줄 + 선택된 섹션들([오늘 진도]/[오늘 숙제]/[다음 수업 계획] 고정 순서).
// 선택했더라도 내용이 비면 그 섹션은 header째 생략한다.
export function buildLessonShareText(input: LessonShareInput): string {
  const sections: string[] = [];

  if (input.progress) {
    const text = formatContextShareSection(input.progress);
    if (text) {
      sections.push(`[오늘 진도]\n${text}`);
    }
  }
  if (input.homework) {
    const blocks = homeworkShareBlocks(input.homework);
    if (blocks.length > 0) {
      sections.push(`[오늘 숙제]\n${blocks.join("\n\n")}`);
    }
  }
  if (input.nextPlan) {
    const text = formatContextShareSection(input.nextPlan);
    if (text) {
      sections.push(`[다음 수업 계획]\n${text}`);
    }
  }

  return [LESSON_SHARE_TITLE, "", sections.join("\n\n")].join("\n");
}
