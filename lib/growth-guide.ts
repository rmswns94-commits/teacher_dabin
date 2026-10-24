// 성장노트 "왕은 어떻게 선정되나요?" 안내 카드의 단일 데이터 소스.
//
// - 9개 성장왕(lib/growth.ts growthAchievementValues)과 6개 왕(lib/growth-awards.ts growthAwardKeys)
//   registry를 그대로 map 해서 항목을 만든다 → 안내 개수가 실제 정의 개수와 구조적으로 같다 (drift 불가).
// - 문구/숫자는 각 모듈의 guide helper가 계산 constant(GROWTH_CONFIG, getGrowthAwardMinimums)에서 만든다.
// - 여기서는 왕을 다시 계산하거나 쿼리하지 않는다 (설명 metadata만).

import { growthAchievementValues, growthBadgeGuideItems, type GrowthBadgeGuideItem } from "@/lib/growth";
import {
  growthAwardGuideItems,
  growthAwardGuideKingText,
  growthAwardGuideNotes,
  growthAwardKeys,
  type GrowthAwardGuideItem,
} from "@/lib/growth-awards";
import type { GrowthViewMode } from "@/lib/growth-note";
import { ASSESSMENT_CATEGORIES, ASSESSMENT_RANKS, assessmentRankEmoji } from "@/lib/assessments";

export type GrowthGuideSection<T> = { title: string; subtitle: string; items: T[] };

export type GrowthGuide = {
  unit: string; // "이번 주" | "이번 달"
  intro: string; // compact 헤더 한 줄
  toggleLabel: string; // "15개의 왕 선정 기준 보기"
  badgeCount: number; // 9
  awardCount: number; // 6
  totalCount: number; // 15
  badges: GrowthGuideSection<GrowthBadgeGuideItem>;
  awards: GrowthGuideSection<GrowthAwardGuideItem>;
  kingText: string; // 왕중왕 — 성장왕+왕에 포함되지 않는 종합 타이틀
  notes: readonly string[];
  // 시험 결과 배지 (월말평가 1·2·3등) — 성장왕/왕이 아니고 왕중왕 개수에도 넣지 않는다
  rankBadges: { title: string; text: string; items: { key: string; emoji: string; label: string }[] } | null;
};

export function buildGrowthGuide(mode: GrowthViewMode): GrowthGuide {
  const unit = mode === "month" ? "이번 달" : "이번 주";
  const badgeCount = growthAchievementValues.length;
  const awardCount = growthAwardKeys.length;
  return {
    unit,
    intro: `${unit} 기록을 바탕으로 성장왕 ${badgeCount}개와 왕 ${awardCount}개를 자동으로 선정해요.`,
    toggleLabel: `${badgeCount + awardCount}개의 왕 선정 기준 보기`,
    badgeCount,
    awardCount,
    totalCount: badgeCount + awardCount,
    badges: {
      title: `성장왕 ${badgeCount}개`,
      subtitle: "학생마다 따로 판정해요. 기준을 넘긴 학생은 모두 받아요.",
      items: growthBadgeGuideItems(mode),
    },
    awards: {
      title: `왕 ${awardCount}개`,
      subtitle: "반 학생끼리 비교해요. 기록이 충분한 학생 중 가장 높은 학생이 받고, 동점이면 함께 받아요.",
      items: growthAwardGuideItems(mode),
    },
    kingText: growthAwardGuideKingText(mode),
    notes: growthAwardGuideNotes(),
    rankBadges: rankBadgeGuide(unit),
  };
}

function rankBadgeGuide(unit: string): GrowthGuide["rankBadges"] {
  const meta = ASSESSMENT_CATEGORIES.find((item) => item.supportsRank);
  if (!meta) {
    return null;
  }
  return {
    title: `${meta.label} 배지`,
    text: `${unit} ${meta.label}에서 선생님이 고른 등수대로 보여줘요. 공동 등수도 함께 받아요. 왕이 아니라 시험 결과 배지라 왕중왕 개수에는 넣지 않아요.`,
    items: ASSESSMENT_RANKS.map((rank) => ({ key: `rank-${rank}`, emoji: assessmentRankEmoji[rank], label: `${meta.label} ${rank}등` })),
  };
}
