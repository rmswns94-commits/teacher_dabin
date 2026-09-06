// 단어시험 오답 순수 헬퍼 — 정규화/시험 내 dedupe/학생 단위 집계.
// 정규화는 "대소문자 + 공백"까지만 (Environment == environment). 형태소/어간 등 NLP 금지.

export function vocabWordKey(word: string) {
  return word.trim().replace(/\s+/g, " ").toLowerCase();
}

// 같은 시험(폼/저장) 안에서의 dedupe: 먼저 입력한 표기를 유지하고 순서를 보존한다.
export function dedupeVocabWords(words: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of words) {
    const word = raw.trim().replace(/\s+/g, " ");
    const key = vocabWordKey(word);

    if (!word || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(word);
  }

  return result;
}

export type VocabMistakeAggregate = {
  word: string; // 표시용 — 가장 최근 occurrence의 원래 표기
  count: number;
  lastAt: string; // 가장 최근 occurrence의 created_at
};

// 학생의 오답 occurrence를 word 정규화 키 기준으로 집계한다.
// 정렬: 빈도 내림차순 → 동률이면 최근 occurrence 우선 → 그래도 같으면 단어 사전순 (안정적).
export function aggregateVocabMistakes(
  rows: { word: string; created_at: string }[],
): VocabMistakeAggregate[] {
  const map = new Map<string, VocabMistakeAggregate>();

  for (const row of rows) {
    const key = vocabWordKey(row.word);

    if (!key) {
      continue;
    }

    const existing = map.get(key);

    if (!existing) {
      map.set(key, { word: row.word.trim().replace(/\s+/g, " "), count: 1, lastAt: row.created_at });
    } else {
      existing.count += 1;

      if (row.created_at > existing.lastAt) {
        existing.lastAt = row.created_at;
        existing.word = row.word.trim().replace(/\s+/g, " ");
      }
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      b.count - a.count ||
      b.lastAt.localeCompare(a.lastAt) ||
      a.word.localeCompare(b.word),
  );
}
