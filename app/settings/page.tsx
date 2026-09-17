import { AppShell } from "@/components/app-shell";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { InstallAppButton } from "@/components/install-app";
import { LogoutButton } from "@/components/logout-button";
import { PageHeader } from "@/components/page-header";
import { FontSizeControl } from "@/components/font-size-control";
import { ThemeModeControl } from "@/components/theme-mode-control";
import { WorkspaceReset } from "@/components/workspace-reset";
import { Card, CardContent } from "@/components/ui/card";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { getDisplayName } from "@/lib/supabase/auth";
import { getServerUser } from "@/lib/supabase/server";
import { getWorkspaces } from "@/lib/supabase/queries/workspaces";

// 설정 — 사이드바 하단에 상시 노출되던 계정/앱 기능을 한곳에 모은 페이지.
// (기능은 전부 기존 컴포넌트 재사용: PWA 설치, 피드백, 로그아웃)
export default async function SettingsPage() {
  const user = await getServerUser();
  const displayName = getDisplayName(user);
  const email = user?.email ?? "";
  // 학원 목록은 activated_at 최신순 — 첫 항목이 현재 학원이다 (DB의 current_workspace_id()와 같은 규칙)
  const workspaces = await getWorkspaces();
  const activeWorkspace = workspaces[0] ?? null;

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

          {/* 학원 관리 — 학원을 옮겨도 기존 기록은 그대로 보관되고, 새 학원은 빈 상태로 시작한다.
              (migration 적용 전에는 목록이 비어 아무 것도 표시되지 않는다) */}
          {workspaces.length > 0 ? (
            <section className="mt-6">
              <h2 className="card-title text-[#8f5470]">학원</h2>
              <Card className="mt-2">
                <CardContent className="p-4">
                  <WorkspaceSwitcher
                    workspaces={workspaces.map((workspace) => ({
                      id: workspace.id,
                      name: workspace.name,
                    }))}
                    activeId={activeWorkspace?.id ?? null}
                  />
                </CardContent>
              </Card>
            </section>
          ) : null}

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

                {/* 글씨 크기 — 기본/크게/아주 크게 (localStorage, 기기별 설정) */}
                <div className="mt-5 border-t border-dashed border-[#efe4dc] pt-4">
                  <div className="text-base font-medium text-[#2d2928]">글씨 크기</div>
                  <p className="secondary-text mt-0.5 text-[#8a7b77]">
                    기본 · 크게 · 아주 크게 중에서 고를 수 있어요.
                  </p>
                  <div className="mt-3">
                    <FontSizeControl />
                  </div>
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

          <section className="mt-6">
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

          {/* 데이터 관리 — 되돌릴 수 없는 작업이라 다른 설정과 분리해 맨 아래 배치.
              삭제는 2단계 확인("초기화" 입력)을 거쳐야 하고 계정/화면 설정은 유지된다. */}
          <section className="mt-10 pb-10">
            <h2 className="card-title text-[#96534c]">데이터 관리</h2>
            <Card className="mt-2 border-[#f0d9d5]">
              <CardContent className="p-4">
                <div className="text-base font-medium text-[#96534c]">
                  {activeWorkspace ? "현재 학원 데이터 초기화" : "저장된 데이터 전부 초기화"}
                </div>
                <p className="secondary-text mt-0.5 text-[#8a7b77]">
                  {activeWorkspace ? `${activeWorkspace.name}에서 ` : ""}입력한 학생, 수업 그룹,
                  수업 일지, 숙제, 할 일, 출결, 시험 대비, 보충 수업 등 업무 데이터를 모두
                  삭제해요. 이 작업은 되돌릴 수 없어요. 로그인 계정은 삭제되지 않아요.
                  {activeWorkspace ? " 다른 학원의 데이터는 삭제되지 않아요." : ""}
                </p>
                <div className="mt-3">
                  <WorkspaceReset />
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
