"use client";

// 설정 > 학원 관리 — 현재 학원 확인 / 다른 학원으로 전환 / 새 학원 시작.
//
// 핵심 약속을 UI에서도 분명히 한다: 학원을 바꿔도 기존 학원 기록은 삭제되지 않고,
// 언제든 다시 전환해서 그대로 볼 수 있다. 새 학원은 빈 상태로 시작한다.
// 학원 관리 도구를 크게 만들지 않는다 (확인 · 전환 · 새로 시작 셋뿐).

import { useRef, useState, useTransition } from "react";
import { Check, Plus, School } from "lucide-react";

import {
  activateWorkspaceAction,
  createWorkspaceAction,
  renameWorkspaceAction,
} from "@/app/settings/workspace-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WorkspaceOption = { id: string; name: string };

type Step = null | "explain" | "name" | "rename" | { switchTo: WorkspaceOption };

export function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: WorkspaceOption[];
  activeId: string | null;
}) {
  const [step, setStep] = useState<Step>(null);
  const [name, setName] = useState("");
  // 한글 입력 중에는 손대지 않는다 — trim/검증은 저장할 때만 한다 (IME 안전)
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const busyRef = useRef(false);

  const active = workspaces.find((workspace) => workspace.id === activeId) ?? null;
  const close = () => {
    if (busyRef.current) return;
    setStep(null);
    setError("");
  };

  const create = () => {
    if (busyRef.current || !name.trim()) return;
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await createWorkspaceAction({ name });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setStep(null);
        setName("");
        setNotice(`${result.name}에서 새로 시작해요.`);
      } finally {
        busyRef.current = false;
      }
    });
  };

  // 이름 변경 — 표시용 이름만 바뀐다. 학생·반·수업일지 등은 그대로다.
  const rename = () => {
    if (busyRef.current || !active || !renameValue.trim()) return;
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await renameWorkspaceAction({
          workspaceId: active.id,
          name: renameValue,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setStep(null);
        setNotice(`${result.name}으로 이름을 변경했어요.`);
      } finally {
        busyRef.current = false;
      }
    });
  };

  const switchTo = (workspace: WorkspaceOption) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await activateWorkspaceAction({ workspaceId: workspace.id });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setStep(null);
        setNotice(`${result.name}으로 전환했어요.`);
      } finally {
        busyRef.current = false;
      }
    });
  };

  if (workspaces.length === 0) {
    // 학원 migration 전 — 기존 동작 그대로 두고 아무 것도 보여주지 않는다
    return null;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-base font-medium text-[#2d2928]">
            <School className="h-4 w-4 text-[#8b7ae6]" aria-hidden />
            {active?.name ?? "학원 미설정"}
          </div>
          <p className="secondary-text mt-0.5 text-[#8a7b77]">
            지금 보고 있는 학원이에요. 학생·수업일지 등 모든 기록은 학원별로 따로 보관돼요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!active}
            onClick={() => {
              setRenameValue(active?.name ?? "");
              setError("");
              setStep("rename");
            }}
          >
            이름 변경
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setStep("explain")}>
            학원 변경
          </Button>
        </div>
      </div>

      {notice ? (
        <p role="status" className="mt-3 rounded-xl border border-[#d8ebe0] bg-[#f0faf5] px-3 py-2 text-sm text-[#2f6d54]">
          {notice}
        </p>
      ) : null}
      {error && step === null ? (
        <p role="status" className="mt-3 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
          {error}
        </p>
      ) : null}

      {workspaces.length > 1 ? (
        <div className="mt-4 border-t border-dashed border-[#efe4dc] pt-4">
          <div className="text-sm font-medium text-[#4d3a3a]">내 학원</div>
        </div>
      ) : null}

      {workspaces.length > 1 ? (
        <ul className="mt-2 space-y-1.5" aria-label="학원 목록">
          {workspaces.map((workspace) => {
            const isActive = workspace.id === activeId;
            return (
              <li
                key={workspace.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2",
                  isActive ? "border-[#d8cdf0] bg-[#f8f6fc]" : "border-[#f0e6e0] bg-white",
                )}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  {isActive ? (
                    <Check className="h-4 w-4 shrink-0 text-[#5d4ba5]" aria-hidden />
                  ) : (
                    <span aria-hidden className="h-4 w-4 shrink-0" />
                  )}
                  <span className="min-w-0 truncate font-medium text-[#2d2928]">{workspace.name}</span>
                  <span className="secondary-text shrink-0 text-[#8a7b77]">
                    {isActive ? "현재 사용 중" : "이전 학원"}
                  </span>
                </span>
                {isActive ? null : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setStep({ switchTo: workspace })}
                  >
                    전환
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* 학원 이름 변경 — 표시용 이름만 바뀐다 */}
      {step === "rename" && active ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="학원 이름 변경"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            <div className="card-title text-[#2a2323]">학원 이름 변경</div>
            <p className="mt-2 text-sm leading-6 text-[#655d5d]">
              현재 이름 <span className="font-medium text-[#2d2928]">{active.name}</span>
            </p>
            <p className="mt-1 text-sm leading-6 text-[#8a7b77]">
              이름만 바뀌고 학생·수업일지 등 기록은 그대로예요.
            </p>
            <label className="mt-3 block">
              <span className="sr-only">새 학원 이름</span>
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                maxLength={100}
                autoFocus
                placeholder="다빈영어학원"
                aria-label="새 학원 이름"
                className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none focus:border-[#e3b9c9] placeholder:text-[#a79996]"
              />
            </label>
            {error ? (
              <p role="status" className="mt-3 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={isPending}
                onClick={close}
              >
                취소
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={
                  isPending || !renameValue.trim() || renameValue.trim() === active.name.trim()
                }
                onClick={rename}
              >
                {isPending ? "저장 중…" : "저장"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 학원 변경 안내 → 이름 입력 */}
      {step === "explain" || step === "name" ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="학원 변경"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            {step === "explain" ? (
              <>
                <div className="card-title text-[#2a2323]">학원을 변경하시나요?</div>
                <p className="mt-2 text-sm leading-6 text-[#655d5d]">
                  기존 학원의 학생, 수업일지, 숙제, 출결 및 기타 기록은 삭제되지 않고 그대로
                  보관됩니다. 새 학원에서는 모든 업무 데이터를 처음부터 시작합니다.
                </p>
                <p className="mt-2 text-sm leading-6 text-[#8a7b77]">
                  언제든 설정에서 이전 학원으로 다시 전환할 수 있어요.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={close}>
                    취소
                  </Button>
                  <Button type="button" className="flex-1" onClick={() => setStep("name")}>
                    새 학원 시작
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="card-title text-[#2a2323]">새 학원 시작</div>
                <p className="mt-2 text-sm leading-6 text-[#8a7b77]">
                  기존 학원의 데이터는 삭제되지 않아요. 새 학원에서는 모든 업무 데이터를 처음부터
                  시작합니다.
                </p>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">학원 이름</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={100}
                    autoFocus
                    placeholder="새봄영어학원"
                    aria-label="새 학원 이름"
                    className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-base outline-none focus:border-[#e3b9c9] placeholder:text-[#a79996]"
                  />
                </label>
                {error ? (
                  <p role="status" className="mt-3 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
                    {error}
                  </p>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    disabled={isPending}
                    onClick={close}
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 gap-1.5"
                    disabled={isPending || !name.trim()}
                    onClick={create}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    {isPending ? "만드는 중…" : "새 학원 만들기"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* 전환 확인 */}
      {step && typeof step === "object" ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="학원 전환 확인"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            <div className="card-title text-[#2a2323]">
              {step.switchTo.name}으로 전환할까요?
            </div>
            <p className="mt-2 text-sm leading-6 text-[#655d5d]">
              현재 학원의 데이터는 그대로 보존됩니다.
            </p>
            {error ? (
              <p role="status" className="mt-3 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={isPending}
                onClick={close}
              >
                취소
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={isPending}
                onClick={() => switchTo(step.switchTo)}
              >
                {isPending ? "전환 중…" : "전환"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
