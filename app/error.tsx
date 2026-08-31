"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app error boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f3ee] px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="font-display text-lg font-semibold text-[#2a2323]">
            문제가 발생했어요
          </div>
          <p className="text-sm leading-6 text-[#655d5d]">
            잠시 후 다시 시도해주세요.
            <br />
            같은 문제가 반복되면 피드백으로 알려주세요.
          </p>
          <Button variant="secondary" size="sm" onClick={reset}>
            다시 시도
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
