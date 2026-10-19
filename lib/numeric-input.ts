// 숫자 전용 입력칸 공용 규칙 (수업일지 시험 점수 · 재시험 점수).
// - digitsOnly: 숫자만, 최대 3자리 (문항 수/맞은 개수 범위)
// - isComposingEvent: 한글 조합(composition) 도중 값을 재작성하면 iPad Safari에서 자모가 씹힐 수 있어,
//   조합 중에는 raw를 유지하고 조합이 끝나는 시점(onCompositionEnd)과 일반 입력에서만 정리한다.
export const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 3);

export function isComposingEvent(event: { nativeEvent: object }) {
  return Boolean((event.nativeEvent as { isComposing?: boolean }).isComposing);
}
