import Link from "next/link";
import { FileText, Sparkles } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function PassagesPage() {
  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title="영어 지문"
          description="수업에 쓸 영어 지문을 모아두는 공간이에요."
        />

        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-[#655d5d]">
            <div className="flex items-center gap-2 font-medium text-[#3d3450]">
              <FileText className="h-4 w-4 text-[#6652b9]" aria-hidden />
              지문 저장과 문제 만들기 기능을 준비하고 있어요 <Sparkles className="h-3.5 w-3.5 text-[#c5b6e3]" aria-hidden />
            </div>
            <p className="leading-6">
              다음 업데이트에서 영어 지문을 저장하고, 지문으로 문제를 만드는 기능이 열릴 예정이에요.
              <br />
              지금은 수업 일지와 학생 관리를 먼저 사용해보세요.
            </p>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/dashboard">오늘 화면으로 돌아가기</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
