import type { ReactNode } from "react";

import { PageBackButton } from "@/components/page-back-button";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
  backHref,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  // 지정하면 제목 왼쪽에 공용 뒤로가기 버튼 (내부 history 우선, 없으면 이 route로)
  backHref?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {backHref ? <PageBackButton fallbackHref={backHref} /> : null}
        <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#232327]">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-[#6b6b74]">{description}</p>
        ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}
