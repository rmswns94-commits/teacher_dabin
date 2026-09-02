import type { ReactNode } from "react";

import { ScrollJumpButton } from "@/components/scroll-jump-button";
import { Sidebar } from "@/components/sidebar";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getPendingMakeupCount } from "@/lib/supabase/queries/makeups";

export async function AppShell({ children }: { children: ReactNode }) {
  const [groups, pendingMakeupCount] = await Promise.all([
    getCurrentUserGroups(),
    getPendingMakeupCount(),
  ]);

  return (
    <div className="flex min-h-screen text-[#2d2928]">
      <Sidebar
        groups={groups.map((group) => ({ id: group.id, name: group.name }))}
        pendingMakeupCount={pendingMakeupCount}
      />
      <div className="app-main flex-1 overflow-hidden max-lg:pt-14">
        {children}
        <ScrollJumpButton />
      </div>
    </div>
  );
}
