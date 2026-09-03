"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { FormEvent, Suspense, useState } from "react";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getAuthErrorMessage } from "@/lib/supabase/auth";
import { Doodle } from "@/components/doodle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    if (!email.trim() || !password.trim()) {
      setMessage("이메일과 비밀번호를 모두 입력해주세요.");
      return;
    }

    if (!isSupabaseConfigured()) {
      setMessage("Supabase 연결 정보가 필요합니다. .env.local에 설정해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setMessage(getAuthErrorMessage(error));
        return;
      }

      router.push(redirectTo.startsWith("/") ? redirectTo : "/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(getAuthErrorMessage(error as { message?: string }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#f7f1eb,_#f3f7f4_45%,_#f8f5fa_100%)] px-4 py-10">
      <Card className="w-full max-w-md p-4 shadow-[0_22px_60px_rgba(120,109,164,0.12)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <Doodle kind="flower" className="h-5 w-5 text-[#c9a9c4]" />
            <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-[#2a2323]">
              강사 일지
            </h1>
            <Doodle kind="leaf" className="h-5 w-5 text-[#9dbfa8]" />
          </div>
          <p className="mt-2 text-sm text-[#716968]">오늘의 수업도 가볍게 기록해봐요.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">이메일</span>
            <div className="flex items-center gap-2 rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5">
              <Mail className="h-4 w-4 text-[#7d6d6b]" />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-[#a79996]"
                placeholder="teacher@example.com"
                type="email"
                autoComplete="email"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">비밀번호</span>
            <div className="flex items-center gap-2 rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5">
              <LockKeyhole className="h-4 w-4 text-[#7d6d6b]" />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className="w-full bg-transparent text-sm outline-none placeholder:text-[#a79996]"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </label>

          {message ? (
            <div className="rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
              {message}
            </div>
          ) : null}

          <Button className="w-full gap-2" disabled={isSubmitting} type="submit">
            {isSubmitting ? "로그인 중..." : "로그인"} <ArrowRight className="h-4 w-4" />
          </Button>

          <div className="text-center text-sm text-[#756a67]">
            <Link href="/forgot-password" className="font-medium text-[#5c4ca8]">
              비밀번호를 잊으셨나요?
            </Link>
          </div>

          <div className="text-center text-sm text-[#756a67]">
            아직 계정이 없나요? <Link href="/signup" className="font-semibold text-[#5c4ca8]">회원가입</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
