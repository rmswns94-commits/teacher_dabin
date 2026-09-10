"use client";

import { Children, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// 목록형 Card 공통 preview 한도 — 실제 item "개수" 기준 (text wrap으로 생기는
// 시각적 줄 수를 세지 않는다: 기기 폭마다 줄바꿈이 달라져도 동작이 같아야 한다).
export const CARD_PREVIEW_ITEM_LIMIT = 7;

// 목록형 Card의 공용 접기: 7개 이하면 전부(버튼 없음), 8개 이상이면 앞 7개 +
// [전체 보기 (+N)] / [접기]. 각 인스턴스가 독립 state — 다른 Card에 영향 없음.
// children으로 이미 렌더된 item 노드를 받아 DOM에는 보이는 만큼만 붙인다
// (data fetch/정렬/개수 summary는 호출부의 전체 데이터 그대로 — 여기서 자르지 않는다).
// 작성 Form/Calendar/네비게이션/Select에는 쓰지 않는다 (읽는 목록 Card 전용).
export function ExpandableList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const all = Children.toArray(children);
  const collapsible = all.length > CARD_PREVIEW_ITEM_LIMIT;
  const visible = expanded || !collapsible ? all : all.slice(0, CARD_PREVIEW_ITEM_LIMIT);

  return (
    <>
      <div className={className}>{visible}</div>
      {collapsible ? (
        <div className="mt-1.5 flex justify-center">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="flex min-h-[40px] items-center gap-1 rounded-xl px-3 text-sm font-medium text-[#6d5aa8] transition hover:bg-[#f2edf9]"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden /> 접기
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden /> 전체 보기 (+
                {all.length - CARD_PREVIEW_ITEM_LIMIT})
              </>
            )}
          </button>
        </div>
      ) : null}
    </>
  );
}
