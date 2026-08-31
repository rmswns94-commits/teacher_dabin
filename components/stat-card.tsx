import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

const toneMap = {
  lavender: "bg-[#f3eefc] text-[#5d4eb2]",
  pink: "bg-[#fdf0ef] text-[#9d5d63]",
  rose: "bg-[#fff3f3] text-[#b95e5b]",
  mint: "bg-[#edf8f2] text-[#3c7d6c]",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: keyof typeof toneMap;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl", toneMap[tone])}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-[11px] text-[#756a67]">{label}</p>
        <p className="text-lg font-semibold tracking-[-0.02em] text-[#241d1d]">{value}</p>
      </div>
    </Card>
  );
}
