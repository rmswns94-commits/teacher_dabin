import type { TextbookSection } from "@/lib/textbooks";

// Local/Draft identity only. Final storage remains [{ name, text }].
export type ManualProgressItem = { id: string; name: string; text: string };

export function restoreManualProgress(
  draftItems: unknown,
  savedSections: readonly TextbookSection[],
): ManualProgressItem[] {
  const source = Array.isArray(draftItems) ? draftItems : savedSections;
  const ids = new Set<string>();
  return source.filter((item) => item && typeof item.name === "string" && typeof item.text === "string")
    .map((item) => {
      const id = typeof item.id === "string" && item.id && !ids.has(item.id)
        ? item.id : globalThis.crypto.randomUUID();
      ids.add(id);
      return { id, name: item.name, text: item.text };
    });
}

export function manualProgressSections(items: readonly ManualProgressItem[], trim = false): TextbookSection[] {
  return items.filter((item) => item.name.trim() && item.text.trim())
    .map((item) => ({ name: item.name, text: trim ? item.text.trim() : item.text }));
}

export function selectManualProgressTextbook(
  items: ManualProgressItem[], id: string, name: string, textbooks: readonly string[],
): ManualProgressItem[] {
  const own = items.find((item) => item.id === id);
  if (!own || (name && name !== own.name && (!textbooks.includes(name) || items.some((item) => item.id !== id && item.name === name)))) {
    return items;
  }
  return items.map((item) => item.id === id ? { ...item, name } : item);
}
