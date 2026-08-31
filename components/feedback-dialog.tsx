"use client";

import { usePathname } from "next/navigation";
import { MessageSquareHeart } from "lucide-react";
import { useState, useTransition } from "react";

import { sendFeedbackAction } from "@/app/feedback-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const categories = [
  { value: "bug", label: "버그" },
  { value: "ux", label: "불편함" },
  { value: "feature", label: "기능 제안" },
  { value: "other", label: "기타" },
] as const;

export function FeedbackDialog() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<(typeof categories)[number]["value"]>("ux");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const openDialog = () => {
    setError("");
    setSent(false);
    setOpen(true);
  };

  const send = () => {
    setError("");
    startTransition(async () => {
      const result = await sendFeedbackAction({ category, message, pagePath: pathname });

      if (result?.error) {
        // 실패해도 작성한 내용은 그대로 유지된다.
        setError(result.error);
        return;
      }

      setMessage("");
      setSent(true);
      setTimeout(() => setOpen(false), 1800);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#e9def0] bg-[#fbf8ff] px-3 py-2 text-sm font-medium text-[#5d5370] transition hover:bg-[#f4eefb]"
      >
        <MessageSquareHeart className="h-4 w-4 text-[#8a76c0]" aria-hidden />
        피드백 보내기
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="피드백 보내기"
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            {sent ? (
              <div className="py-6 text-center text-sm leading-6 text-[#3d6d58]">
                의견 고마워요 🌷
                <br />더 편하게 쓸 수 있도록 참고할게요.
              </div>
            ) : (
              <>
                <div className="text-base font-semibold text-[#2a2323]">피드백 보내기 💌</div>
                <p className="mt-1 text-xs text-[#8a7b77]">어떤 점이 불편했나요?</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {categories.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setCategory(item.value)}
                      aria-pressed={category === item.value}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        category === item.value
                          ? "border-[#d8cdf0] bg-[#f3eefc] text-[#5d4ba5]"
                          : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="자유롭게 적어주세요. 작은 불편함도 큰 도움이 돼요."
                  className="mt-3 w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                  aria-label="피드백 내용"
                />

                {error ? (
                  <div className="mt-2 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
                    {error}
                  </div>
                ) : null}

                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setOpen(false)}>
                    취소
                  </Button>
                  <Button type="button" size="sm" disabled={isPending || !message.trim()} onClick={send}>
                    {isPending ? "보내는 중..." : "보내기"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
