import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";

export async function AppShell({ children }: { children: ReactNode }) {
  const groups = await getCurrentUserGroups();

  return (
    <div className="flex min-h-screen text-[#2d2928]">
      <Sidebar groups={groups.map((group) => ({ id: group.id, name: group.name }))} />
      <div className="app-main flex-1 overflow-hidden max-lg:pt-14">{children}</div>
    </div>
  );
}
