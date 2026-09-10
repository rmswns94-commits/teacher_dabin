import { Quote, Sparkles } from "lucide-react";

// 성장노트 상단 "오늘의 명언" 배너 — 날짜 기준으로 서버에서 고른 문구를 그대로 그린다
// (client 상호작용 없음). 성장노트의 파스텔 카드 톤과 맞춘다.
export function DailyQuoteCard({ quote }: { quote: string }) {
  return (
    <section
      aria-label="오늘의 명언"
      className="relative mb-6 overflow-hidden rounded-3xl border border-[#e2d8f3] bg-gradient-to-br from-[#faf7ff] via-[#f3edfb] to-[#ecf5f0] p-5 shadow-sm"
    >
      <Sparkles className="absolute right-4 top-4 h-4 w-4 text-[#c8b6e8]" aria-hidden />
      <Sparkles className="absolute bottom-3 right-10 h-3 w-3 text-[#b9d8c8]" aria-hidden />
      <div className="flex items-center gap-1.5 text-sm font-semibold text-[#5c4a9c]">
        <Quote className="h-3.5 w-3.5" aria-hidden />
        오늘의 명언
      </div>
      <p className="mt-2 text-lg leading-relaxed text-[#463c58]">{quote}</p>
    </section>
  );
}
