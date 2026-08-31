import type { Metadata } from "next";
import { Geist, Geist_Mono, Gowun_Dodum } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display font: 제목·인사말·로고에만 제한적으로 사용하는 부드러운 한글 폰트.
// (본문/입력/숫자는 가독성을 위해 기존 sans를 유지한다.)
const gowunDodum = Gowun_Dodum({
  variable: "--font-gowun",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "다빈이의 강사일기",
  description: "따뜻한 수업 기록 도우미 — 학생 관리와 영어 수업 자료를 한 번에 정리하는 웹앱",
  // Private beta: 검색엔진 노출을 막는다 (보안 수단이 아니라 노출 최소화 목적).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${gowunDodum.variable} h-full antialiased`}
    >
      <body className="min-h-full text-[#2d2928]">{children}</body>
    </html>
  );
}
