"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ShareableHomeworkItem } from "@/lib/homework-share";
import { shareableHomework } from "@/lib/homework-share";
import {
  buildLessonShareText,
  hasShareableContextSection,
  type ShareContextSections,
} from "@/lib/lesson-share";

// "수업 안내 공유" 다이얼로그 — 현재 폼 state의 진도/숙제/다음 계획 중 선택한 항목만
// OS share sheet(카카오톡 선택 가능) 또는 클립보드로 공유한다. read-only projection:
// 체크박스/대상 선택은 다이얼로그 로컬 state뿐이라 폼 dirty/autosave/저장 payload와 무관하고,
// 부모가 열려 있는 동안 최신 폼 state를 props로 계속 내려보내므로 공유 시점 값이 최신이다.
// (open 시점마다 새로 마운트되어 기본 체크 상태가 그때의 내용 기준으로 초기화된다)

export type LessonShareHomeworkItem = ShareableHomeworkItem & {
  // 대상 학생 id ("" = 공통) — 공유 대상 필터링용 (이름 아님, 동명이인 안전)
  assignedStudentId: string;
};

type Props = {
  onClose: () => void;
  progress: ShareContextSections;
  nextPlan: ShareContextSections;
  homeworkItems: readonly LessonShareHomeworkItem[];
  students: readonly { studentId: string; name: string }[];
};

export function LessonShareDialog({ onClose, progress, nextPlan, homeworkItems, students }: Props) {
  const progressAvailable = hasShareableContextSection(progress);
  const nextPlanAvailable = hasShareableContextSection(nextPlan);
  // 공통 숙제만으로도 섹션이 성립하는지 (기본 대상 = 공통 안내)
  const commonHomework = homeworkItems.filter((item) => !item.assignedStudentId);
  const homeworkAvailable = shareableHomework(homeworkItems).length > 0;
  const hasStudentSpecific = shareableHomework(homeworkItems).some((item) => item.assignedStudentId);

  // 내용 있는 섹션은 기본 체크, 없는 섹션은 disabled (다이얼로그 로컬 state — 폼과 무관)
  const [includeProgress, setIncludeProgress] = useState(progressAvailable);
  const [includeHomework, setIncludeHomework] = useState(homeworkAvailable);
  const [includeNextPlan, setIncludeNextPlan] = useState(nextPlanAvailable);
  // 숙제 공유 대상: "" = 공통 안내, 그 외 = 학생 id (공통 + 그 학생 숙제만)
  const [audienceStudentId, setAudienceStudentId] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const shareBusyRef = useRef(false);

  const audienceHomework = audienceStudentId
    ? homeworkItems.filter((item) => !item.assignedStudentId || item.assignedStudentId === audienceStudentId)
    : commonHomework;

  // 선택 기준의 최종 조립 입력 — 실제 공유 텍스트와 같은 판단으로 버튼 활성 여부 결정
  const shareInput = {
    progress: includeProgress ? progress : null,
    homework: includeHomework ? audienceHomework : null,
    nextPlan: includeNextPlan ? nextPlan : null,
  };
  const shareableNow =
    (includeProgress && progressAvailable) ||
    (includeHomework && shareableHomework(audienceHomework).length > 0) ||
    (includeNextPlan && nextPlanAvailable);

  const copyText = async (text: string, successText: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ tone: "ok", text: successText });
    } catch {
      setNotice({ tone: "error", text: "수업 안내를 복사하지 못했어요. 다시 시도해주세요." });
    }
  };

  // 명시적 [공유하기] 클릭에서만 실행 — 클릭 "시점"의 최신 props로 텍스트를 조립한다.
  // DB 조회/저장 없음. AbortError(사용자 취소)는 조용히 종료 — 복사/에러 안내 금지.
  const share = async () => {
    if (shareBusyRef.current) {
      return;
    }
    const text = buildLessonShareText(shareInput);
    shareBusyRef.current = true;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ text });
          onClose();
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          await copyText(text, "공유 기능을 사용할 수 없어 수업 안내를 복사했어요.");
        }
      } else {
        await copyText(text, "수업 안내를 복사했어요.");
      }
    } finally {
      shareBusyRef.current = false;
    }
  };

  const checkboxRow = (
    label: string,
    checked: boolean,
    available: boolean,
    onChange: (next: boolean) => void,
  ) => (
    <label
      className={
        available
          ? "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-[#ece4f4] bg-white px-3 py-2"
          : "flex min-h-11 items-center gap-2.5 rounded-xl border border-[#f0ece7] bg-[#faf8f6] px-3 py-2 opacity-60"
      }
    >
      <input
        type="checkbox"
        checked={checked && available}
        disabled={!available}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[#6652b9]"
      />
      <span className="text-base text-[#3d3450]">{label}</span>
      {!available ? <span className="caption-text text-[#a79996]">작성된 내용 없음</span> : null}
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="오늘 수업 안내 공유"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
        <div className="card-title text-[#2a2323]">오늘 수업 안내 공유</div>
        <p className="secondary-text mt-1 text-[#655d5d]">공유할 내용을 선택해주세요.</p>

        <div className="mt-4 space-y-2">
          {checkboxRow("오늘 진도", includeProgress, progressAvailable, setIncludeProgress)}
          {checkboxRow("오늘 숙제", includeHomework, homeworkAvailable, setIncludeHomework)}
          {checkboxRow("다음 수업 계획", includeNextPlan, nextPlanAvailable, setIncludeNextPlan)}
        </div>

        {/* 학생별 숙제가 실제로 있을 때만 대상 선택 노출 — 기본은 공통 안내(개별 숙제 미포함).
            특정 학생 선택 = 공통 + 그 학생 숙제만 (다른 학생 개별 숙제는 절대 포함 안 됨). */}
        {hasStudentSpecific && includeHomework ? (
          <label className="form-label mt-3 flex items-center gap-2 text-[#7c6d69]">
            <span className="shrink-0">숙제 공유 대상</span>
            <select
              value={audienceStudentId}
              onChange={(event) => setAudienceStudentId(event.target.value)}
              aria-label="숙제 공유 대상"
              className="min-h-[40px] w-full min-w-0 rounded-xl border border-[#dfe4ee] bg-[#f5f7fb] px-2.5 py-1.5 text-base font-medium text-[#4a5568] outline-none"
            >
              <option value="">공통 안내</option>
              {students.map((student) => (
                <option key={student.studentId} value={student.studentId}>
                  {student.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {notice ? (
          <div
            role="status"
            className={
              notice.tone === "ok"
                ? "mt-3 rounded-xl border border-[#d8ebe0] bg-[#f0faf5] px-3 py-2 text-sm text-[#2f6d54]"
                : "mt-3 rounded-xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]"
            }
          >
            {notice.text}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="button" disabled={!shareableNow} onClick={share} autoFocus>
            공유하기
          </Button>
        </div>
      </div>
    </div>
  );
}
