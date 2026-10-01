"use client";

import { GripVertical } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

// 등록/수정 Dialog를 header로 끌어 옮기는 공용 훅 — Desktop/iPad(sm 이상) 전용, 새 의존성 없음.
//
// - 위치는 panel의 transform(translate3d)로만 표현한다. overlay의 flex 중앙 정렬·max-height·내부 scroll
//   구조는 그대로이고(transform 충돌 없음 — 이 앱의 Dialog는 translate(-50%,-50%) 중앙 정렬을 쓰지 않는다),
//   backdrop은 움직이지 않는다.
// - offset은 ref + DOM style로만 다룬다: pointermove마다 React re-render가 없고, 폼 state/remount와 무관하다.
//   필드 입력·validation rerender가 일어나도 transform은 React가 관리하지 않으므로 snap-back이 없다.
// - panel이 mount될 때(= 열릴 때) offset 0 → 항상 viewport 정중앙에서 시작. 위치 저장 없음(닫고 다시 열면 중앙).
// - viewport/panel 크기 변화(resize, Split View, validation으로 높이 변화)마다 현재 위치를 안전 여백 안으로 clamp.
// - 터치/펜은 LONG_PRESS_MS 동안 꾹 누른 뒤 움직여야 drag(짧은 탭·스크롤 제스처 오인 방지), 마우스는 바로.
// - header의 button/a/input/select/textarea/label 위에서는 시작하지 않는다 (닫기 X 등 보호).
const SAFE_MARGIN = 16; // overlay px-4와 같은 여백
const LONG_PRESS_MS = 180;
const TOUCH_SLOP = 8; // long-press 전에 이만큼 움직이면 drag 취소
const MOUSE_SLOP = 3; // 클릭만 했을 때 흔들림 방지
const MIN_WIDTH = 640; // Tailwind sm — 그 미만(모바일·좁은 Split View)은 drag 비활성
const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, label, [role=button], [role=menu], [role=listbox], [data-no-drag]";

// header(drag handle)에 함께 주는 클래스 — 텍스트 선택/iPad long-press 콜아웃 방지, sm 이상에서만 grab 커서·touch-action none
export const dialogDragHandleClass =
  "select-none [-webkit-touch-callout:none] sm:cursor-grab sm:touch-none";

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  armed: boolean;
  dragging: boolean;
  timer: number | null;
  handle: HTMLElement;
};

export function useDraggableDialog() {
  const panelEl = useRef<HTMLDivElement | null>(null);
  const offset = useRef({ x: 0, y: 0 });
  const gesture = useRef<Gesture | null>(null);
  const justDragged = useRef(false);
  const observer = useRef<ResizeObserver | null>(null);

  const apply = useCallback(() => {
    const el = panelEl.current;
    if (!el) {
      return;
    }
    const { x, y } = offset.current;
    el.style.transform = x === 0 && y === 0 ? "" : `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  // 안전 여백 안으로 clamp — panel이 viewport보다 크면(이론상) header가 있는 상단/좌측을 우선 보이게 한다
  const clamp = useCallback((x: number, y: number) => {
    const el = panelEl.current;
    if (!el) {
      return { x, y };
    }
    const rect = el.getBoundingClientRect(); // transform 포함 → base = rect - offset
    const baseLeft = rect.left - offset.current.x;
    const baseTop = rect.top - offset.current.y;
    const minX = SAFE_MARGIN - baseLeft;
    const maxX = window.innerWidth - SAFE_MARGIN - (baseLeft + rect.width);
    const minY = SAFE_MARGIN - baseTop;
    const maxY = window.innerHeight - SAFE_MARGIN - (baseTop + rect.height);
    return {
      x: maxX < minX ? minX : Math.min(maxX, Math.max(minX, x)),
      y: maxY < minY ? minY : Math.min(maxY, Math.max(minY, y)),
    };
  }, []);

  const reclamp = useCallback(() => {
    const next = clamp(offset.current.x, offset.current.y);
    if (next.x !== offset.current.x || next.y !== offset.current.y) {
      offset.current = next;
      apply();
    }
  }, [apply, clamp]);

  // panel callback ref(이름에 Ref를 쓰지 않음 — react-hooks/refs 규칙이 반환 객체를 ref로 오인하지 않게) —
  // 열릴 때마다(mount) 중앙(offset 0)에서 시작하고 크기 변화를 감시한다
  const attachPanel = useCallback(
    (el: HTMLDivElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      panelEl.current = el;
      offset.current = { x: 0, y: 0 };
      if (!el) {
        return;
      }
      el.style.transform = "";
      if (typeof ResizeObserver !== "undefined") {
        observer.current = new ResizeObserver(() => reclamp());
        observer.current.observe(el);
      }
    },
    [reclamp],
  );

  useEffect(() => {
    window.addEventListener("resize", reclamp);
    return () => {
      window.removeEventListener("resize", reclamp);
      observer.current?.disconnect();
      observer.current = null;
    };
  }, [reclamp]);

  const endGesture = useCallback(() => {
    const g = gesture.current;
    if (!g) {
      return;
    }
    if (g.timer !== null) {
      window.clearTimeout(g.timer);
    }
    g.handle.removeAttribute("data-dragging");
    g.handle.style.cursor = "";
    try {
      if (g.handle.hasPointerCapture(g.pointerId)) {
        g.handle.releasePointerCapture(g.pointerId);
      }
    } catch {
      // capture가 이미 풀린 경우 (portal/popover 전환 등) — 무시
    }
    gesture.current = null;
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || gesture.current || !panelEl.current) {
      return;
    }
    if (window.innerWidth < MIN_WIDTH) {
      return; // 모바일/좁은 폭: 세로 스크롤 제스처와 충돌하므로 비활성
    }
    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE_SELECTOR)) {
      return; // 닫기 X·버튼·입력 컨트롤 위에서는 drag 시작 안 함
    }
    const handle = event.currentTarget;
    const coarse = event.pointerType !== "mouse";
    const g: Gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: offset.current.x,
      baseY: offset.current.y,
      armed: !coarse,
      dragging: false,
      timer: null,
      handle,
    };
    gesture.current = g;
    // 마우스: 텍스트 선택 시작·현재 input focus 이동(blur)을 막는다. 터치 스크롤은 touch-action이 담당.
    event.preventDefault();
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // 일부 환경에서 capture 미지원 — handle 안에서만 drag된다
    }
    if (coarse) {
      g.timer = window.setTimeout(() => {
        g.timer = null;
        g.armed = true;
        handle.setAttribute("data-dragging", "true");
      }, LONG_PRESS_MS);
    }
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) {
        return;
      }
      const dx = event.clientX - g.startX;
      const dy = event.clientY - g.startY;
      if (!g.armed) {
        if (Math.hypot(dx, dy) > TOUCH_SLOP) {
          endGesture(); // long-press 전 움직임 = 탭/스크롤 의도
        }
        return;
      }
      if (!g.dragging) {
        if (Math.hypot(dx, dy) < MOUSE_SLOP) {
          return;
        }
        g.dragging = true;
        g.handle.setAttribute("data-dragging", "true");
        g.handle.style.cursor = "grabbing";
      }
      offset.current = clamp(g.baseX + dx, g.baseY + dy);
      apply();
      event.preventDefault();
    },
    [apply, clamp, endGesture],
  );

  const onPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) {
        return;
      }
      const dragged = g.dragging;
      endGesture();
      if (dragged) {
        // drag 직후 따라오는 click 한 번은 삼킨다 (backdrop 닫힘/버튼 클릭 오인 방지)
        justDragged.current = true;
        window.setTimeout(() => {
          justDragged.current = false;
        }, 0);
      }
    },
    [endGesture],
  );

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (justDragged.current) {
      justDragged.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  return {
    attachPanel,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onLostPointerCapture: onPointerEnd,
      onClickCapture,
      "data-dialog-drag-handle": "",
    },
  };
}

// header 왼쪽의 은은한 손잡이 표시 (sm 이상에서만, 장식용)
export function DragGrip() {
  return <GripVertical className="hidden h-4 w-4 shrink-0 text-[#cdbfc8] sm:block" aria-hidden />;
}
