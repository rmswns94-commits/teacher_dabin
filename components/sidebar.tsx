"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderKanban,
  Heart,
  Home,
  LogOut,
  Menu,
  NotebookPen,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { FeedbackDialog } from "@/components/feedback-dialog";
import { createClient } from "@/lib/supabase/client";
import { getDisplayName } from "@/lib/supabase/auth";
import { cn } from "@/lib/utils";

function BetaBadge() {
  return (
    <span className="rounded-full bg-[#f3eefc] px-1.5 py-0.5 text-[10px] font-medium text-[#5d4eb2]">
      Beta
    </span>
  );
}

const topItems = [{ label: "오늘", href: "/dashboard", icon: Home }];

const lessonItems = [
  { label: "수업 일지", href: "/daily-logs", icon: NotebookPen },
  { label: "학생", href: "/students", icon: Users },
];

const afterGroupItems = [{ label: "보충수업", href: "/makeups", icon: CalendarCheck }];

const materialItems = [{ label: "영어 지문", href: "/passages", icon: FileText }];

export type SidebarGroup = { id: string; name: string };

function NavLink({
  label,
  href,
  icon: Icon,
  isActive,
}: {
  label: string;
  href: string;
  icon: typeof Home;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all",
        isActive
          ? "bg-[#fbe9f0] text-[#6d4a5c] shadow-sm ring-1 ring-[#f4d8e2]"
          : "text-[#564d4d] hover:bg-[#faf0f2] hover:text-[#2e2828]",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-xl",
          isActive ? "bg-white text-[#c06a8f]" : "bg-[#f6f1ee] text-[#685d5d]",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </Link>
  );
}

export function Sidebar({ groups }: { groups: SidebarGroup[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState("선생님");
  const [userEmail, setUserEmail] = useState("");
  const inGroupsSection = pathname === "/groups" || pathname.startsWith("/groups/");
  const [groupsOpen, setGroupsOpen] = useState(inGroupsSection);
  const [mobileOpen, setMobileOpen] = useState(false);

  // 모바일 드로어는 페이지를 이동하면 자동으로 닫는다 (render 중 상태 조정 패턴).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (mobileOpen) {
      setMobileOpen(false);
    }
  }

  useEffect(() => {
    const supabase = createClient();

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUserName(getDisplayName(user));
        setUserEmail(user.email ?? "");
      }
    };

    void loadUser();
  }, []);

  // Entering the groups section (e.g. via dashboard quick action) opens the tree.
  // Adjust-state-during-render pattern instead of an effect.
  const [wasInGroupsSection, setWasInGroupsSection] = useState(inGroupsSection);
  if (inGroupsSection !== wasInGroupsSection) {
    setWasInGroupsSection(inGroupsSection);
    if (inGroupsSection) {
      setGroupsOpen(true);
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-[#f5e2dc] bg-[#fff8f4]/95 px-4 backdrop-blur-sm lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="메뉴 열기"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#564d4d] transition hover:bg-[#faf0f2]"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="font-display text-sm font-semibold text-[#2d2424]">다빈이의 강사일기</span>
        <BetaBadge />
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-[#2b2323]/30 lg:hidden"
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "flex h-screen w-full max-w-[260px] flex-col border-r border-[#f5e2dc] bg-[#fff8f4]/90 backdrop-blur-sm",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:w-[260px] max-lg:bg-[#fff8f4] max-lg:transition-transform max-lg:duration-200",
          mobileOpen ? "max-lg:translate-x-0 max-lg:shadow-2xl" : "max-lg:-translate-x-full",
        )}
      >
      <div className="flex items-center gap-3 border-b border-[#f5e2dc] px-5 py-5">
        <div className="flex h-10 w-10 rotate-[-4deg] items-center justify-center rounded-2xl bg-gradient-to-br from-[#f4dfe6] via-[#e8e1ff] to-[#dcefe8] text-[#4a3c52] shadow-sm">
          <NotebookPen className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <div className="font-display text-base font-semibold text-[#2d2424]">
              다빈이의 강사일기
            </div>
            <BetaBadge />
          </div>
          <div className="text-[11px] text-[#7d6d6b]">오늘도 차근차근 🌷</div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="메뉴 닫기"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a7b77] transition hover:bg-[#faf0f2] lg:hidden"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <ul className="space-y-1.5">
          {topItems.map((item) => (
            <li key={item.href}>
              <NavLink {...item} isActive={isActive(item.href)} />
            </li>
          ))}
        </ul>

        <div>
          <div className="mb-2 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a8968f] before:h-1 before:w-1 before:rounded-full before:bg-[#dccff7] before:content-['']">
            수업 관리
          </div>
          <ul className="space-y-1.5">
            {lessonItems.map((item) => (
              <li key={item.href}>
                <NavLink {...item} isActive={isActive(item.href)} />
              </li>
            ))}

            <li>
              <div
                className={cn(
                  "flex items-center gap-1 rounded-2xl transition-all",
                  pathname === "/groups"
                    ? "bg-[#fbe9f0] shadow-sm ring-1 ring-[#f4d8e2]"
                    : "hover:bg-[#faf0f2]",
                )}
              >
                <Link
                  href="/groups"
                  className={cn(
                    "flex flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium",
                    pathname === "/groups" ? "text-[#6d4a5c]" : "text-[#564d4d]",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-xl",
                      pathname === "/groups" ? "bg-white text-[#c06a8f]" : "bg-[#f6f1ee] text-[#685d5d]",
                    )}
                  >
                    <FolderKanban className="h-4 w-4" />
                  </span>
                  수업 그룹
                </Link>
                {groups.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setGroupsOpen((open) => !open)}
                    aria-label={groupsOpen ? "수업 그룹 목록 접기" : "수업 그룹 목록 펼치기"}
                    aria-expanded={groupsOpen}
                    className="mr-2 flex h-7 w-7 items-center justify-center rounded-lg text-[#8a7b77] transition hover:bg-white hover:text-[#564d4d]"
                  >
                    {groupsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : null}
              </div>

              {groupsOpen && groups.length > 0 ? (
                <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto border-l border-[#eee2da] pl-3 ml-6">
                  {groups.map((group) => {
                    const groupActive = pathname.startsWith(`/groups/${group.id}`);

                    return (
                      <li key={group.id}>
                        <Link
                          href={`/groups/${group.id}`}
                          aria-current={groupActive ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] transition-all",
                            groupActive
                              ? "bg-[#fbe9f0] font-semibold text-[#6d4a5c] ring-1 ring-[#f4d8e2]"
                              : "text-[#6b6060] hover:bg-[#faf0f2] hover:text-[#2e2828]",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              groupActive ? "bg-[#d97b9a]" : "bg-[#d9cdc7]",
                            )}
                          />
                          <span className="truncate">{group.name}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>

            {afterGroupItems.map((item) => (
              <li key={item.href}>
                <NavLink {...item} isActive={isActive(item.href)} />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a8968f] before:h-1 before:w-1 before:rounded-full before:bg-[#dccff7] before:content-['']">
            수업 자료
          </div>
          <ul className="space-y-1.5">
            {materialItems.map((item) => (
              <li key={item.href}>
                <NavLink {...item} isActive={isActive(item.href)} />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <ul className="space-y-1.5">
            <li>
              <NavLink
                label="이쁜 말♥"
                href="/pretty-words"
                icon={Heart}
                isActive={isActive("/pretty-words")}
              />
            </li>
          </ul>
        </div>
      </nav>

      <div className="border-t border-[#f5e2dc] p-4 space-y-3">
        <div className="flex items-center gap-2.5 rounded-2xl bg-[#f7f3ef] px-3 py-2.5 text-xs text-[#655d5d]">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e8e1ff] to-[#f6dfe9] font-display text-sm font-semibold text-[#4a3c52] shadow-sm"
          >
            {userName.trim().charAt(0) || "선"}
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-[#2b2323]">{userName}</div>
            {userEmail ? <div className="truncate text-[11px] text-[#7d6d6b]">{userEmail}</div> : null}
          </div>
        </div>

        <FeedbackDialog />

        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm text-[#8a7b77] transition hover:bg-[#faf0f2] hover:text-[#564d4d]"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </button>
      </div>
      </aside>
    </>
  );
}
