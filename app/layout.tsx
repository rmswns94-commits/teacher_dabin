import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { NavHistoryTracker } from "@/components/nav-history-tracker";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 손글씨 display 폰트(Hi Melody)는 제거했다 — 앱 전체를 하나의 sans stack으로 통일
// (font-display 유틸은 globals.css에서 본문과 같은 stack을 가리킨다). 웹폰트 요청도 하나 줄었다.

export const metadata: Metadata = {
  title: "강사 일지",
  applicationName: "강사 일지",
  description: "따뜻한 수업 기록 도우미 — 수업 일지와 학생 관리를 한 번에 정리하는 웹앱",
  // Private beta: 검색엔진 노출을 막는다 (보안 수단이 아니라 노출 최소화 목적).
  robots: { index: false, follow: false },
  // iOS 홈 화면 설치(standalone) 지원. statusBarStyle은 밝은 배경과 자연스러운 default.
  appleWebApp: {
    capable: true,
    title: "강사 일지",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png?v=2",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 상단 바/사이드바가 화이트라 브라우저 UI 색도 화이트로 맞춘다.
  themeColor: "#ffffff",
};

// 첫 페인트 전에 저장된 테마를 적용하는 스크립트 (FOUC 방지 — head에서 동기 실행).
// 저장값 없음 = 기존 사용자와 동일한 라이트. "system"일 때만 OS prefers-color-scheme을
// 따르고, OS 설정 변경도 실시간 반영한다. SSR에서는 localStorage에 접근하지 않는다.
const themeInitScript = `(function(){try{var k="dabin-theme";var c=document.documentElement.classList;var m=window.matchMedia("(prefers-color-scheme: dark)");function apply(){var t=localStorage.getItem(k);var d=t==="dark"||(t==="system"&&m.matches);d?c.add("dark"):c.remove("dark");}apply();m.addEventListener("change",apply);window.addEventListener("storage",apply);}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      // 테마 클래스는 head 스크립트가 hydration 전에 붙인다 — 서버 markup과의
      // class 차이는 의도된 것 (테마 기능 표준 패턴)
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full text-base text-[#2d2928]">
        <ServiceWorkerRegistration />
        <NavHistoryTracker />
        <PullToRefresh />
        {children}
      </body>
    </html>
  );
}
