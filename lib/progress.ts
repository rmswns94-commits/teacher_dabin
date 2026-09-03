// 공통 진도(canonical)와 legacy 수업 내용(lesson_content) 통합 규칙의 단일 소스.
//
// - canonical field는 daily_logs.default_progress (공통 진도) 하나다.
// - legacy lesson_content는 컬럼/원본 값을 보존하되 신규 저장에는 사용하지 않는다.
// - 이 helper는 migration(20260904_merge_lesson_content_into_progress.sql)과 동일한
//   규칙으로, migration이 아직 적용되지 않은 legacy row를 화면에서 안전하게
//   보여주기 위한 한시적 read helper다. migration 적용 후에는 lesson_content가
//   이미 default_progress에 포함되어 있으므로 중복 표시가 생기지 않는다.
export function mergeLegacyLessonContent(
  defaultProgress: string | null | undefined,
  lessonContent: string | null | undefined,
): string {
  const progress = defaultProgress?.trim() ?? "";
  const legacy = lessonContent?.trim() ?? "";

  if (!legacy) {
    return progress;
  }

  if (!progress) {
    return legacy;
  }

  // 이미 병합된 경우 (migration 적용 완료 or 수동 통합) — 다시 append하지 않는다
  if (progress.includes(legacy)) {
    return progress;
  }

  return `${progress}\n\n${legacy}`;
}
