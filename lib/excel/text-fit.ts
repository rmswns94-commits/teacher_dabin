// 줄바꿈(wrap) 셀에 긴 글이 몇 줄로 보일지 추정 — Excel 실측 기반의 보수적 근사.
// Excel의 자동 행 높이는 병합 셀에 동작하지 않아, 양식 칸에 긴 내용이 들어가면 인쇄에서 잘린다.
// export 시 이 추정으로 필요한 높이를 계산해 넘칠 때만 행을 늘린다 (데이터가 잘려 숨지 않게).
//
// 글자 폭(글꼴 크기 em 기준): 한글/한자/전각/긴 대시 = 1em, 공백 ≈ 0.3em, 그 외(영문/숫자/기호) ≈ 0.58em.
// Excel은 단어 단위로 줄을 바꿔 줄 끝이 비므로 칸 폭의 90%만 쓴다고 본다 (실제보다 약간 많게 추정 →
// 칸이 조금 넉넉해질 수는 있어도 잘리지는 않는 방향).

function charWidthEm(char: string) {
  const code = char.codePointAt(0) ?? 0;
  if (char === " ") {
    return 0.3;
  }
  if ((code >= 0x1100 && code <= 0x11ff) || code >= 0x2010) {
    return 1;
  }
  return 0.58;
}

export function estimateWrappedLines(text: string, cellWidthPt: number, fontSizePt: number) {
  const usableEm = (cellWidthPt * 0.9) / fontSizePt;
  return text.split("\n").reduce((total, line) => {
    const widthEm = [...line].reduce((sum, char) => sum + charWidthEm(char), 0);
    return total + Math.max(1, Math.ceil(widthEm / usableEm));
  }, 0);
}
