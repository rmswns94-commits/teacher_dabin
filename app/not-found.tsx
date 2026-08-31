import Link from "next/link";

import { CatDoodle } from "@/components/cat-doodle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f3ee] px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <CatDoodle className="h-14 w-16" />
          <div className="font-display text-lg font-semibold text-[#2a2323]">
            페이지를 찾을 수 없어요
          </div>
          <p className="text-sm leading-6 text-[#655d5d]">
            주소가 바뀌었거나 삭제된 페이지일 수 있어요.
          </p>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/dashboard">오늘 화면으로 돌아가기</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
