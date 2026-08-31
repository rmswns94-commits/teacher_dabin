"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

// Submit button for server-action forms: shows pending text and blocks double clicks.
export function PendingButton({
  children,
  pendingText = "저장 중...",
  ...props
}: ButtonProps & { children: ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}
