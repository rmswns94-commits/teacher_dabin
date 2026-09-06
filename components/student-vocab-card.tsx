"use client";

import { useState, useTransition } from "react";

import { createStudentWeaknessAction } from "@/app/students/weakness-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKoreanDate } from "@/lib/dates";
import { vocabPercent } from "@/lib/elementary";
import { vocabWordKey } from "@/lib/vocab";

export type StudentVocabRow = {
  id: string;
  date: string | null; // 수업 날짜 (YYYY-MM-DD)
  correct: number;
  total: number;
  retest: boolean;
  words: string[]; // 그 시험에서 틀린 단어
};

export type FrequentMistake = { word: string; count: number };

// 학생 상세의 단어시험 카드: 최근 점수 기록(오답 병기) + 자주 틀리는 단어 집계.
// [복습 등록]은 Teacher가 직접 누를 때만 Phase 1 약점 노트로 연결한다 — 자동 생성 없음.
export function StudentVocabCard({
  studentId,
  rows,
  frequentWords,
  defaultDueDate,
}: {
  studentId: string;
  rows: StudentVocabRow[];
  frequentWords: FrequentMistake[];
  defaultDueDate: string; // 복습 등록 시 다음 확인 날짜 기본값 (없으면 "")
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingWord, setPendingWord] = useState<string | null>(null);
  const [registeredWords, setRegisteredWords] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const registerWeakness = (item: FrequentMistake) => {
    const key = vocabWordKey(item.word);
    setError("");
    setPendingWord(key);
    startTransition(async () => {
      const result = await createStudentWeaknessAction({
        studentId,
        groupId: "",
        sourceDailyLogId: "",
        category: "vocabulary",
        title: `${item.word} 철자`,
        note: `단어시험 반복 오답 ${item.count}회`,
        reviewDueDate: defaultDueDate,
      });
      setPendingWord(null);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setRegisteredWords((prev) => new Set(prev).add(key));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>단어시험</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl bg-[#f8f3ef] p-3 text-xs text-[#655d5d]">
            아직 단어시험 기록이 없어요.
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl bg-[#f8f6fc] px-3 py-2">
                <div className="flex items-center justify-between text-xs tabular-nums">
                  <span className="text-[#564d4d]">{formatKoreanDate(row.date)}</span>
                  <span className="font-medium text-[#33333b]">
                    {row.correct} / {row.total}
                  </span>
                  <span className="text-[#54479c]">
                    {vocabPercent(row.correct, row.total)}%{row.retest ? " · 재시험" : ""}
                  </span>
                </div>
                {row.words.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.words.map((word) => (
                      <span
                        key={word}
                        className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#7a5a92]"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {frequentWords.length > 0 ? (
          <div>
            <div className="text-xs font-semibold text-[#7c6d69]">자주 틀리는 단어</div>
            <div className="mt-1.5 space-y-1">
              {frequentWords.map((item) => {
                const key = vocabWordKey(item.word);
                const registered = registeredWords.has(key);
                const rowPending = isPending && pendingWord === key;

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 rounded-xl bg-[#fdf8ec] px-3 py-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate font-medium text-[#33333b]">{item.word}</span>
                    <span className="shrink-0 tabular-nums text-[#8a6828]">{item.count}회</span>
                    {registered ? (
                      <span className="shrink-0 text-[#3d7f64]">약점 노트 등록됨 ✓</span>
                    ) : (
                      <button
                        type="button"
                        disabled={rowPending}
                        onClick={() => registerWeakness(item)}
                        className="shrink-0 rounded-lg border border-[#ecd9b4] bg-white px-2 py-1 font-medium text-[#8a6828] transition hover:bg-[#fdf3e4] disabled:opacity-50"
                        title="약점 노트에 복습 항목으로 등록"
                      >
                        {rowPending ? "등록 중..." : "복습 등록"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {error ? <p className="mt-1.5 text-xs text-[#a2665f]">{error}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
