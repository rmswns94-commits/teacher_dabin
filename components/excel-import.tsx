"use client";

import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatKoreanDate } from "@/lib/dates";
import type { MatchedLesson } from "@/lib/excel/match-lessons";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

type PreviewPayload = {
  fileName: string;
  sheetName: string | null;
  items: MatchedLesson[];
  groups: { id: string; name: string }[];
  existingLogs: {
    id: string;
    group_id: string;
    class_date: string;
    status: "draft" | "completed";
    default_progress: string | null;
  }[];
};

type ApplyResult = {
  created: number;
  updated: number;
  kept: number;
  failed: { index: number; reason: string }[];
};

// preview row의 편집 가능한 상태
type RowState = {
  included: boolean;
  groupId: string; // "" = 미선택
  progress: string;
  resolution: "keep" | "append" | "replace";
};

function statusBadge(kind: "auto" | "review" | "none" | "existing") {
  const map = {
    auto: { text: "✓ 자동 매칭", className: "bg-[#e4f4ec] text-[#3d7f64]" },
    review: { text: "△ 확인 필요", className: "bg-[#fdf3e4] text-[#94702f]" },
    none: { text: "! 그룹 없음", className: "bg-[#f9e7e5] text-[#a25a54]" },
    existing: { text: "기존 일지 있음", className: "bg-[#efe8fb] text-[#5d4ba5]" },
  } as const;
  const style = map[kind];

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style.className}`}>
      {style.text}
    </span>
  );
}

export function ExcelImportButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const reset = () => {
    setPreview(null);
    setRows({});
    setError("");
    setResult(null);
    setDirty(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const requestClose = () => {
    if (preview && !result && (dirty || preview.items.length > 0)) {
      if (!window.confirm("가져오기를 중단할까요? 아직 수업일지에 반영되지 않았어요.")) {
        return;
      }
    }
    setOpen(false);
    reset();
  };

  const existingOf = (item: MatchedLesson, groupId: string) =>
    groupId
      ? (preview?.existingLogs.find(
          (log) => log.group_id === groupId && log.class_date === item.date,
        ) ?? null)
      : null;

  const handleFile = async (file: File) => {
    setError("");

    if (file.size > MAX_FILE_BYTES) {
      setError("파일이 너무 커요. 수업진도 Excel 파일을 확인해주세요.");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/daily-logs/import", { method: "POST", body: formData });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "파일을 읽지 못했어요.");
        return;
      }

      const data = payload as PreviewPayload;
      setPreview(data);
      setRows(
        Object.fromEntries(
          data.items.map((item) => [
            item.key,
            {
              // 그룹이 정해지지 않았거나 내용이 없는 row는 기본 제외
              included: item.matchedGroupId !== null && !item.emptyContent,
              groupId: item.matchedGroupId ?? "",
              progress: item.progress,
              resolution: "keep",
            } satisfies RowState,
          ]),
        ),
      );
    } catch {
      setError("파일을 업로드하지 못했어요. 네트워크를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (key: string, patch: Partial<RowState>) => {
    setDirty(true);
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  // 업로드 가능한 row = 그룹이 정해져 있고 진도가 있는 row.
  // (사용자가 수동으로 그룹을 지정하거나 진도를 입력해 valid가 된 row 포함)
  const isSelectable = (row: RowState | undefined) =>
    Boolean(row?.groupId && row.progress.trim());

  // 전체 선택: valid row만 한 번의 state update로 checked (invalid는 그대로 unchecked)
  const selectAll = () => {
    setDirty(true);
    setRows((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([key, row]) => [
          key,
          { ...row, included: isSelectable(row) },
        ]),
      ),
    );
  };

  // 전체 해제: validation 상태는 그대로 두고 선택만 모두 해제
  const deselectAll = () => {
    setDirty(true);
    setRows((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([key, row]) => [key, { ...row, included: false }]),
      ),
    );
  };

  // 반영 대상: 체크됨 + 그룹 선택됨 + 진도 있음
  const importable = preview
    ? preview.items.filter((item) => {
        const row = rows[item.key];
        return row?.included && row.groupId && row.progress.trim();
      })
    : [];

  const apply = async () => {
    if (!preview || importable.length === 0) return;

    setApplying(true);
    setError("");

    try {
      const response = await fetch("/daily-logs/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: importable.map((item) => {
            const row = rows[item.key];
            return {
              date: item.date,
              groupId: row.groupId,
              progress: row.progress.trim(),
              textbooks: item.textbooks,
              resolution: existingOf(item, row.groupId) ? row.resolution : "keep",
            };
          }),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "반영하지 못했어요.");
        return;
      }

      setResult(payload as ApplyResult);
      router.refresh();
    } catch {
      setError("반영 중 문제가 생겼어요. 다시 시도해주세요.");
    } finally {
      setApplying(false);
    }
  };

  // 날짜별 grouping
  const byDate: [string, MatchedLesson[]][] = [];
  if (preview) {
    for (const item of preview.items) {
      const last = byDate[byDate.length - 1];
      if (last && last[0] === item.date) last[1].push(item);
      else byDate.push([item.date, [item]]);
    }
  }

  const summary = preview
    ? {
        auto: preview.items.filter((item) => item.confidence === "auto").length,
        review: preview.items.filter((item) => item.confidence === "review").length,
        none: preview.items.filter((item) => item.confidence === "none").length,
      }
    : null;

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="h-4 w-4" />
        Excel 불러오기
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Excel 수업일지 불러오기"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") requestClose();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) requestClose();
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#26262b]/35 px-3 py-6"
        >
          <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-2xl border border-[#e6e6ea] bg-white shadow-xl">
            <div className="border-b border-[#ececf0] px-5 py-4">
              <div className="text-base font-bold text-[#232327]">Excel 수업일지 불러오기</div>
              {preview ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6b6b74]">
                  <span className="truncate">{preview.fileName}</span>
                  <span>수업 {preview.items.length}개</span>
                  {summary ? (
                    <>
                      <span className="text-[#3d7f64]">자동 매칭 {summary.auto}</span>
                      {summary.review > 0 ? (
                        <span className="text-[#94702f]">확인 필요 {summary.review}</span>
                      ) : null}
                      {summary.none > 0 ? (
                        <span className="text-[#a25a54]">그룹 없음 {summary.none}</span>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-xs text-[#6b6b74]">
                  수업진도 Excel(.xlsx)을 올리면 날짜·시간·교재·진도를 읽어 수업 그룹과 자동으로
                  맞춰드려요. 반영 전에 반드시 확인할 수 있어요.
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {result ? (
                <div className="space-y-3 text-sm">
                  <div className="text-base font-bold text-[#232327]">Excel 가져오기 완료</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        ["새 수업일지", result.created, "bg-[#e4f4ec] text-[#3d7f64]"],
                        ["업데이트", result.updated, "bg-[#efe8fb] text-[#5d4ba5]"],
                        ["기존 내용 유지", result.kept, "bg-[#f0f0f3] text-[#4c4c55]"],
                        ["실패", result.failed.length, "bg-[#f9e7e5] text-[#a25a54]"],
                      ] as const
                    ).map(([label, count, className]) => (
                      <div key={label} className={`rounded-2xl p-3 text-center ${className}`}>
                        <div className="text-[11px]">{label}</div>
                        <div className="mt-0.5 text-lg font-semibold tabular-nums">{count}</div>
                      </div>
                    ))}
                  </div>
                  {result.failed.length > 0 ? (
                    <ul className="space-y-1 rounded-2xl bg-[#fff5f2] p-3 text-xs text-[#a25a54]">
                      {result.failed.map((failure, index) => (
                        <li key={index}>• {failure.reason}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-xs text-[#8a8a93]">
                    새로 만든 일지는 &quot;작성 중&quot; 상태예요. 수업일지에서 출결과 학생 기록을
                    이어서 작성해주세요.
                  </p>
                </div>
              ) : !preview ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#dcdce2] px-4 py-10 text-center">
                  <Upload className="h-6 w-6 text-[#8a8a93]" aria-hidden />
                  <p className="text-sm text-[#4c4c55]">
                    수업진도 Excel 파일(.xlsx)을 선택해주세요.
                    <br />
                    <span className="text-xs text-[#8a8a93]">
                      파일은 저장되지 않고 내용만 읽어요. (최대 4MB)
                    </span>
                  </p>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#2b2b31] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3a3a42]">
                    <FileSpreadsheet className="h-4 w-4" aria-hidden />
                    {loading ? "분석 중..." : "파일 선택"}
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx"
                      className="sr-only"
                      disabled={loading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleFile(file);
                      }}
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="min-h-[38px] rounded-xl border border-[#cfc4f0] bg-[#efe8fb] px-3 py-1.5 text-xs font-medium text-[#4a3c8f] transition hover:bg-[#e2d8f5]"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="min-h-[38px] rounded-xl border border-[#e2e2e8] bg-white px-3 py-1.5 text-xs font-medium text-[#4c4c55] transition hover:bg-[#f4f4f6]"
                    >
                      전체 해제
                    </button>
                    <span className="ml-auto text-xs tabular-nums text-[#6b6b74]">
                      업로드 가능{" "}
                      {preview.items.filter((item) => isSelectable(rows[item.key])).length} · 선택{" "}
                      {importable.length}
                    </span>
                  </div>

                  {byDate.map(([date, items]) => (
                    <section key={date}>
                      <h3 className="mb-2 border-b border-[#ececf0] pb-1.5 text-sm font-bold text-[#232327]">
                        {formatKoreanDate(date, true)}
                        <span className="ml-2 text-xs font-normal text-[#8a8a93]">
                          {items.length}개 수업
                        </span>
                      </h3>
                      <div className="space-y-2.5">
                        {items.map((item) => {
                          const row = rows[item.key];
                          if (!row) return null;
                          const existing = existingOf(item, row.groupId);

                          return (
                            <div
                              key={item.key}
                              className={`rounded-2xl border p-3 ${
                                row.included ? "border-[#e2e2e8] bg-white" : "border-[#ececf0] bg-[#fafafa] opacity-70"
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={row.included}
                                    onChange={(event) =>
                                      updateRow(item.key, { included: event.target.checked })
                                    }
                                    className="h-4 w-4 accent-[#2b2b31]"
                                    aria-label={`${item.rawTime} 수업 포함`}
                                  />
                                  <span className="text-sm font-semibold tabular-nums text-[#232327]">
                                    {item.startTime && item.endTime
                                      ? `${item.startTime} ~ ${item.endTime}`
                                      : item.rawTime}
                                  </span>
                                </label>
                                {statusBadge(item.confidence)}
                                {existing ? statusBadge("existing") : null}
                                {item.weekdayMismatch ? (
                                  <span className="text-[11px] text-[#a25a54]">
                                    파일의 요일 표기가 날짜와 달라요
                                  </span>
                                ) : null}
                              </div>

                              {item.matchReason ? (
                                <div className="mt-1 text-[11px] text-[#8a8a93]">{item.matchReason}</div>
                              ) : null}
                              {item.timeNote ? (
                                <div className="mt-1 text-[11px] text-[#94702f]">{item.timeNote}</div>
                              ) : null}

                              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,180px)_1fr]">
                                <label className="block">
                                  <span className="mb-1 block text-[11px] font-semibold text-[#6b6b74]">
                                    수업 그룹
                                  </span>
                                  <select
                                    value={row.groupId}
                                    onChange={(event) =>
                                      updateRow(item.key, { groupId: event.target.value })
                                    }
                                    className="w-full rounded-xl border border-[#dcdce2] bg-white px-2.5 py-2 text-sm outline-none focus:border-[#b9b9c6]"
                                  >
                                    <option value="">그룹 선택</option>
                                    {preview.groups.map((group) => (
                                      <option key={group.id} value={group.id}>
                                        {group.name}
                                      </option>
                                    ))}
                                  </select>
                                  {item.textbooks.length > 0 ? (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {item.textbooks.map((book) => (
                                        <span
                                          key={book}
                                          className="rounded-full bg-[#f0f0f3] px-2 py-0.5 text-[10px] text-[#4c4c55]"
                                        >
                                          {book}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </label>

                                <label className="block">
                                  <span className="mb-1 block text-[11px] font-semibold text-[#6b6b74]">
                                    진도
                                  </span>
                                  <textarea
                                    value={row.progress}
                                    onChange={(event) =>
                                      updateRow(item.key, { progress: event.target.value })
                                    }
                                    rows={Math.min(4, Math.max(1, row.progress.split("\n").length))}
                                    className="w-full rounded-xl border border-[#dcdce2] bg-white px-2.5 py-2 text-sm leading-5 outline-none focus:border-[#b9b9c6]"
                                    placeholder="진도 없음"
                                  />
                                </label>
                              </div>

                              {existing ? (
                                <div className="mt-2 rounded-xl bg-[#f8f6fc] p-2.5 text-xs">
                                  <div className="text-[#54479c]">
                                    이미 작성된 수업일지가 있어요
                                    {existing.status === "completed" ? " (작성 완료 상태)" : ""} · 현재
                                    진도: {existing.default_progress?.trim() || "없음"}
                                  </div>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {(
                                      [
                                        ["keep", "기존 내용 유지"],
                                        ["append", "Excel 내용을 뒤에 추가"],
                                        ["replace", "Excel 내용으로 교체"],
                                      ] as const
                                    ).map(([value, label]) => (
                                      <button
                                        key={value}
                                        type="button"
                                        aria-pressed={row.resolution === value}
                                        onClick={() => updateRow(item.key, { resolution: value })}
                                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                                          row.resolution === value
                                            ? "border-[#cfc4f0] bg-[#efe8fb] text-[#4a3c8f]"
                                            : "border-[#e2e2e8] bg-white text-[#4c4c55]"
                                        }`}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {error ? (
                <p className="mt-3 rounded-xl bg-[#fff5f2] px-3 py-2 text-sm text-[#a25a54]">{error}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#ececf0] px-5 py-3.5">
              {result ? (
                <Button type="button" onClick={requestClose}>
                  닫기
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={requestClose}>
                    취소
                  </Button>
                  {preview ? (
                    <Button
                      type="button"
                      disabled={applying || importable.length === 0}
                      onClick={apply}
                    >
                      {applying
                        ? "반영 중..."
                        : importable.length === 0
                          ? "반영할 수업을 선택해주세요"
                          : `선택한 ${importable.length}개 수업 반영하기`}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
