import {
  buildOccurrenceQuickCheckModel,
  type BriefingOccurrence,
  type ClassBriefingLoaded,
} from "@/components/class-briefing";
import { QuickCheckButtons } from "@/components/quick-checks";
import { EMPTY_GROUP_BRIEFING } from "@/lib/supabase/queries/briefing";

// Dashboard hero "빠른 실행"의 [출결 X/Y][숙제 확인 X/Y] — 브리핑 카드와 같은 batch 결과(loaded promise)를
// 기다렸다가 같은 model builder로 만든다 (hero 전용 쿼리 0). Suspense fallback은 기존 링크 버튼.
export async function HeroQuickChecks({
  occurrence,
  loaded,
  today,
  initialNow,
}: {
  occurrence: BriefingOccurrence;
  loaded: ClassBriefingLoaded;
  today: string;
  initialNow: number;
}) {
  const [dataByGroup, autosaveGroupIds] = await Promise.all([loaded.data, loaded.autosave]);
  const model = buildOccurrenceQuickCheckModel(
    occurrence,
    dataByGroup.get(occurrence.groupId) ?? EMPTY_GROUP_BRIEFING,
    autosaveGroupIds.has(occurrence.groupId),
    today,
  );
  return (
    <QuickCheckButtons
      model={model}
      timing={{
        key: occurrence.key,
        startEpoch: occurrence.startEpoch,
        endEpoch: occurrence.endEpoch,
        finalized: occurrence.log?.status === "completed",
      }}
      variant="hero"
      initialNow={initialNow}
    />
  );
}
