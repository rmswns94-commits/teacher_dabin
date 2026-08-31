import { cn } from "@/lib/utils";

// 아주 단순한 손그림 느낌의 장식 SVG. 페이지당 1~3개만, 정보보다 눈에
// 띄지 않게 사용한다. 항상 장식 전용(aria-hidden)이고 currentColor를 따른다.
const paths: Record<string, React.ReactNode> = {
  flower: (
    <>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" opacity="0.55" />
      <path
        d="M12 4.5c1.2 1.6 1.2 3.4 0 5m0 5c1.2 1.6 1.2 3.4 0 5M4.5 12c1.6-1.2 3.4-1.2 5 0m5 0c1.6-1.2 3.4-1.2 5 0"
        strokeLinecap="round"
      />
    </>
  ),
  sparkle: (
    <path
      d="M12 4.8c.5 3 1.7 4.6 4.7 5.2-3 .8-4.2 2.3-4.7 5.2-.5-2.9-1.7-4.4-4.7-5.2 3-.6 4.2-2.2 4.7-5.2ZM18.5 15.5c.2 1.3.8 2 2 2.3-1.2.3-1.8 1-2 2.2-.2-1.2-.8-1.9-2-2.2 1.2-.3 1.8-1 2-2.3Z"
      strokeLinejoin="round"
    />
  ),
  leaf: (
    <path
      d="M6 17.5C6.5 10.5 11 6.5 18 6c-.5 7-4.5 11.5-11.5 12l-.5-.5Zm0 0c2-4.5 5-7.5 9-9.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

export function Doodle({
  kind,
  className,
}: {
  kind: keyof typeof paths;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
      className={cn("pointer-events-none h-6 w-6 select-none", className)}
    >
      {paths[kind]}
    </svg>
  );
}
