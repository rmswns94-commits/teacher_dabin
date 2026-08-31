import Link from "next/link";
import { CalendarCheck, CheckCheck, CircleX } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { MakeupStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKoreanDate, todayDateString, toDateString } from "@/lib/dates";
import { getCurrentUserMakeups, type MakeupWithStudent } from "@/lib/supabase/queries/makeups";
import type { StudentGrade } from "@/lib/supabase/types";
import { cancelMakeupAction, completeMakeupAction, scheduleMakeupAction } from "./actions";

const gradeDisplay: Record<StudentGrade, string> = {
  middle_1: "중1",
  middle_2: "중2",
  middle_3: "중3",
  high_1: "고1",
};

function endOfWeekDateString(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + (7 - date.getDay()));
  return toDateString(date);
}

function MakeupCard({ makeup, today }: { makeup: MakeupWithStudent; today: string }) {
  const isOpen = makeup.status === "required" || makeup.status === "scheduled";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            {makeup.student ? (
              <Link href={`/students/${makeup.student.id}`} className="hover:underline">
                {makeup.student.name}
              </Link>
            ) : (
              "학생 정보 없음"
            )}
            {makeup.student ? (
              <span className="rounded-full bg-[#f2effc] px-2 py-0.5 text-[10px] font-normal text-[#5f54b8]">
                {gradeDisplay[makeup.student.grade]}
              </span>
            ) : null}
          </CardTitle>
          <MakeupStatusBadge status={makeup.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-[#f8f3ef] p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#7c6d69]">결석일</div>
            <div className="mt-2 text-sm font-medium text-[#2b2323]">
              {formatKoreanDate(makeup.original_class_date)}
            </div>
          </div>
          <div className="rounded-2xl bg-[#f4f0fe] p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#7c6d69]">놓친 진도</div>
            <div className="mt-2 text-sm font-medium text-[#2b2323]">
              {makeup.missed_progress || "기록 없음"}
            </div>
          </div>
          <div className="rounded-2xl bg-[#edf8f3] p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#7c6d69]">
              {makeup.status === "completed" ? "보충 완료일" : "보충 예정"}
            </div>
            <div className="mt-2 text-sm font-medium text-[#2b2323]">
              {makeup.status === "completed"
                ? formatKoreanDate(makeup.completed_date)
                : makeup.scheduled_date
                  ? `${formatKoreanDate(makeup.scheduled_date)}${makeup.scheduled_date === today ? " (오늘)" : ""}`
                  : "날짜 미정"}
            </div>
          </div>
        </div>

        {makeup.status === "completed" && (makeup.completed_progress || makeup.comment) ? (
          <div className="rounded-2xl bg-[#edf8f2] p-3 text-sm text-[#2f5d4b]">
            {makeup.completed_progress ? <div>보충한 진도: {makeup.completed_progress}</div> : null}
            {makeup.comment ? <div className="mt-1">{makeup.comment}</div> : null}
          </div>
        ) : null}

        {isOpen ? (
          <div className="flex flex-wrap gap-2">
            <details className="group">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg bg-[#f5efe8] px-3 text-sm font-medium text-[#433d3c] transition hover:bg-[#efe6dd] [&::-webkit-details-marker]:hidden">
                <CalendarCheck className="h-3.5 w-3.5" />
                {makeup.status === "required" ? "일정 지정" : "일정 변경"}
              </summary>
              <form
                action={scheduleMakeupAction.bind(null, makeup.id)}
                className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-[#ece0db] bg-[#fffdfb] p-3"
              >
                <input
                  type="date"
                  name="scheduledDate"
                  defaultValue={makeup.scheduled_date ?? ""}
                  className="rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none"
                  required
                />
                <Button type="submit" size="sm">저장</Button>
              </form>
            </details>

            <details className="group">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg bg-[#7a6dd6] px-3 text-sm font-medium text-white transition hover:bg-[#6d5fce] [&::-webkit-details-marker]:hidden">
                <CheckCheck className="h-3.5 w-3.5" />
                완료 처리
              </summary>
              <form
                action={completeMakeupAction.bind(null, makeup.id)}
                className="mt-2 grid gap-2 rounded-2xl border border-[#ece0db] bg-[#fffdfb] p-3 sm:grid-cols-2"
              >
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[#7c6d69]">실제 보충일</span>
                  <input
                    type="date"
                    name="completedDate"
                    defaultValue={makeup.scheduled_date ?? today}
                    className="w-full rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[#7c6d69]">보충한 진도</span>
                  <input
                    name="completedProgress"
                    defaultValue={makeup.missed_progress ?? ""}
                    className="w-full rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-[#7c6d69]">코멘트</span>
                  <textarea
                    name="comment"
                    rows={2}
                    className="w-full rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none"
                    placeholder="관계대명사 부분까지 다시 설명함. 이해도 양호."
                  />
                </label>
                <div className="sm:col-span-2">
                  <Button type="submit" size="sm" className="gap-1.5">
                    <CheckCheck className="h-3.5 w-3.5" /> 보충 완료 저장
                  </Button>
                </div>
              </form>
            </details>

            <form action={cancelMakeupAction.bind(null, makeup.id)}>
              <Button type="submit" variant="outline" size="sm" className="gap-1.5 text-[#8f625f]">
                <CircleX className="h-3.5 w-3.5" /> 취소
              </Button>
            </form>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function MakeupsPage() {
  const makeups = await getCurrentUserMakeups();
  const today = todayDateString();
  const weekEnd = endOfWeekDateString(today);

  const open = makeups.filter((makeup) => makeup.status === "required" || makeup.status === "scheduled");
  const closed = makeups.filter((makeup) => makeup.status === "completed" || makeup.status === "cancelled");

  const requiredCount = open.filter((makeup) => makeup.status === "required").length;
  const todayCount = open.filter((makeup) => makeup.scheduled_date === today).length;
  const weekCount = open.filter(
    (makeup) => makeup.scheduled_date && makeup.scheduled_date >= today && makeup.scheduled_date <= weekEnd,
  ).length;

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title="보충수업"
          description="결석 후 놓친 진도와 보충 일정 상태를 한눈에 관리해보세요."
        />

        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs text-[#8a7b77]">날짜 미정 보충</div>
            <div className="mt-1 text-2xl font-semibold text-[#2b2323]">{requiredCount}건</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-[#8a7b77]">오늘 예정</div>
            <div className="mt-1 text-2xl font-semibold text-[#2b2323]">{todayCount}건</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-[#8a7b77]">이번 주 예정</div>
            <div className="mt-1 text-2xl font-semibold text-[#2b2323]">{weekCount}건</div>
          </Card>
        </div>

        {open.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-[#655d5d]">밀린 보충수업이 없어요 ✨</CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {open.map((makeup) => (
              <MakeupCard key={makeup.id} makeup={makeup} today={today} />
            ))}
          </div>
        )}

        {closed.length > 0 ? (
          <details className="mt-8">
            <summary className="cursor-pointer text-sm font-medium text-[#756a67]">
              지난 보충 기록 {closed.length}건 보기
            </summary>
            <div className="mt-4 grid gap-4 opacity-90">
              {closed.map((makeup) => (
                <MakeupCard key={makeup.id} makeup={makeup} today={today} />
              ))}
            </div>
          </details>
        ) : null}
      </main>
    </AppShell>
  );
}
