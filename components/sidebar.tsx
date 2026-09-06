"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ListTodo,
  Settings,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderKanban,
  Heart,
  Home,
  Menu,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  School,
  Sparkles,
  Sprout,
  Users,
  X,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { groupIconOf } from "@/lib/group-icons";
import { cn } from "@/lib/utils";

function BetaBadge() {
  return (
    <span className="rounded-full bg-[#eef0f4] px-1.5 py-0.5 text-[10px] font-medium text-[#4f5560]">
      Beta
    </span>
  );
}

// ── 데스크톱/iPad 가로용 사이드바 접기 preference ──────────────────────
// localStorage + useSyncExternalStore: 서버 스냅샷은 항상 "펼침"이라 hydration mismatch가
// 없고, hydration 직후 저장값으로 안전하게 전환된다. navigation이 아니므로 router 미사용,
// 접힘/펼침은 Sidebar 내부 상태만 바뀌어 main content(플래너 등)는 remount되지 않는다.
const SIDEBAR_COLLAPSE_KEY = "dabin-sidebar-collapsed";
let collapseListeners: (() => void)[] = [];

function subscribeCollapse(listener: () => void) {
  collapseListeners.push(listener);
  return () => {
    collapseListeners = collapseListeners.filter((l) => l !== listener);
  };
}

function getCollapsedSnapshot() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function getCollapsedServerSnapshot() {
  return false;
}

function setCollapsedPref(next: boolean) {
  try {
    if (next) {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, "1");
    } else {
      localStorage.removeItem(SIDEBAR_COLLAPSE_KEY);
    }
  } catch {
    // storage를 못 쓰는 환경이면 세션 한정 동작도 없이 그대로 둔다
  }
  for (const listener of collapseListeners) {
    listener();
  }
}

// ── Navigation 단일 config ─────────────────────────────────────────────
// 데스크톱 사이드바와 모바일 drawer가 같은 aside를 쓰므로 이 정의 하나가 유일한 소스다.
// route는 기존 그대로 — 표시 이름/순서/섹션만 재정리 (시험 대비=/exams, 보충 수업=/makeups,
// 교육 철학=/pretty-words 기존 route 유지). "이쁜 말♥" 별도 메뉴는 두지 않는다(route는 보존).
type NavItem = {
  label: string;
  href: string;
  icon: typeof Home;
  // 수업 그룹만 그룹 트리(펼침) 특수 렌더
  groupTree?: boolean;
  // 보충 수업의 대기 건수 badge
  makeupBadge?: boolean;
};

const topItem: NavItem = { label: "오늘", href: "/dashboard", icon: Home };

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "수업 관리",
    items: [
      { label: "수업 일지", href: "/daily-logs", icon: NotebookPen },
      { label: "오늘 할 일", href: "/todos", icon: ListTodo },
      { label: "수업 그룹", href: "/groups", icon: FolderKanban, groupTree: true },
      { label: "시험 대비", href: "/exams", icon: School },
      { label: "보충 수업", href: "/makeups", icon: CalendarCheck, makeupBadge: true },
    ],
  },
  {
    label: "학생 관리",
    items: [
      { label: "학생", href: "/students", icon: Users },
      { label: "성장노트", href: "/growth-notes", icon: Sprout },
    ],
  },
  {
    label: "강사 기록",
    items: [
      { label: "교육 철학", href: "/pretty-words", icon: Heart },
      { label: "수업 회고", href: "/reflections", icon: Sparkles },
    ],
  },
  {
    label: "수업 자료",
    items: [{ label: "영어 지문", href: "/passages", icon: FileText }],
  },
];

const bottomItem: NavItem = { label: "설정", href: "/settings", icon: Settings };

export type SidebarGroup = { id: string; name: string; icon: string | null };

function NavLink({
  label,
  href,
  icon: Icon,
  isActive,
  badgeCount,
}: {
  label: string;
  href: string;
  icon: typeof Home;
  isActive: boolean;
  badgeCount?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
        isActive
          ? "bg-[#f0f0f3] text-[#232327] shadow-sm ring-1 ring-[#e2e2e8]"
          : "text-[#3c3c45] hover:bg-[#f4f4f6] hover:text-[#232327]",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          isActive ? "bg-white text-[#33333b]" : "bg-[#f2f2f4] text-[#5c5c66]",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      {label}
      {badgeCount && badgeCount > 0 ? (
        <span
          aria-label={`일정을 잡아야 할 보충 ${badgeCount}건`}
          className="ml-auto rounded-full bg-[#fdeee3] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#a2643c]"
        >
          {badgeCount}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar({
  groups,
  pendingMakeupCount = 0,
}: {
  groups: SidebarGroup[];
  pendingMakeupCount?: number;
}) {
  const pathname = usePathname();
  const inGroupsSection = pathname === "/groups" || pathname.startsWith("/groups/");
  const [groupsOpen, setGroupsOpen] = useState(inGroupsSection);
  const [mobileOpen, setMobileOpen] = useState(false);
  // lg 이상에서만 의미 있는 접기 상태 (모바일 drawer는 기존 그대로)
  const collapsed = useSyncExternalStore(
    subscribeCollapse,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot,
  );

  // 모바일 드로어는 페이지를 이동하면 자동으로 닫는다 (render 중 상태 조정 패턴).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (mobileOpen) {
      setMobileOpen(false);
    }
  }

  // Entering the groups section (e.g. via dashboard quick action) opens the tree.
  // Adjust-state-during-render pattern instead of an effect.
  const [wasInGroupsSection, setWasInGroupsSection] = useState(inGroupsSection);
  if (inGroupsSection !== wasInGroupsSection) {
    setWasInGroupsSection(inGroupsSection);
    if (inGroupsSection) {
      setGroupsOpen(true);
    }
  }

  // nested route에서도 상위 메뉴가 active (/exams/abc → 시험 대비, /students/1 → 학생)
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // 수업 그룹 항목의 특수 렌더 (그룹 트리 펼침 — 기존 동작 그대로)
  const renderGroupTreeItem = (item: NavItem) => (
    <li key={item.href}>
      <div
        className={cn(
          "flex items-center gap-1 rounded-xl transition-all",
          inGroupsSection
            ? "bg-[#f0f0f3] shadow-sm ring-1 ring-[#e2e2e8]"
            : "hover:bg-[#f4f4f6]",
        )}
      >
        <Link
          href={item.href}
          className={cn(
            "flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold",
            inGroupsSection ? "text-[#232327]" : "text-[#3c3c45]",
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              inGroupsSection ? "bg-white text-[#33333b]" : "bg-[#f2f2f4] text-[#5c5c66]",
            )}
          >
            <FolderKanban className="h-4 w-4" />
          </span>
          {item.label}
        </Link>
        {groups.length > 0 ? (
          <button
            type="button"
            onClick={() => setGroupsOpen((open) => !open)}
            aria-label={groupsOpen ? "수업 그룹 목록 접기" : "수업 그룹 목록 펼치기"}
            aria-expanded={groupsOpen}
            className="mr-2 flex h-7 w-7 items-center justify-center rounded-lg text-[#7a7a84] transition hover:bg-white hover:text-[#4c4c55]"
          >
            {groupsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      {groupsOpen && groups.length > 0 ? (
        <ul className="ml-6 mt-1 max-h-48 space-y-0.5 overflow-y-auto border-l border-[#e6e6ea] pl-3">
          {groups.map((group) => {
            const groupActive = pathname.startsWith(`/groups/${group.id}`);

            return (
              <li key={group.id}>
                <Link
                  href={`/groups/${group.id}`}
                  aria-current={groupActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all",
                    groupActive
                      ? "bg-[#f0f0f3] font-semibold text-[#232327] ring-1 ring-[#e2e2e8]"
                      : "text-[#4c4c55] hover:bg-[#f4f4f6] hover:text-[#232327]",
                  )}
                >
                  <span aria-hidden className="shrink-0 text-[13px] leading-none">
                    {groupIconOf(group.icon)}
                  </span>
                  <span className="truncate">{group.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-[#e6e6ea] bg-white/95 px-4 backdrop-blur-sm lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="메뉴 열기"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#4c4c55] transition hover:bg-[#f4f4f6]"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="whitespace-nowrap text-lg font-bold tracking-[-0.01em] text-[#232327]">강사 일지</span>
        <BetaBadge />
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-[#2b2323]/30 lg:hidden"
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {/* 접힌 상태에서도 항상 다시 열 수 있는 고정 버튼 (lg+ 전용 — 모바일은 햄버거 유지) */}
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsedPref(false)}
          aria-label="사이드바 펼치기"
          className="fixed left-3 top-3 z-30 hidden h-11 w-11 items-center justify-center rounded-xl border border-[#e6e6ea] bg-white/95 text-[#4c4c55] shadow-sm backdrop-blur-sm transition hover:bg-[#f4f4f6] lg:flex"
        >
          <PanelLeftOpen className="h-5 w-5" aria-hidden />
        </button>
      ) : null}

      <aside
        className={cn(
          "flex h-screen w-full max-w-[260px] flex-col border-r border-[#e6e6ea] bg-white/95 backdrop-blur-sm",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:w-[260px] max-lg:bg-white max-lg:transition-transform max-lg:duration-200",
          mobileOpen ? "max-lg:translate-x-0 max-lg:shadow-2xl" : "max-lg:-translate-x-full",
          // 데스크톱/iPad 가로 접기: 완전 숨김으로 Calendar 등 main content가 전폭 사용
          collapsed && "lg:hidden",
        )}
      >
      <div className="flex items-center gap-3 border-b border-[#e6e6ea] px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2b2b31] text-white shadow-sm">
          <NotebookPen className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <div className="whitespace-nowrap text-lg font-bold tracking-[-0.01em] text-[#232327]">
              강사 일지
            </div>
            <BetaBadge />
          </div>
          <div className="text-[11px] text-[#8a8a93]">오늘도 차근차근</div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="메뉴 닫기"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#7a7a84] transition hover:bg-[#f4f4f6] lg:hidden"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        {/* 뒤로가기(←)와 혼동되지 않게 panel 아이콘 사용 — 접으면 main이 전폭 사용 */}
        <button
          type="button"
          onClick={() => setCollapsedPref(true)}
          aria-label="사이드바 접기"
          className="hidden h-10 w-10 items-center justify-center rounded-xl text-[#7a7a84] transition hover:bg-[#f4f4f6] hover:text-[#4c4c55] lg:flex"
        >
          <PanelLeftClose className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* 섹션 사이는 divide-y의 아주 연한 구분선 — 오늘(최상단)과 설정(최하단)은 heading 없는 독립 항목 */}
      <nav className="flex-1 divide-y divide-[#ececf0] overflow-y-auto px-3">
        <ul className="space-y-1 py-3.5">
          <li>
            <NavLink {...topItem} isActive={isActive(topItem.href)} />
          </li>
        </ul>

        {navSections.map((section) => (
          <div key={section.label} className="py-3.5">
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9a9aa3]">
              {section.label}
            </div>
            <ul className="space-y-1">
              {section.items.map((item) =>
                item.groupTree ? (
                  renderGroupTreeItem(item)
                ) : (
                  <li key={item.href}>
                    <NavLink
                      label={item.label}
                      href={item.href}
                      icon={item.icon}
                      isActive={isActive(item.href)}
                      badgeCount={item.makeupBadge ? pendingMakeupCount : undefined}
                    />
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}

        <ul className="space-y-1 py-3.5">
          <li>
            <NavLink {...bottomItem} isActive={isActive(bottomItem.href)} />
          </li>
        </ul>
      </nav>

      </aside>
    </>
  );
}
