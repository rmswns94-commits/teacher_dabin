import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // 글자 크기는 size variant가 정한다 (기본 버튼 16px / 작은 액션 14px).
  // globals.css의 폼 리셋이 @layer base로 내려가면서 이제 이 text-* 유틸이 실제로 적용된다.
  // tap-press: 눌림 피드백 마커 — asChild(<a>)도 globals.css의 :active 규칙을 타게 한다.
  // transition은 실제로 바뀌는 속성만 (all이면 글씨 크기 설정 전환 시 font-size까지 애니메이션된다).
  "tap-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium leading-none transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-100 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9b9c6] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[#2b2b31] text-white shadow-sm hover:bg-[#3a3a42] active:shadow-none",
        secondary:
          "bg-[#f0f0f3] text-[#33333b] hover:bg-[#e6e6ea]",
        outline:
          "border border-[#dcdce2] bg-white text-[#33333b] hover:bg-[#f4f4f6]",
        ghost: "text-[#4c4c55] hover:bg-[#f4f4f6]",
        accent:
          "bg-[#e8e8ee] text-[#33333b] hover:bg-[#dedee6]",
      },
      size: {
        // 높이(터치 영역)는 글자 크기와 별개로 유지한다 — sm도 40px 이상.
        default: "h-11 px-4 py-2 text-base",
        sm: "h-10 rounded-lg px-3 text-sm",
        lg: "h-12 rounded-xl px-5 text-base",
        icon: "h-10 w-10 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
