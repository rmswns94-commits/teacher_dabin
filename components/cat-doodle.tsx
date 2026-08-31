import { cn } from "@/lib/utils";

// 앱 마스코트: 통통한 크림색 고양이 (오리지널 캐릭터).
// 항상 장식 전용(aria-hidden)이며, variant로 소품만 달라진다.
// - default: 기본 앉은 자세
// - heart:   머리 위에 작은 하트
// - book:    앞에 작은 책

export function CatDoodle({
  variant = "default",
  className,
}: {
  variant?: "default" | "heart" | "book";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 52"
      fill="none"
      aria-hidden
      className={cn("pointer-events-none h-14 w-16 select-none", className)}
    >
      {/* 꼬리 */}
      <path
        d="M53 41c5.5 0 8.5-2.5 8.5-6.5"
        stroke="#a8968b"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {/* 몸통 */}
      <path
        d="M11 44.5c-2-12.5 4.5-23 21-23s23 10.5 21 23c-.3 1.8-1.8 3-3.6 3H14.6c-1.8 0-3.3-1.2-3.6-3Z"
        fill="#f8efe4"
        stroke="#a8968b"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* 귀 */}
      <path
        d="M17.5 24.5 15 15l8 5.5M46.5 24.5 49 15l-8 5.5"
        fill="#f8efe4"
        stroke="#a8968b"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m17.5 20.5-1-3.6 3.2 2.2Z" fill="#f0c2cf" />
      <path d="m46.5 20.5 1-3.6-3.2 2.2Z" fill="#f0c2cf" />
      {/* 감은 눈 (^ ^) */}
      <path
        d="M23.5 32.5c1.6-2 3.6-2 5.2 0M35.3 32.5c1.6-2 3.6-2 5.2 0"
        stroke="#6f6157"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      {/* 입 (ω) */}
      <path
        d="M29.8 36.2c.7.9 1.5.9 2.2 0 .7.9 1.5.9 2.2 0"
        stroke="#6f6157"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* 볼터치 */}
      <ellipse cx="19.5" cy="36" rx="2.6" ry="1.6" fill="#f5c3d0" />
      <ellipse cx="44.5" cy="36" rx="2.6" ry="1.6" fill="#f5c3d0" />
      {/* 수염 */}
      <path
        d="M12.5 33.5h-4M13 37l-3.8 1M51.5 33.5h4M51 37l3.8 1"
        stroke="#a8968b"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* 앞발 */}
      <path
        d="M26 47.5c0-1.4 1.1-2.3 2.6-2.3s2.6.9 2.6 2.3M32.8 47.5c0-1.4 1.1-2.3 2.6-2.3s2.6.9 2.6 2.3"
        stroke="#a8968b"
        strokeWidth="1.3"
        strokeLinecap="round"
      />

      {variant === "heart" ? (
        <path
          d="M32 12.6c-1.2-2.6-4.8-2.4-5.4.3-.4 1.9 1.5 3.9 5.4 6.1 3.9-2.2 5.8-4.2 5.4-6.1-.6-2.7-4.2-2.9-5.4-.3Z"
          fill="#f0a8bd"
          stroke="#dd8ba6"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      ) : null}

      {variant === "book" ? (
        <g>
          <path
            d="M22 47.5c3-1.6 7-1.6 10 0 3-1.6 7-1.6 10 0v-6c-3-1.6-7-1.6-10 0-3-1.6-7-1.6-10 0Z"
            fill="#efe4fb"
            stroke="#a394c9"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M32 41.5v6" stroke="#a394c9" strokeWidth="1.1" />
        </g>
      ) : null}
    </svg>
  );
}
