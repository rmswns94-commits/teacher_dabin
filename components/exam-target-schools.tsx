"use client";

import { School } from "lucide-react";
import { useState, useTransition } from "react";

import { updateExamTargetSchoolsAction } from "@/app/groups/actions";
import { Button } from "@/components/ui/button";
import {
  examTargetToken,
  formatExamTarget,
  type ExamTarget,
} from "@/lib/school-scope";

// 시험 대상 scope(학교+학년) 선택/표시.
// 선택지의 source는 "현재 그룹 학생들의 Student.school + Student.grade" 조합이고
// (page가 이미 조회한 멤버 재사용 — 추가 쿼리 0), 어떤 scope가 시험을 보는지는
// Teacher의 checkbox 선택만 사용한다 — Exam record/플래너/교재 존재 여부로 절대 추론하지 않는다.
// 판정은 학교 trim 정확 일치 + 학년 enum 정확 일치 (fuzzy 병합/학년 추측 없음).
// 같은 학교의 1·2·3학년은 서로 완전히 독립적인 scope다 — 학교만으로 dedupe하지 않는다.

// 선택지 1줄 — key는 scope token(학교+학년 조합의 stable identity)
export type ExamScopeOption = ExamTarget & {
  // 현재 이 scope에 매칭되는 소속 학생 수 (0이면 stale/legacy 표시용)
  studentCount: number;
};

// OFF→ON(시험 대비 시작)과 ON 중 [대상 학교 변경]이 같은 다이얼로그 한 벌을 쓴다.
export function SchoolSelectDialog({
  title,
  helper,
  confirmLabel,
  scopes,
  staleScopes,
  initialSelected,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  helper: string;
  confirmLabel: string;
  // 현재 그룹 학생들의 학교·학년 조합 (서버에서 만들어 내려온 목록 — 정렬 완료)
  scopes: ExamScopeOption[];
  // 저장돼 있지만 현재 매칭 학생이 0명인 scope (legacy "학교 전체" 포함) —
  // 자동 삭제하지 않고 명시적으로 보여준다. 체크 해제 + 학년 scope 선택 = 사용자가
  // 직접 수행하는 legacy → 학년별 전환.
  staleScopes: ExamScopeOption[];
  initialSelected: ExamTarget[];
  pending: boolean;
  error: string;
  onConfirm: (selected: ExamTarget[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelected.map(examTargetToken)),
  );
  const scopeByToken = new Map<string, ExamTarget>(
    [...scopes, ...staleScopes].map((scope) => [
      examTargetToken(scope),
      { school: scope.school, grade: scope.grade },
    ]),
  );

  const toggle = (token: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) {
        next.delete(token);
      } else {
        next.add(token);
      }
      return next;
    });
  };

  const hasAnyScope = scopes.length > 0 || staleScopes.length > 0;
  const count = selected.size;

  const checkboxRow = (scope: ExamScopeOption, note?: string) => {
    const token = examTargetToken(scope);
    return (
      <label
        key={token}
        className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-[#faf7ff]"
      >
        <input
          type="checkbox"
          checked={selected.has(token)}
          onChange={() => toggle(token)}
          className="h-4.5 w-4.5 shrink-0 accent-[#6d5aa8]"
        />
        <span className="min-w-0 flex-1">
          <span className="body-text block break-words text-[#2d2928]">
            {formatExamTarget(scope)}
            {scope.grade === null ? (
              <span className="caption-text ml-1 text-[#a79996]">· 전체 (기존 기록)</span>
            ) : null}
          </span>
          <span className="caption-text block text-[#a79996]">
            {note ?? (scope.studentCount > 0 ? `학생 ${scope.studentCount}명` : "")}
          </span>
        </span>
        <span
          className={
            selected.has(token)
              ? "shrink-0 rounded-full bg-[#efe8fb] px-2 py-0.5 text-xs font-semibold text-[#5d4ba5]"
              : "shrink-0 rounded-full bg-[#f0f0f3] px-2 py-0.5 text-xs font-medium text-[#6b6b74]"
          }
        >
          {selected.has(token) ? "시험" : "일반"}
        </span>
      </label>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/30 px-4"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) {
          onClose();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
    >
      <div className="max-h-[calc(100dvh-3rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 text-left shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="card-title text-[#2a2323]">{title}</div>
        <p className="secondary-text mt-2 text-[#655d5d]">{helper}</p>

        {hasAnyScope ? (
          <div className="mt-3 space-y-0.5">
            {scopes.map((scope) => checkboxRow(scope))}
            {staleScopes.length > 0 ? (
              <div className="mt-2 border-t border-dashed border-[#efe4dc] pt-2">
                <div className="caption-text mb-1 px-2 font-semibold text-[#a79996]">
                  기존 선택 · 현재 매칭 학생 없음
                </div>
                {staleScopes.map((scope) =>
                  checkboxRow(
                    scope,
                    scope.grade === null
                      ? "학년이 지정되지 않은 기존 선택이에요. 위에서 학년별로 다시 선택하면 학년 기준으로 관리할 수 있어요."
                      : "현재 이 조합의 학생이 이 반에 없어요.",
                  ),
                )}
              </div>
            ) : null}
            <p className="secondary-text px-2 pt-2 text-[#a79996]">
              같은 학교라도 학년별로 따로 선택할 수 있어요. 선택하지 않은 학년은 일반 수업으로
              진행됩니다.
            </p>
          </div>
        ) : (
          <div className="secondary-text mt-3 rounded-2xl bg-[#f8f3ef] px-3 py-3 text-[#7f6f68]">
            등록된 학교가 없어요.
            <br />
            학생 정보에서 학교를 먼저 등록해주세요.
          </div>
        )}

        {error ? (
          <div className="secondary-text mt-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-[#7f5d57]">
            {error}
          </div>
        ) : null}
        {hasAnyScope && count === 0 ? (
          <p className="secondary-text mt-2 text-[#a2643c]">시험 대상을 하나 이상 선택해주세요.</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || count === 0}
            onClick={() =>
              onConfirm(
                [...selected]
                  .map((token) => scopeByToken.get(token))
                  .filter((scope): scope is ExamTarget => Boolean(scope)),
              )
            }
          >
            {pending ? "저장 중..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// 그룹 상세의 시험 대상 scope 요약 — 시험 대비 ON일 때만 page가 렌더한다.
// targets가 null이면 legacy(미설정) 상태: 자동 backfill 없이 설정을 안내만 한다.
export function ExamTargetSchoolsSection({
  groupId,
  scopes,
  staleScopes,
  targets,
}: {
  groupId: string;
  // 현재 그룹 학생들의 학교·학년 조합
  scopes: ExamScopeOption[];
  // 저장돼 있지만 현재 매칭 학생이 0명인 target (legacy 전체 scope 포함)
  staleScopes: ExamScopeOption[];
  targets: ExamTarget[] | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const targetTokens = new Set((targets ?? []).map(examTargetToken));
  // legacy "학교 전체" target은 그 학교의 모든 학년 scope를 시험으로 표시한다
  const isTargetScope = (scope: ExamTarget) =>
    targetTokens.has(examTargetToken(scope)) ||
    (targets ?? []).some(
      (target) => target.grade === null && target.school.trim() === scope.school.trim(),
    );

  const save = (selected: ExamTarget[]) => {
    if (isPending) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await updateExamTargetSchoolsAction(groupId, selected);
      if (result && "error" in result) {
        setError(result.error ?? "시험 대상 학교를 저장하지 못했어요.");
        return; // 실패 시 다이얼로그 유지 — 화면이 저장된 척하지 않는다
      }
      setDialogOpen(false);
    });
  };

  return (
    <div>
      <div className="section-title flex items-center gap-1.5 text-[#a2643c]">
        <School className="h-3.5 w-3.5" aria-hidden /> 시험 대상 학교
      </div>

      {targets === null ? (
        // legacy: 시험 대비는 ON인데 대상을 아직 고르지 않은 그룹 (자동 all-school 저장 금지)
        <div className="mt-2">
          <p className="secondary-text text-[#8a7b77]">
            시험 대상이 아직 설정되지 않았어요. 이번 시험을 준비하는 학교·학년을 선택해주세요.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => {
              setError("");
              setDialogOpen(true);
            }}
          >
            시험 대상 설정
          </Button>
        </div>
      ) : (
        <div className="mt-2">
          <ul className="space-y-1">
            {scopes.map((scope) => (
              <li key={examTargetToken(scope)} className="flex min-h-9 items-center gap-2">
                <span
                  className={
                    isTargetScope(scope)
                      ? "shrink-0 rounded-full bg-[#efe8fb] px-2 py-0.5 text-xs font-semibold text-[#5d4ba5]"
                      : "shrink-0 rounded-full bg-[#f0f0f3] px-2 py-0.5 text-xs font-medium text-[#6b6b74]"
                  }
                >
                  {isTargetScope(scope) ? "시험" : "일반"}
                </span>
                <span className="body-text min-w-0 break-words text-[#2d2928]">
                  {formatExamTarget(scope)}
                </span>
                {scope.studentCount > 0 ? (
                  <span className="caption-text shrink-0 text-[#a79996]">
                    {scope.studentCount}명
                  </span>
                ) : null}
              </li>
            ))}
            {staleScopes.map((scope) => (
              <li key={examTargetToken(scope)} className="flex min-h-9 items-center gap-2">
                <span className="shrink-0 rounded-full bg-[#efe8fb] px-2 py-0.5 text-xs font-semibold text-[#5d4ba5]">
                  시험
                </span>
                <span className="body-text min-w-0 break-words text-[#8a7b77]">
                  {formatExamTarget(scope)}
                </span>
                <span className="caption-text shrink-0 text-[#a79996]">
                  {scope.grade === null ? "전체 (기존) · 학년 미지정" : "현재 학생 없음"}
                </span>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => {
              setError("");
              setDialogOpen(true);
            }}
          >
            대상 학교 변경
          </Button>
        </div>
      )}
      {error && !dialogOpen ? <p className="secondary-text mt-1 text-[#a26660]">{error}</p> : null}

      {dialogOpen ? (
        <SchoolSelectDialog
          title="시험 대상 학교"
          helper="이번 시험을 준비하는 학교·학년을 선택해주세요."
          confirmLabel="저장"
          scopes={scopes}
          staleScopes={staleScopes}
          initialSelected={
            targets ??
            // legacy 미설정: 저장값이 없으므로 빈 선택에서 시작 (자동 선택/추측 없음)
            []
          }
          pending={isPending}
          error={error}
          onConfirm={save}
          onClose={() => {
            if (!isPending) {
              setDialogOpen(false);
              setError("");
            }
          }}
        />
      ) : null}
    </div>
  );
}
