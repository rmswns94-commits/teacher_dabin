import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-center justify-between gap-3", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#232327]">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-[#6b6b74]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
