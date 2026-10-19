import Link from "next/link";

import { cn } from "@/lib/utils";

// 재시험 관리 [진행중] [통과 기록] — 상태는 URL 쿼리 (학생 상세 탭과 같은 방식)
export function RetestViewTabs({ active }: { active: "active" | "passed" }) {
  const tabs = [
    { key: "active" as const, label: "진행중", href: "/retests" },
    { key: "passed" as const, label: "통과 기록", href: "/retests?view=passed" },
  ];

  return (
    <div role="tablist" aria-label="재시험 보기" className="mb-4 flex flex-wrap gap-1.5">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          role="tab"
          aria-selected={active === tab.key}
          className={cn(
            "min-h-10 rounded-xl px-3.5 py-2 text-sm font-medium transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c1e8]",
            active === tab.key
              ? "bg-[#f3eefa] text-[#5c4ca8]"
              : "text-[#8a7b77] hover:bg-white/70 hover:text-[#564d4d]",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
