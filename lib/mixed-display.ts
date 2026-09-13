import { buildTextbookSectionsText, formatTextbookLinked, stripDerivedPrefix, type TextbookSection } from "@/lib/textbooks";

// Read model only: saved fields determine context, never today's group settings.
export type SavedContext = { school?: string | null; textbook?: string | null };

export function groupMixedContextsForDisplay<T extends SavedContext>(items: readonly T[]) {
  const school: T[] = [];
  const textbook: T[] = [];
  const other: T[] = [];
  for (const item of items) {
    // Match linkedContextLabel's precedence for old records with both fields.
    if (item.textbook?.trim()) textbook.push(item);
    else if (item.school?.trim()) school.push(item);
    else other.push(item);
  }
  return [
    { key: "school", label: "시험 대비", items: school },
    { key: "textbook", label: "일반 수업", items: textbook },
    { key: "other", label: "", items: other },
  ].filter((group) => group.items.length > 0);
}

export function savedSectionsForDisplay({ school, textbook, raw }: {
  school?: TextbookSection[] | null;
  textbook?: TextbookSection[] | null;
  raw?: string | null;
}) {
  const schools = (school ?? []).filter((item) => item.text.trim());
  const textbooks = (textbook ?? []).filter((item) => item.text.trim());
  const entries = [
    ...schools.map((item, index) => ({ id: `school-${index}`, school: item.name, text: item.text })),
    ...textbooks.map((item, index) => ({ id: `textbook-${index}`, textbook: item.name, text: item.text })),
  ];
  // Strip only the exact deterministic mirror; never parse labels out of legacy text.
  const mirror = [buildTextbookSectionsText(textbooks), buildTextbookSectionsText(schools)]
    .filter(Boolean).join("\n\n");
  return { entries, extra: stripDerivedPrefix(raw ?? "", mirror) };
}

export function formatMixedProgressForExcel(input: Parameters<typeof savedSectionsForDisplay>[0]) {
  const { entries, extra } = savedSectionsForDisplay(input);
  if (!entries.length) return input.raw ?? "";
  const groups = groupMixedContextsForDisplay(entries);
  const blocks = groups.map((group) => `[${group.label}]\n${group.items.map((item) =>
    formatTextbookLinked("school" in item ? item.school : item.textbook, item.text),
  ).join("\n")}`);
  if (extra) blocks.push(extra);
  return blocks.join("\n\n");
}
