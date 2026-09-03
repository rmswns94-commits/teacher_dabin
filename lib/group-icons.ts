// 수업 그룹 대표 아이콘 preset (emoji) — 선택 UI와 validation의 단일 소스.
// 1차 버전은 preset 선택만 허용한다 (자유 입력/이미지 업로드는 향후 확장).

export const groupIconPresets = [
  "📚",
  "✏️",
  "🐰",
  "🧸",
  "🌸",
  "🌷",
  "🍀",
  "⭐",
  "☁️",
  "🌈",
  "🎀",
  "🐣",
  "🍎",
  "🐻",
  "🦊",
  "🐥",
] as const;

export const GROUP_ICON_FALLBACK = "📘";

export function isGroupIconPreset(value: string): boolean {
  return (groupIconPresets as readonly string[]).includes(value);
}

// 아이콘 미설정 그룹은 기본 아이콘으로 fallback (UI가 비지 않게)
export function groupIconOf(icon: string | null | undefined) {
  return icon && icon.trim() ? icon : GROUP_ICON_FALLBACK;
}
