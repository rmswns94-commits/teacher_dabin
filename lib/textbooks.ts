// 교재 연동 공용 헬퍼.
// 이 앱의 교재 canonical 저장소는 class_groups.textbook(줄바꿈 구분 이름 목록)이며
// 별도 id 체계가 없다 — 교재 identity는 "작성 시점 이름 스냅샷"이다:
//  - 일지의 교재별 진도/계획은 daily_logs.textbook_progress/textbook_plans jsonb에
//    [{ name, text }]로 저장한다 (이름이 나중에 바뀌어도 과거 기록은 그대로 보존).
//  - 표시할 때는 항상 "교재명 - 내용" 형식으로 합성한다 (합성 문자열을 저장 소스로 쓰지 않음).

export type TextbookSection = { name: string; text: string };

// class_groups.textbook → 이름 목록 (그룹 상세/일지 폼과 동일 파싱, 중복 이름은 하나로)
export function parseGroupTextbooks(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of (raw ?? "").split("\n")) {
    const name = line.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

// "교재명 - 내용" (교재 없으면 내용만 — undefined/null prefix 금지)
export function formatTextbookLinked(name: string | null | undefined, content: string): string {
  const trimmedName = name?.trim();
  return trimmedName ? `${trimmedName} - ${content}` : content;
}

// 교재별 섹션들 → 파생 mirror 텍스트. 내용이 있는 교재만, 블록 사이 빈 줄 구분.
//   Grammar Inside 2 - p.42~47
//   관계대명사 주격
//
//   백발백중 중2 - 5과 문법
// 기존 free-text 소비처(전체 학생 적용/Excel/브리핑/지난 계획 카드)가 이 텍스트를 그대로 쓴다.
export function buildTextbookSectionsText(sections: TextbookSection[]): string {
  return sections
    .filter((section) => section.text.trim())
    .map((section) => formatTextbookLinked(section.name, section.text.trim()))
    .join("\n\n");
}

// mirror + 기타 메모 합성 (저장용 파생 텍스트)
export function joinDerivedText(mirror: string, extra: string): string {
  return [mirror, extra.trim()].filter(Boolean).join("\n\n");
}

// 저장된 파생 텍스트에서 mirror 부분을 떼어내 "기타 메모"만 돌려준다.
// mirror는 결정적으로 재구성되므로 정확 prefix 비교가 안전하다 —
// mirror로 시작하지 않으면(legacy 자유 텍스트/외부 수정) 전체를 기타 메모로 취급해 무손실.
export function stripDerivedPrefix(saved: string, mirror: string): string {
  if (!mirror) {
    return saved;
  }
  if (saved === mirror) {
    return "";
  }
  if (saved.startsWith(`${mirror}\n\n`)) {
    return saved.slice(mirror.length + 2);
  }
  return saved;
}
