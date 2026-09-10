import { AppShell } from "@/components/app-shell";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { InstallAppButton } from "@/components/install-app";
import { LogoutButton } from "@/components/logout-button";
import { PageHeader } from "@/components/page-header";
import { ThemeModeControl } from "@/components/theme-mode-control";
import { Card, CardContent } from "@/components/ui/card";
import { getDisplayName } from "@/lib/supabase/auth";
import { getServerUser } from "@/lib/supabase/server";

// 설정 — 사이드바 하단에 상시 노출되던 계정/앱 기능을 한곳에 모은 페이지.
// (기능은 전부 기존 컴포넌트 재사용: PWA 설치, 피드백, 로그아웃)
export default async function SettingsPage() {
  const user = await getServerUser();
  const displayName = getDisplayName(user);
  const email = user?.email ?? "";

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <PageHeader title="설정" description="강사 일지의 계정과 앱 설정을 관리해요." />

          <section>
            <h2 className="card-title text-[#8f5470]">내 정보</h2>
            <Card className="mt-2">
              <CardContent className="flex items-center gap-3 p-4">
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2b2b31] text-base font-semibold text-white shadow-sm"
                >
                  {displayName.trim().charAt(0) || "선"}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[#232327]">{displayName}</div>
                  {email ? (
                    <div className="secondary-text truncate text-[#8a8a93]">{email}</div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="mt-6">
            <h2 className="card-title text-[#8f5470]">화면 설정</h2>
            <Card className="mt-2">
              <CardContent className="p-4">
                <div className="text-base font-medium text-[#2d2928]">화면 모드</div>
                <p className="secondary-text mt-0.5 text-[#8a7b77]">
                  라이트 · 다크 · 시스템 중에서 고를 수 있어요.
                </p>
                <div className="mt-3">
                  <ThemeModeControl />
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="mt-6">
            <h2 className="card-title text-[#8f5470]">앱</h2>
            <Card className="mt-2">
              <CardContent className="p-4">
                <div className="text-base font-medium text-[#2d2928]">
                  강사 일지를 앱처럼 사용하기
                </div>
                <p className="secondary-text mt-0.5 text-[#8a7b77]">
                  홈 화면에 추가하면 앱처럼 빠르게 실행할 수 있어요.
                </p>
                <div className="mt-3">
                  <InstallAppButton />
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="mt-6">
            <h2 className="card-title text-[#8f5470]">도움</h2>
            <Card className="mt-2">
              <CardContent className="p-4">
                <div className="text-base font-medium text-[#2d2928]">피드백 보내기</div>
                <p className="secondary-text mt-0.5 text-[#8a7b77]">
                  불편한 점이나 필요한 기능을 알려주세요.
                </p>
                <div className="mt-3">
                  <FeedbackDialog />
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="mt-6 pb-10">
            <h2 className="card-title text-[#8f5470]">계정</h2>
            <Card className="mt-2">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="text-base font-medium text-[#2d2928]">로그아웃</div>
                  <p className="secondary-text mt-0.5 text-[#8a7b77]">
                    현재 기기에서 로그아웃해요. 다시 사용하려면 로그인이 필요해요.
                  </p>
                </div>
                <LogoutButton />
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
