"use client";

import { School } from "lucide-react";
import { useState, useTransition } from "react";

import { updateExamTargetSchoolsAction } from "@/app/groups/actions";
import { Button } from "@/components/ui/button";

// 시험 대상 학교 선택/표시 — PHASE 1 (설정 저장 기반만).
// 학교 목록의 source는 "현재 그룹 학생들의 Student.school"이고(page가 이미 조회한 멤버 재사용),
// 어떤 학교가 시험을 보는지는 Teacher의 checkbox 선택만 사용한다 — Exam record/플래너/교재
// 존재 여부로 절대 추론하지 않는다. 판정은 trim된 정확한 문자열 일치(fuzzy 병합 없음).

// OFF→ON(시험 대비 시작)과 ON 중 [대상 학교 변경]이 같은 다이얼로그 한 벌을 쓴다.
export function SchoolSelectDialog({
  title,
  helper,
  confirmLabel,
  schools,
  staleTargets,
  initialSelected,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  helper: string;
  confirmLabel: string;
  // 현재 그룹 학생들의 학교 (trim/중복 제거/가나다 — 서버에서 만들어 내려온 목록)
  schools: string[];
  // 저장돼 있지만 현재 이 학교 학생이 0명인 항목 — 자동 삭제하지 않고 명시적으로 보여준다
  staleTargets: string[];
  initialSelected: string[];
  pending: boolean;
  error: string;
  onConfirm: (selected: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const hasAnySchool = schools.length > 0 || staleTargets.length > 0;
  const count = selected.size;

  const checkboxRow = (name: string, note?: string) => (
    <label
      key={name}
      className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-[#faf7ff]"
    >
      <input
        type="checkbox"
        checked={selected.has(name)}
        onChange={() => toggle(name)}
        className="h-4.5 w-4.5 shrink-0 accent-[#6d5aa8]"
      />
      <span className="min-w-0 flex-1">
        <span className="body-text block break-words text-[#2d2928]">{name}</span>
        {note ? <span className="caption-text block text-[#a79996]">{note}</span> : null}
      </span>
      <span
        className={
          selected.has(name)
            ? "shrink-0 rounded-full bg-[#efe8fb] px-2 py-0.5 text-xs font-semibold text-[#5d4ba5]"
            : "shrink-0 rounded-full bg-[#f0f0f3] px-2 py-0.5 text-xs font-medium text-[#6b6b74]"
        }
      >
        {selected.has(name) ? "시험" : "일반"}
      </span>
    </label>
  );

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
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 text-left shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="card-title text-[#2a2323]">{title}</div>
        <p className="secondary-text mt-2 text-[#655d5d]">{helper}</p>

        {hasAnySchool ? (
          <div className="mt-3 space-y-0.5">
            {schools.map((name) => checkboxRow(name))}
            {staleTargets.length > 0 ? (
              <div className="mt-2 border-t border-dashed border-[#efe4dc] pt-2">
                <div className="caption-text mb-1 px-2 font-semibold text-[#a79996]">
                  기존 선택 · 현재 학생 없음
                </div>
                {staleTargets.map((name) =>
                  checkboxRow(name, "현재 이 반에 소속된 학생이 없는 학교예요."),
                )}
              </div>
            ) : null}
            <p className="secondary-text px-2 pt-2 text-[#a79996]">
              선택하지 않은 학교는 일반 수업으로 진행됩니다.
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
        {hasAnySchool && count === 0 ? (
          <p className="secondary-text mt-2 text-[#a2643c]">시험 대상 학교를 하나 이상 선택해주세요.</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || count === 0}
            onClick={() => onConfirm([...selected])}
          >
            {pending ? "저장 중..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// 그룹 상세의 시험 대상 학교 요약 — 시험 대비 ON일 때만 page가 렌더한다.
// targetSchools가 null이면 legacy(미설정) 상태: 자동 backfill 없이 설정을 안내만 한다.
export function ExamTargetSchoolsSection({
  groupId,
  schools,
  targetSchools,
}: {
  groupId: string;
  schools: string[];
  targetSchools: string[] | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const targetSet = new Set(targetSchools ?? []);
  // 저장돼 있지만 현재 학생 목록에 없는 학교 — 자동 삭제하지 않고 표시/해제 가능하게 유지
  const staleTargets = (targetSchools ?? []).filter((name) => !schools.includes(name));

  const save = (selected: string[]) => {
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

      {targetSchools === null ? (
        // legacy: 시험 대비는 ON인데 대상 학교를 아직 고르지 않은 그룹 (자동 all-school 저장 금지)
        <div className="mt-2">
          <p className="secondary-text text-[#8a7b77]">
            시험 대상 학교가 아직 설정되지 않았어요. 이번 시험을 준비하는 학교를 선택해주세요.
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
            시험 대상 학교 설정
          </Button>
        </div>
      ) : (
        <div className="mt-2">
          <ul className="space-y-1">
            {schools.map((name) => (
              <li key={name} className="flex min-h-9 items-center gap-2">
                <span
                  className={
                    targetSet.has(name)
                      ? "shrink-0 rounded-full bg-[#efe8fb] px-2 py-0.5 text-xs font-semibold text-[#5d4ba5]"
                      : "shrink-0 rounded-full bg-[#f0f0f3] px-2 py-0.5 text-xs font-medium text-[#6b6b74]"
                  }
                >
                  {targetSet.has(name) ? "시험" : "일반"}
                </span>
                <span className="body-text min-w-0 break-words text-[#2d2928]">{name}</span>
              </li>
            ))}
            {staleTargets.map((name) => (
              <li key={name} className="flex min-h-9 items-center gap-2">
                <span className="shrink-0 rounded-full bg-[#efe8fb] px-2 py-0.5 text-xs font-semibold text-[#5d4ba5]">
                  시험
                </span>
                <span className="body-text min-w-0 break-words text-[#8a7b77]">{name}</span>
                <span className="caption-text shrink-0 text-[#a79996]">현재 학생 없음</span>
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
          helper="이번 시험을 준비하는 학교를 선택해주세요."
          confirmLabel="저장"
          schools={schools}
          staleTargets={staleTargets}
          initialSelected={targetSchools ?? []}
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

