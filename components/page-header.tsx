import type { ReactNode } from "react";

import { Doodle } from "@/components/doodle";
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
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-[-0.01em] text-[#2a2323]">
          {title}
          <Doodle kind="sparkle" className="h-4 w-4 shrink-0 text-[#d3c6ef]" />
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-[#756a67]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
