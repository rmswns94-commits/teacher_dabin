"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { todayDateString } from "@/lib/dates";

// 교사일지 Excel 내보내기: 날짜 범위를 골라 기존 양식(.xlsx)으로 다운로드한다.
// 실제 파일 생성은 서버 route(/daily-logs/export)가 담당 — 여기선 다운로드 URL만 연다.
export function ExcelExportButton() {
  const [open, setOpen] = useState(false);
  const today = todayDateString();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [error, setError] = useState("");

  const download = () => {
    if (!start || !end) {
      setError("시작일과 종료일을 입력해주세요.");
      return;
    }
    if (start > end) {
      setError("종료일은 시작일보다 빠를 수 없어요.");
      return;
    }
    setError("");
    // 페이지 이동이 아니라 파일 다운로드이므로 anchor 클릭으로 트리거한다
    const anchor = document.createElement("a");
    anchor.href = `/daily-logs/export?start=${start}&end=${end}`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setOpen(false);
  };

  return (
    <>
      <Button type="button" variant="secondary" className="gap-2" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" /> Excel 내보내기
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="교사일지 Excel 내보내기"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            <div className="font-display text-lg font-semibold text-[#2a2323]">
              교사일지 Excel 내보내기
            </div>
            <p className="mt-1 text-xs leading-5 text-[#8a7b77]">
              선택한 기간의 수업 시간표·교재·공통 진도를 기존 교사일지 양식(.xlsx)으로 내려받아요.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">시작일</span>
                <input
                  type="date"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                  className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">종료일</span>
                <input
                  type="date"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                  className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
                />
              </label>
            </div>

            {error ? (
              <div className="mt-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
                {error}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button type="button" size="sm" className="gap-1.5" onClick={download}>
                <Download className="h-3.5 w-3.5" /> 내보내기
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
