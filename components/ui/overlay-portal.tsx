"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 오버레이(fixed inset-0 Dialog)를 document.body로 포털한다.
// sticky 액션바처럼 backdrop-filter(containing block)·z-index(stacking context)를 가진 조상 안에서
// Dialog를 렌더하면 fixed inset-0이 viewport가 아니라 그 조상 박스에 갇혀 화면 밖으로 잘린다.
// 포털로 body 직속에 두면 어떤 호출 위치에서도 viewport 기준으로 중앙에 뜬다.
// React 합성 이벤트(ESC onKeyDown 등)는 포털을 넘어 그대로 전파되므로 호출부 로직은 변하지 않는다.
// 서버 스냅샷은 false — Dialog는 항상 클라이언트 이벤트 뒤에 열리므로 hydration 불일치가 없다.
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function OverlayPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  if (!mounted) {
    return null;
  }
  return createPortal(children, document.body);
}
