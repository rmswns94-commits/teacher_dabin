"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenText, LockKeyhole, Mail, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAuthErrorMessage } from "@/lib/supabase/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    if (!name.trim()) {
      setMessage("이름을 입력해주세요.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("올바른 이메일 형식을 입력해주세요.");
      return;
    }

    if (password.length < 8) {
      setMessage("비밀번호는 8자 이상이어야 해요.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("비밀번호가 일치하지 않아요.");
      return;
    }

    if (!isSupabaseConfigured()) {
      setMessage("Supabase 연결 정보가 필요합니다. .env.local에 설정해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: name.trim(),
          },
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
        },
      });

      if (error) {
        setMessage(getAuthErrorMessage(error));
        return;
      }

      if (data.user && !data.session) {
        setMessage("인증 메일을 보냈어요 💌\n이메일에서 인증 링크를 눌러 가입을 완료해주세요.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(getAuthErrorMessage(error as { message?: string }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#f7f1eb,_#f4f6f5_44%,_#faf7fb_100%)] px-4 py-10">
      <Card className="w-full max-w-md p-4 shadow-[0_22px_60px_rgba(120,109,164,0.12)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ebe2ff] to-[#f6dfe9] text-[#433a57] shadow-sm">
            <BookOpenText className="h-5 w-5" />
          </div>
          <h1 className="font-display mt-4 text-2xl font-semibold tracking-[-0.01em] text-[#2a2323]">
            강사 일지
          </h1>
          <p className="mt-2 text-sm text-[#716968]">선생님의 수업 기록을 더 편하게</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">이름</span>
            <div className="flex items-center gap-2 rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5">
              <UserRound className="h-4 w-4 text-[#7d6d6b]" />
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-[#a79996]"
                placeholder="김다빈"
                autoComplete="name"
              />
            </div>
          </label>

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
                autoComplete="new-password"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">비밀번호 확인</span>
            <div className="flex items-center gap-2 rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5">
              <LockKeyhole className="h-4 w-4 text-[#7d6d6b]" />
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                className="w-full bg-transparent text-sm outline-none placeholder:text-[#a79996]"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          </label>

          {message ? (
            <div className="rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57] whitespace-pre-line">
              {message}
            </div>
          ) : null}

          <Button className="w-full gap-2" disabled={isSubmitting} type="submit">
            {isSubmitting ? "가입 중..." : "회원가입"} <ArrowRight className="h-4 w-4" />
          </Button>

          <div className="text-center text-sm text-[#756a67]">
            이미 계정이 있나요? <Link href="/login" className="font-semibold text-[#5c4ca8]">로그인</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
