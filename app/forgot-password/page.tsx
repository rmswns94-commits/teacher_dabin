"use client";

import Link from "next/link";
import { ArrowRight, BookOpenText, Mail } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAuthErrorMessage } from "@/lib/supabase/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("올바른 이메일 형식을 입력해주세요.");
      return;
    }

    if (!isSupabaseConfigured()) {
      setMessage("Supabase 연결 정보가 필요합니다. .env.local에 설정해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/reset-password`,
      });

      if (error) {
        setMessage(getAuthErrorMessage(error, "비밀번호 재설정 메일을 보내지 못했어요."));
        return;
      }

      setMessage("비밀번호 재설정 메일을 보냈어요. 이메일을 확인해주세요.");
    } catch (error) {
      setMessage(getAuthErrorMessage(error as { message?: string }, "비밀번호 재설정 메일을 보내지 못했어요."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#f7f1eb,_#f3f7f4_45%,_#f8f5fa_100%)] px-4 py-10">
      <Card className="w-full max-w-md p-4 shadow-[0_22px_60px_rgba(120,109,164,0.12)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ebe2ff] to-[#f6dfe9] text-[#433a57] shadow-sm">
            <BookOpenText className="h-5 w-5" />
          </div>
          <h1 className="font-display mt-4 text-2xl font-semibold tracking-[-0.01em] text-[#2a2323]">
            다빈이의 강사일기
          </h1>
          <p className="mt-2 text-sm text-[#716968]">비밀번호를 다시 설정해보세요.</p>
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

          {message ? (
            <div className="rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
              {message}
            </div>
          ) : null}

          <Button className="w-full gap-2" disabled={isSubmitting} type="submit">
            {isSubmitting ? "메일 보내는 중..." : "재설정 링크 보내기"} <ArrowRight className="h-4 w-4" />
          </Button>

          <div className="text-center text-sm text-[#756a67]">
            로그인으로 돌아가기 <Link href="/login" className="font-semibold text-[#5c4ca8]">로그인</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
