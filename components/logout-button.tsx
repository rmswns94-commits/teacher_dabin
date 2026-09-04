"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

// 설정 페이지의 로그아웃 — 기존 Supabase signOut 흐름 그대로
// (세션 쿠키 제거 → login 이동, persistent 세션 정책과 일관)
export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleSignOut = async () => {
    setIsPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isPending}
      className="flex min-h-11 items-center gap-2 rounded-2xl border border-[#f0dcd8] bg-white px-4 py-2.5 text-sm font-medium text-[#8f625f] transition hover:bg-[#fdf4f1] disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" aria-hidden />
      {isPending ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}
