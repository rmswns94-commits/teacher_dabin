import Link from "next/link";
import { ArrowRight, BookText, Sparkles, Users, NotebookPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const features = [
  { icon: Users, label: "학생 관리" },
  { icon: NotebookPen, label: "수업 일지" },
  { icon: BookText, label: "출결 관리" },
  { icon: Sparkles, label: "보충수업 체크" },
  { icon: BookText, label: "영어 지문 정리" },
  { icon: NotebookPen, label: "문제 세트 관리" },
];

export function WelcomeHero() {
  return (
    <div className="flex w-full flex-col gap-8">
      <div className="rounded-[32px] border border-[#f0e0d8] bg-[radial-gradient(circle_at_top_left,_rgba(239,227,255,0.7),_rgba(255,255,255,0.96)_45%)] p-8 shadow-[0_20px_50px_rgba(105,91,130,0.08)] md:p-10">
        <div className="flex items-center gap-3 text-[#4b3e52]">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#e9e0ff] to-[#f9dfe7] text-[#473d60] shadow-sm">
            <NotebookPen className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-xl font-semibold">다빈이의 강사일기</div>
            <div className="text-xs text-[#7c6f6d]">수업 준비부터 학생 관리까지, 선생님의 하루를 더 가볍게.</div>
          </div>
        </div>

        <div className="mt-8 grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#ecd8ef] bg-[#f9f5ff] px-3 py-1.5 text-xs font-medium text-[#6d5bb5]">
              <Sparkles className="h-3.5 w-3.5" />
              귀엽고 따뜻한 수업 다이어리
            </div>
            <h1 className="max-w-xl font-display text-4xl font-semibold tracking-[-0.02em] text-[#271f1f] md:text-5xl">
              오늘의 수업, 학생 기록, 보충까지 한 번에 정리해요.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-[#615856]">
              수업 준비에서 학생별 코멘트, 결석 보완까지 한눈에. 하루를 더 차분하고 체계적으로 운영해보세요.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dashboard">
                <Button className="gap-2">
                  시작하기 <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="secondary">대시보드 둘러보기</Button>
              </Link>
              <Link href="/login">
                <Button variant="outline">로그인</Button>
              </Link>
              <Link href="/signup">
                <Button variant="accent">회원가입</Button>
              </Link>
            </div>
          </div>

          <Card className="border-[#f0e5df] bg-white/90 p-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#4a3d3d]">오늘 수업</span>
                <span className="rounded-full bg-[#f4edf9] px-2 py-1 text-xs font-medium text-[#564b83]">3개</span>
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl bg-[#f7f5fb] p-3">
                  <div className="text-sm text-[#534b4a]">중2 화목반</div>
                  <div className="mt-1 text-xs text-[#756c6b]">Unit 3 p.48~53 · 3:30 PM</div>
                </div>
                <div className="rounded-2xl bg-[#fff4f1] p-3">
                  <div className="text-sm text-[#534b4a]">결석 1명</div>
                  <div className="mt-1 text-xs text-[#756c6b]">보충 수업 체크 필요</div>
                </div>
                <div className="rounded-2xl bg-[#edf9f3] p-3">
                  <div className="text-sm text-[#534b4a]">보충 필요 2건</div>
                  <div className="mt-1 text-xs text-[#756c6b]">완료 처리 전</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#2b2323]">주요 기능 미리보기</h2>
          <span className="text-xs text-[#8a7c7a]">선생님 하루를 더 편하게</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="rounded-[22px] border border-[#f0e3df] bg-white/90 p-4 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5efe8] text-[#655d8a]">
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-3 text-sm font-medium text-[#3a2f2f]">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <Card className="bg-[#fffaf7] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-[#3f3633]">오늘 수업 기록하고, 학생별 코멘트를 남기고, 놓친 보충수업까지 한눈에 관리해보세요.</div>
          </div>
          <div className="flex gap-3 text-sm text-[#645857]">
            <span className="rounded-full bg-[#eef4f0] px-3 py-1">오늘 수업 3개</span>
            <span className="rounded-full bg-[#f7eff4] px-3 py-1">결석 1명</span>
            <span className="rounded-full bg-[#f8efe5] px-3 py-1">보충 필요 2건</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
