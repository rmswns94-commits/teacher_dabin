"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Same server form action; disable repeated submissions while its request is pending.
export function HomeworkCompletionButton({ checked, className, children }: {
  checked: boolean;
  className: string;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return <button type="submit" aria-pressed={checked} aria-busy={pending} disabled={pending} className={className}>{children}</button>;
}
