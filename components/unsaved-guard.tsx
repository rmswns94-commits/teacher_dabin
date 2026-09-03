"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/* dirty 상태에서 새로고침/탭 닫기 시 브라우저 표준 경고를 띄운다.        */
/* listener는 active인 동안만 등록되고 해제 시 반드시 제거된다.          */
// 페이지 이탈 확인용 dirty registry — 뒤로가기 버튼 등 화면 밖 navigation 컨트롤이
// 현재 열린 폼의 작성 중 여부를 조회할 수 있게 한다 (module 단위, 전역 상태 라이브러리 불필요).
type DirtyCheck = () => boolean;
const dirtyChecks = new Set<DirtyCheck>();

export function registerDirtyCheck(check: DirtyCheck) {
  dirtyChecks.add(check);
  return () => {
    dirtyChecks.delete(check);
  };
}

export function anyRegisteredFormDirty() {
  for (const check of dirtyChecks) {
    if (check()) {
      return true;
    }
  }
  return false;
}

export function useBeforeUnloadWarning(active: boolean) {
  useEffect(() => {
    if (!active) {
      return;
    }

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 표준 동작: 브라우저 기본 경고만 사용 (custom text는 표시되지 않음)
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}

/* ------------------------------------------------------------------ */
/* 네이티브 form의 현재 값을 FormData로 직렬화해 mount 시점 스냅샷과      */
/* 비교하는 dirty 훅. 동적으로 추가되는 hidden input(수업 시간 블록 등)  */
/* 도 항목 수 변화로 감지되고, 원래 값으로 되돌리면 dirty가 풀린다.      */
function serializeForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return [...data.entries()]
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : "[file]"}`)
    .join("&");
}

export function useNativeFormDirty(onDirtyChange?: (dirty: boolean) => void) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const snapshotRef = useRef<string | null>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  });
  const [isDirty, setIsDirty] = useState(false);

  const setFormRef = (form: HTMLFormElement | null) => {
    formRef.current = form;
    if (form && snapshotRef.current === null) {
      snapshotRef.current = serializeForm(form);
    }
  };

  const recompute = () => {
    const form = formRef.current;
    if (!form || snapshotRef.current === null) {
      return;
    }

    const dirty = serializeForm(form) !== snapshotRef.current;
    setIsDirty(dirty);
    onDirtyChangeRef.current?.(dirty);
  };

  // 버튼으로 행/블록을 추가·삭제하는 등 input 이벤트 없이 form 내용이
  // 바뀌는 경우(hidden input 추가 등)도 감지한다.
  useEffect(() => {
    const form = formRef.current;
    if (!form) {
      return;
    }

    const observer = new MutationObserver(() => recompute());
    observer.observe(form, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["value"],
    });
    return () => observer.disconnect();
    // recompute는 ref 기반이라 안정적이다.
    // eslint 규칙상 의존성 없이 mount 시 1회 등록이 의도된 동작.
  }, []);

  return {
    isDirty,
    formProps: {
      ref: setFormRef,
      onInput: recompute,
      onChange: recompute,
    },
  };
}

/* ------------------------------------------------------------------ */
/* "작성 중인 내용이 있어요" 확인 다이얼로그 (모든 폼에서 재사용)        */
export function ConfirmDiscardDialog({
  open,
  onKeepEditing,
  onDiscard,
}: {
  open: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="작성 중인 내용이 있어요"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onKeepEditing();
        }
      }}
    >
      <div className="w-full max-w-xs rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 text-center shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
        <div className="font-display text-lg font-semibold text-[#2a2323]">
          작성 중인 내용이 있어요
        </div>
        <p className="mt-2 text-sm leading-6 text-[#655d5d]">
          지금 닫으면 적어둔 내용이 사라져요.
          <br />
          계속 작성할까요?
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button type="button" autoFocus onClick={onKeepEditing}>
            계속 작성하기
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDiscard} className="text-[#8f625f]">
            내용 버리고 닫기
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 페이지 안의 서버 액션 form용: dirty 추적 + 새로고침/탭 닫기 보호.     */
/* (학생 수정, 그룹 정보 수정처럼 다이얼로그가 아닌 인라인 폼에 사용)    */
export function GuardedForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  const { isDirty, formProps } = useNativeFormDirty();
  useBeforeUnloadWarning(isDirty);

  // 뒤로가기 버튼 등에서 dirty 조회 가능하게 등록 (ref로 최신 상태 유지)
  const dirtyRef = useRef(isDirty);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);
  useEffect(() => registerDirtyCheck(() => dirtyRef.current), []);

  return (
    <form action={action} className={className} {...formProps}>
      {children}
    </form>
  );
}
