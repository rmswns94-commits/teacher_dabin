"use client";

import { useRouter } from "next/navigation";
import { Pencil, Plus, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { updateGroupHighlightAction } from "@/app/groups/actions";
import { Tape } from "@/components/doodle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// 그룹 전체 수정 모드에 들어가지 않고 하이라이트만 인라인으로 등록/수정한다.
export function HighlightCard({
  groupId,
  initialHighlight,
}: {
  groupId: string;
  initialHighlight: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialHighlight);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const startEditing = () => {
    setDraft(text);
    setError("");
    setSavedMessage("");
    setEditing(true);
  };

  const save = () => {
    setError("");
    startTransition(async () => {
      const result = await updateGroupHighlightAction(groupId, draft);

      if (result?.error) {
        setError(result.error);
        return;
      }

      setText(draft.trim());
      setEditing(false);
      setSavedMessage("하이라이트를 저장했어요.");
      setTimeout(() => setSavedMessage(""), 2500);
      router.refresh();
    });
  };

  return (
    <div className="relative mt-5">
      <Tape className="rotate-[2deg] bg-[#e6ddf5]/85" />
      <Card className="border-[#e8ddf3] bg-gradient-to-br from-[#fbf8ff] to-[#fdf6ee]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#6d5aa8]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> 하이라이트
          </div>
          {savedMessage ? <span className="text-xs text-[#3d7f64]">{savedMessage}</span> : null}
        </div>

        {editing ? (
          <div className="mt-3 space-y-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              maxLength={500}
              autoFocus
              placeholder={"이번 주 Unit 3 마무리 예정.\n민수 단어 테스트 재확인."}
              className="w-full rounded-2xl border border-[#e2d8f3] bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
              aria-label="하이라이트 내용"
            />

            {error ? (
              <div className="rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setEditing(false)}>
                취소
              </Button>
              <Button type="button" size="sm" disabled={isPending} onClick={save}>
                {isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        ) : text ? (
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="whitespace-pre-line text-sm leading-6 text-[#3d3450]">{text}</div>
            <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={startEditing}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> 수정
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-[#9a8db5]">아직 등록된 하이라이트가 없어요.</span>
            <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={startEditing}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> 하이라이트 등록
            </Button>
          </div>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
