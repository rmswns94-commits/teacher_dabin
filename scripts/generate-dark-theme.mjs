// 다크 테마 오버라이드 CSS 생성기 — app/components의 색상 utility 사용을 추출해
// hex마다 HSL 기반 다크 대응색을 계산하고 .dark 스코프 오버라이드 규칙을 만든다.
// 산출: c:/teacher_dabin/app/theme-dark.generated.css (globals.css가 import)
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "C:/teacher_dabin";
const OUT = join(ROOT, "app/theme-dark.generated.css");

// ── 색 변환: 라이트 hex → 따뜻한 다크 대응색 ──────────────────────────────
function hexToHsl(hex) {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function darkOf(hexRaw) {
  const hex = hexRaw.toLowerCase();
  let { h, s, l } = hexToHsl(hex);
  // 무채색은 따뜻한 톤을 살짝 입힌다 (순검정/순백 대비 부드럽게)
  if (s < 0.03) { h = 300; s = 0.035; }
  let nh = h, ns = s, nl = l;
  if (l >= 0.82) {
    // 배경/보더/파스텔 surface → 어두운 warm surface (밝을수록 더 어둡게 — 위계 유지)
    nl = 0.125 + (1 - l) * 0.55;
    ns = clamp(s * 0.5, 0.03, 0.35);
  } else if (l >= 0.45) {
    if (s >= 0.25) {
      // 채도 있는 액센트(라벤더/민트/피치) — 정체성 유지, 어두운 배경 대비만 확보
      nl = Math.max(l, 0.62);
    } else {
      // 흐린 회갈색 텍스트 → 중간 밝은 회색
      nl = 0.7;
      ns = s * 0.5;
    }
  } else {
    // 진한 잉크/액센트 텍스트 → 밝은 대응색
    nl = 0.86 - l * 0.5;
    if (s < 0.3) ns = clamp(s * 0.6, 0.03, 0.2);
  }
  return hslToHex(nh, ns, nl);
}

// ── 소스에서 색상 utility token 추출 ─────────────────────────────────────
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) files.push(p);
  }
};
walk(join(ROOT, "app"));
walk(join(ROOT, "components"));

const TOKEN_RE = /(?<![\w-])((?:[a-z-]+:)*)(bg|text|border(?:-[trblxy])?|from|via|to|divide|ring|outline|decoration)-(\[#([0-9a-fA-F]{6})\]|white)(?:\/(\d{1,3}))?(?![\w-])/g;
const tokens = new Map(); // full token string → parsed
for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(TOKEN_RE)) {
    const [full, variants, prop, colorPart, hex, alpha] = m;
    if (prop === "text" && colorPart === "white") continue; // 버튼 위 흰 글씨는 유지
    tokens.set(full, { variants: variants ? variants.slice(0, -1).split(":") : [], prop, hex: hex ? hex.toLowerCase() : "ffffff", alpha: alpha ? Number(alpha) : null, raw: full });
  }
}

// ── selector/declaration 조립 ────────────────────────────────────────────
const esc = (cls) => cls.replace(/[:[\]#/.%]/g, (ch) => `\\${ch}`);
const PSEUDO = { hover: ":hover", focus: ":focus", "focus-visible": ":focus-visible", "focus-within": ":focus-within", active: ":active", disabled: ":disabled", first: ":first-child", last: ":last-child", placeholder: "::placeholder" };
const MEDIA = { sm: "(min-width: 40rem)", md: "(min-width: 48rem)", lg: "(min-width: 64rem)", xl: "(min-width: 80rem)", "max-md": "(max-width: 47.999rem)", "max-lg": "(max-width: 63.999rem)", "max-xl": "(max-width: 79.999rem)" };
const PROPS = {
  bg: (c) => `background-color: ${c}`,
  text: (c) => `color: ${c}`,
  border: (c) => `border-color: ${c}`,
  "border-t": (c) => `border-top-color: ${c}`,
  "border-b": (c) => `border-bottom-color: ${c}`,
  "border-l": (c) => `border-left-color: ${c}`,
  "border-r": (c) => `border-right-color: ${c}`,
  "border-x": (c) => `border-left-color: ${c}; border-right-color: ${c}`,
  "border-y": (c) => `border-top-color: ${c}; border-bottom-color: ${c}`,
  from: (c) => `--tw-gradient-from: ${c}`,
  via: (c) => `--tw-gradient-via: ${c}`,
  to: (c) => `--tw-gradient-to: ${c}`,
  ring: (c) => `--tw-ring-color: ${c}`,
  outline: (c) => `outline-color: ${c}`,
  decoration: (c) => `text-decoration-color: ${c}`,
  divide: (c) => `border-color: ${c}`,
};

const rules = [];
const skipped = [];
for (const t of tokens.values()) {
  const dark = darkOf(t.hex);
  const color = t.alpha === null ? dark : `color-mix(in srgb, ${dark} ${t.alpha}%, transparent)`;
  const decl = PROPS[t.prop]?.(color);
  if (!decl) { skipped.push(t.raw); continue; }

  let selector = `.${esc(t.raw)}`;
  let media = null;
  let prefix = ".dark ";
  let ok = true;
  for (const v of t.variants) {
    if (PSEUDO[v]) selector += PSEUDO[v];
    else if (MEDIA[v]) media = MEDIA[v];
    else if (v === "group-hover") prefix = ".dark .group:hover ";
    else { ok = false; break; }
  }
  if (!ok) { skipped.push(t.raw); continue; }
  if (t.prop === "divide") selector += " > :not(:last-child)";

  const rule = `${prefix}${selector} { ${decl}; }`;
  rules.push(media ? `@media ${media} { ${rule} }` : rule);
}

rules.sort();
const header = `/* ⚠ 자동 생성 파일 — 직접 수정하지 말 것.
 * 다크 모드 색상 오버라이드: app/components의 색상 utility(hex/white)마다
 * HSL 기반 warm-dark 대응색을 생성한다 (라이트 디자인 코드는 무변경).
 * 재생성: scratchpad/generate-dark-theme.mjs (색상 추가/변경 후 실행)
 * unlayered 규칙이라 Tailwind utility layer보다 우선한다. */
`;
writeFileSync(OUT, header + rules.join("\n") + "\n", "utf8");
console.log(`tokens: ${tokens.size}, rules: ${rules.length}, skipped: ${skipped.length}`);
if (skipped.length) console.log("skipped:", [...new Set(skipped)].join(", "));
// 팔레트 스팟 확인
for (const sample of ["ffffff", "fdfaf5", "eeeafb", "2d2928", "7b746f", "8b7ae6", "ece0db", "94702f", "e4f4ec"]) {
  console.log(`#${sample} -> ${darkOf(sample)}`);
}
