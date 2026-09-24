import Link from "next/link";
import { CheckCheck, ListChecks } from "lucide-react";

import { ClassBriefingCard, type ClassCardEntry } from "@/components/class-briefing-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildStudentCheckSignals } from "@/lib/student-checks";
import { MixedContextList, SavedLessonSections } from "@/components/mixed-context-display";
import { addDaysStr } from "@/lib/calendar";
import {
  buildDailyLogChecklist,
  firstMissingSection,
  type ChecklistItem,
  type DailyLogCompletenessSource,
} from "@/lib/daily-log-completeness";
import { formatKoreanDate } from "@/lib/dates";
import { formatHomeworkDisplay, homeworkAudienceLabel, isDerivedHomeworkMirror, stripHomeworkDuePrefix } from "@/lib/homework-assignments";
import { linkedContextLabel } from "@/lib/textbooks";
import { vocabPercent } from "@/lib/elementary";
import { EMPTY_GROUP_BRIEFING, getGroupsBriefingData, type GroupBriefingData } from "@/lib/supabase/queries/briefing";
import { getAutosaveDraftGroupIdsOn } from "@/lib/supabase/queries/daily-log-drafts";
import type { DailyLogStatus } from "@/lib/supabase/types";
import { weaknessCategoryLabels } from "@/lib/validation/weakness";
import { aggregateVocabMistakes } from "@/lib/vocab";

// 반복 오답 집계 창 (최근 30일)
const MISTAKE_WINDOW_DAYS = 30;

type SectionLine = { key: string; text: string };

// 브리핑 전용 줄 목록 — 수업 직전에 훑어보는 화면이라 항상 전부 보여준다
// (접기/더 보기 없음, 개수 제한 없음). 다른 카드의 미리보기 정책과는 무관하다.
function BriefingLines({ lines }: { lines: SectionLine[] }) {
  return (
    <div className="space-y-1">
      {lines.map((line) => (
        <div
          key={line.key}
          className="body-text min-w-0 whitespace-pre-line break-words text-[#453b3b]"
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}

function BriefingSection({
  icon,
  title,
  titleClass,
  children,
}: {
  icon: string;
  title: string;
  titleClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      {/* 섹션 제목 = 16px/600 (앱 공통 section-title). 이모지는 baseline이 흔들리지 않게
          flex items-center로 붙인다. */}
      <div className={`section-title flex items-center gap-1.5 ${titleClass}`}>
        <span aria-hidden>{icon}</span> {title}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

// 오늘의 실제 수업 occurrence 하나 — Dashboard가 이미 가진 데이터(schedule resolver 결과 +
// 오늘 일지 batch + 그룹 목록)로만 만든다. 브리핑/마무리 본문은 이 컴포넌트가 occurrence마다 렌더.
export type BriefingOccurrence = {
  key: string; // occurrenceKey — 탐색 state의 stable id
  groupId: string;
  groupName: string;
  groupIcon: string | null;
  examPeriod: boolean;
  source: "regular" | "supplement";
  startTime: string; // "HH:MM" — effective (시간 변경/이동 destination/보강 반영)
  endTime: string;
  startEpoch: number;
  endEpoch: number;
  // 이 그룹에 연결된 시험 일정 (Dashboard에서 이미 조회한 D-30 창 재사용 — 추가 쿼리 없음)
  exams: { id: string; title: string; badge: string }[];
  // 이 그룹의 미완료 준비 항목 (기존 shared To Do — 브리핑 전용 Todo 생성 없음)
  prepTexts: string[];
  // canonical identity(user+group+오늘)의 Daily Log — Dashboard의 오늘 일지 batch에서 찾은 것.
  // status로 Finalized 판정, completeness로 마무리 체크리스트를 만든다 (created_at 최신 row 아님).
  log: { id: string; status: DailyLogStatus; completeness: DailyLogCompletenessSource } | null;
};

// 브리핑 본문 — 기존 데이터(약점/오답/숙제/출결/시험/To Do/진도)의 deterministic 정리.
// 데이터가 없는 섹션은 숨긴다. 카드 shell/header는 ClassBriefingCard(client)가 그린다.
function BriefingBody({
  data,
  groupId,
  exams,
  prepTexts,
  todayMakeups,
}: {
  data: GroupBriefingData;
  groupId: string;
  exams: { id: string; title: string; badge: string }[];
  prepTexts: string[];
  todayMakeups: { studentId: string | null; groupId: string | null; startTime: string | null }[];
}) {
  const nameById = new Map(data.members.map((member) => [member.id, member.name]));
  const lastLog = data.lastLog;

  // ⚠ 복습 필요 (Phase 1 due weaknesses)
  const weaknessLines: SectionLine[] = data.dueWeaknesses.map((weakness, index) => ({
    key: `w-${index}`,
    text: `${nameById.get(weakness.student_id) ?? "학생"} · ${weakness.title} (${weaknessCategoryLabels[weakness.category]})`,
  }));

  // 🔤 단어 (Phase 2): 학생당 한 줄 — 반복 오답(30일 창 2회 이상) + 지난 시험 낮음/재시험
  const mistakesByStudent = new Map<string, { word: string; created_at: string }[]>();
  for (const mistake of data.recentMistakes) {
    mistakesByStudent.set(mistake.student_id, [
      ...(mistakesByStudent.get(mistake.student_id) ?? []),
      mistake,
    ]);
  }
  const rowByStudent = new Map((lastLog?.rows ?? []).map((row) => [row.student_id, row]));
  const vocabLines: SectionLine[] = [];
  for (const member of data.members) {
    const parts: string[] = [];
    const repeated = aggregateVocabMistakes(mistakesByStudent.get(member.id) ?? []).find(
      (item) => item.count >= 2,
    );
    if (repeated) {
      parts.push(`${repeated.word} 반복 오답 ${repeated.count}회`);
    }
    const row = rowByStudent.get(member.id);
    if (
      row &&
      row.attendance !== "absent" &&
      row.vocab_correct !== null &&
      (lastLog?.vocab_total ?? 0) > 0
    ) {
      const pct = vocabPercent(row.vocab_correct, lastLog!.vocab_total!) ?? 100;
      if (row.vocab_retest || pct < 60) {
        parts.push(
          `지난 시험 ${row.vocab_correct}/${lastLog!.vocab_total}${row.vocab_retest ? " · 재시험" : ""}`,
        );
      }
    }
    if (parts.length > 0) {
      vocabLines.push({ key: member.id, text: `${member.name} · ${parts.join(" · ")}` });
    }
  }

  // 📒 지난 숙제 — 직전 수업(lastLog)에서 내준 숙제 내용.
  // lastLog는 이미 class-end cutoff가 적용된 "직전 finalized 일지"라, 오늘 일지를
  // 수업 전에 미리 완료해도 수업 종료 전에는 여기 반영되지 않는다 (기존 lock 그대로).
  // 같은 일지에 저장된 숙제 행을 context별로 표시한다. 완료 여부는 history에서 필터하지 않는다.
  // legacy 원문은 기존 formatter를 유지하고, 구조화 행의 정확한 mirror만 중복 표시에서 제외한다.
  const previousHomework = stripHomeworkDuePrefix(lastLog?.homework?.trim() ?? "");
  const homeworkItems = lastLog?.homeworkAssignments ?? [];
  const homeworkRaw = homeworkItems.length > 0 && isDerivedHomeworkMirror(
    lastLog?.homework ?? "",
    homeworkItems.map((item) => ({ ...item, dueDate: item.due_date })),
  ) ? "" : previousHomework;

  // 지난 숙제를 얼마나 해왔는지 (제출 현황) — 숙제 내용 아래 보조 줄
  const missingNames = (lastLog?.rows ?? [])
    .filter((row) => row.homework_status === "missing")
    .map((row) => nameById.get(row.student_id) ?? "학생");
  const partialCount = (lastLog?.rows ?? []).filter(
    (row) => row.homework_status === "partial",
  ).length;
  const homeworkStatusText = [
    missingNames.length > 0
      ? `미제출 ${missingNames.length}명 (${missingNames.slice(0, 3).join(", ")}${missingNames.length > 3 ? " 외" : ""})`
      : "",
    partialCount > 0 ? `일부 ${partialCount}명` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // 🚫 지난 수업 결석
  const absentNames = (lastLog?.rows ?? [])
    .filter((row) => row.attendance === "absent")
    .map((row, index) => ({
      key: `a-${index}`,
      text: nameById.get(row.student_id) ?? "학생",
    }));

  // 📚 오늘 진도 (마지막 일지의 다음 수업 계획)
  const planText = lastLog?.next_lesson_plan?.trim() ?? "";
  const hasPlan = Boolean(planText) || [...(lastLog?.school_plans ?? []), ...(lastLog?.textbook_plans ?? [])].some((item) => item.text.trim());

  // ✅ 준비할 일 / 🗓 시험
  const todoLines: SectionLine[] = prepTexts.map((text, index) => ({ key: `t-${index}`, text }));
  const examLines: SectionLine[] = exams.map((exam) => ({
    key: exam.id,
    text: `${exam.title} · ${exam.badge}`,
  }));

  // 🙋 학생 체크 (PHASE 5) — 오늘 수업 전에 한 번 더 확인할 예외 학생만 (전원 나열 금지).
  // source 전부 이미 가진 데이터: members/직전 rows(class-end lock 승계)/개인 밀린 숙제 batch/
  // Dashboard가 조회해 내려준 오늘 보충. 0명이면 section 자체를 렌더하지 않는다.
  const studentCheckRows = buildStudentCheckSignals({
    members: data.members,
    overdueStudentHomework: data.overdueStudentHomework,
    previousRows: lastLog?.rows ?? [],
    todayMakeups,
    briefingGroupId: groupId,
  });

  // 준비할 일 · 오늘 진도 · 지난 숙제는 항상 자리를 지킨다 (내용이 없으면 안내 문구).
  // 내용 유무로 열이 밀려 배치가 흔들리지 않게 하기 위함.
  const extraSections =
    weaknessLines.length > 0 || vocabLines.length > 0 || absentNames.length > 0 || examLines.length > 0;
  const hasAnything =
    todoLines.length > 0 ||
    hasPlan ||
    Boolean(previousHomework) ||
    homeworkItems.length > 0 ||
    studentCheckRows.length > 0 ||
    extraSections;

  if (!hasAnything) {
    return (
      <div className="body-text rounded-2xl bg-[#f6f1ec] p-3 text-[#655d5d]">
        오늘은 특별히 체크할 것이 없어요. 좋은 수업 되세요 🌿
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 준비할 일 → 오늘 진도 → 지난 숙제: 모든 화면에서 full-width 세로 배치. */}
      <div className="space-y-4">
        <BriefingSection icon="✅" title="준비할 일" titleClass="text-[#3e7d6b]">
          {todoLines.length > 0 ? (
            <BriefingLines lines={todoLines} />
          ) : (
            <p className="secondary-text text-[#a79996]">준비할 일이 없어요</p>
          )}
        </BriefingSection>

        <BriefingSection icon="📚" title="오늘 진도" titleClass="text-[#3c6478]">
          {hasPlan ? (
            <SavedLessonSections school={lastLog?.school_plans} textbook={lastLog?.textbook_plans} raw={planText} />
          ) : (
            <p className="secondary-text text-[#a79996]">적어둔 계획이 없어요</p>
          )}
        </BriefingSection>

        <BriefingSection icon="📒" title="지난 숙제" titleClass="text-[#8a6828]">
          {homeworkItems.length > 0 || previousHomework ? (
            <>
              <MixedContextList items={homeworkItems} renderItem={(item) => (
                <div className="body-text min-w-0 whitespace-pre-wrap break-words text-[#453b3b]">
                  {formatHomeworkDisplay({ audienceLabel: homeworkAudienceLabel(item.assignedStudentName), contextLabel: linkedContextLabel(item), content: item.content })}
                </div>
              )} />
              {homeworkRaw ? <div className="body-text min-w-0 whitespace-pre-wrap break-words text-[#453b3b]">{homeworkRaw}</div> : null}
              {homeworkStatusText ? (
                <p className="caption-text mt-1 text-[#8a7b77]">{homeworkStatusText}</p>
              ) : null}
            </>
          ) : (
            <p className="secondary-text text-[#a79996]">지난 숙제가 없어요</p>
          )}
        </BriefingSection>

        {/* 학생 체크 — 예외 학생만, 학생당 row 1개에 signal을 묶는다 (문제 없는 학생 미표시).
            0명이면 section 자체 숨김 — empty 안내 블록을 만들지 않는다. */}
        {studentCheckRows.length > 0 ? (
          <BriefingSection icon="🙋" title="학생 체크" titleClass="text-[#6d5aa8]">
            <ul className="space-y-1.5">
              {studentCheckRows.map((row) => (
                <li key={row.studentId} className="min-w-0">
                  <Link
                    href={`/students/${row.studentId}`}
                    className="body-text break-words font-semibold text-[#2d2928] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c9b9e8]"
                  >
                    {row.name}
                  </Link>
                  <div className="secondary-text flex flex-wrap gap-x-1.5 text-[#7f6f68]">
                    {row.signals.map((signal, index) => (
                      <span key={signal.type} className="min-w-0 break-words">
                        {index > 0 ? <span aria-hidden>· </span> : null}
                        {signal.label}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </BriefingSection>
        ) : null}
      </div>

      {/* 부가 정보 — 있을 때만 (기존 섹션/디자인 그대로) */}
      {extraSections ? (
        <div className="grid gap-x-8 gap-y-4 border-t border-dashed border-[#f0e7e2] pt-3 md:grid-cols-2 xl:grid-cols-3">
          {weaknessLines.length > 0 ? (
            <BriefingSection icon="⚠️" title="복습 필요" titleClass="text-[#94702f]">
              <BriefingLines lines={weaknessLines} />
            </BriefingSection>
          ) : null}

          {vocabLines.length > 0 ? (
            <BriefingSection icon="🔤" title="단어" titleClass="text-[#54479c]">
              <BriefingLines lines={vocabLines} />
            </BriefingSection>
          ) : null}

          {absentNames.length > 0 ? (
            <BriefingSection
              icon="🚫"
              title={`지난 수업 결석 (${formatKoreanDate(lastLog?.class_date)})`}
              titleClass="text-[#a26660]"
            >
              <BriefingLines lines={absentNames} />
            </BriefingSection>
          ) : null}

          {examLines.length > 0 ? (
            <BriefingSection icon="🗓️" title="시험" titleClass="text-[#a05a7c]">
              <BriefingLines lines={examLines} />
            </BriefingSection>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const CHECK_SYMBOL: Record<ChecklistItem["state"], { mark: string; className: string }> = {
  done: { mark: "✓", className: "text-[#3d7f64]" },
  review: { mark: "!", className: "text-[#a2643c]" },
  optional: { mark: "–", className: "text-[#a79996]" },
};

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const symbol = CHECK_SYMBOL[item.state];
  return (
    <li
      data-check-key={item.key}
      data-check-state={item.state}
      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl bg-white/70 px-3 py-1.5"
    >
      {/* 상태는 기호 + 문구(detail)로 전달 — 색만으로 구분하지 않는다 */}
      <span aria-hidden className={`w-3 shrink-0 text-center font-semibold ${symbol.className}`}>
        {symbol.mark}
      </span>
      <span className="body-text font-medium text-[#2d2928]">{item.label}</span>
      <span className="secondary-text min-w-0 break-words text-[#8a7b77]">{item.detail}</span>
    </li>
  );
}

function withFinalizeParam(href: string) {
  return `${href}${href.includes("?") ? "&" : "?"}finalize=1`;
}

// 수업 마무리 본문 — 저장된 Daily Log(canonical identity)에서 파생한 체크리스트와 두 액션.
// 목적지는 빠른 실행/미작성 알림과 같은 canonical 규칙: 일지가 있으면 그 수정 화면(draft 이어쓰기 —
// 새 draft를 만들지 않는다), 없으면 그룹+오늘 날짜의 새 작성 화면(그 화면의 기존 resolver가
// 자동 임시저장 draft를 찾아 복원). 여기서는 어떤 row도 만들거나 바꾸지 않는다.
function WrapUpBody({
  occ,
  today,
  hasAutosaveDraft,
  logsUnavailable,
}: {
  occ: BriefingOccurrence;
  today: string;
  hasAutosaveDraft: boolean;
  logsUnavailable: boolean;
}) {
  const base = occ.log
    ? `/daily-logs/${occ.log.id}/edit`
    : `/daily-logs/new?groupId=${occ.groupId}&date=${today}`;

  if (logsUnavailable) {
    // 오늘 일지 조회 실패 — "미완료"라고 단정하지 않는다 (false alarm 금지)
    return (
      <div data-wrapup-state="unknown" className="space-y-3">
        <p className="body-text text-[#655d5d]">일지 상태를 불러오지 못했어요. 수업일지에서 직접 확인해주세요.</p>
        <Button variant="secondary" size="sm" className="gap-1.5" asChild>
          <Link href={base}>수업일지 열기</Link>
        </Button>
      </div>
    );
  }

  if (occ.log?.status === "completed") {
    return (
      <div data-wrapup-state="complete" className="space-y-3">
        <div className="rounded-2xl bg-[#edf9f3] p-4">
          <div className="section-title flex items-center gap-1.5 text-[#2f6d54]">
            <CheckCheck className="h-4 w-4 shrink-0" aria-hidden /> 수업 일지 작성이 완료 되었어요.
          </div>
          <p className="secondary-text mt-1 text-[#5f7d70]">출결 · 진도 · 숙제 등 오늘 수업 기록이 저장되었어요.</p>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link href={`/daily-logs/${occ.log.id}`}>일지 보기</Link>
        </Button>
      </div>
    );
  }

  // 체크리스트는 저장된 row가 있을 때만 — 자동 임시저장(daily_log_drafts payload)은 폼 state 스냅샷이라
  // 대시보드가 해석하지 않는다 (작성 중 안내만). 항목/판정은 lib/daily-log-completeness 한 곳.
  const items = occ.log ? buildDailyLogChecklist(occ.log.completeness) : null;
  const missing = items ? firstMissingSection(items) : null;
  const reviewHref = missing ? `${base}#${missing}` : base;
  // [수업 일지 완료]: 작성 내용(일지 row 또는 임시저장)이 있으면 기존 [수업 기록 완료] 요약 화면을 바로 연다.
  // 아무것도 없으면 그냥 작성 화면 — 빈 일지를 대시보드에서 Finalize하는 경로는 없다.
  const finalizeHref = occ.log || hasAutosaveDraft ? withFinalizeParam(base) : base;

  return (
    <div data-wrapup-state="incomplete" className="space-y-3">
      <p className="body-text text-[#655d5d]">아직 수업 일지가 완료되지 않았어요.</p>
      {items ? (
        <ul className="space-y-1.5" data-wrapup-checklist>
          {items.map((item) => (
            <ChecklistRow key={item.key} item={item} />
          ))}
        </ul>
      ) : (
        <div className="body-text rounded-2xl bg-[#f6f1ec] p-3 text-[#655d5d]">
          {hasAutosaveDraft
            ? "임시저장된 작성 중인 내용이 있어요. 이어서 작성하고 완료해주세요."
            : "아직 작성한 수업 일지가 없어요. 지금 작성해서 마무리해요."}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" className="gap-1.5" asChild>
          <Link href={reviewHref} data-wrapup-action="review">
            <ListChecks className="h-4 w-4" aria-hidden /> 빠진 항목 확인
          </Link>
        </Button>
        <Button size="sm" className="gap-1.5" asChild>
          <Link href={finalizeHref} data-wrapup-action="finalize">
            <CheckCheck className="h-4 w-4" aria-hidden /> 수업 일지 완료
          </Link>
        </Button>
      </div>
      <p className="caption-text text-[#a79996]">
        확인 권장 항목은 완료를 막지 않아요. [수업 일지 완료]는 기존 수업 기록 완료 화면에서 저장돼요.
      </p>
    </div>
  );
}

// Smart Briefing 카드 (server) — 오늘의 실제 수업 occurrence 전부의 브리핑/마무리 본문을 한 번에
// 준비해 client shell(ClassBriefingCard)에 넘긴다. Dashboard에서 <Suspense>로 감싸 hero 렌더를 막지 않는다.
// 쿼리: 브리핑 batch(getGroupsBriefingData — 그룹 수와 무관한 4쿼리 + 그룹별 마지막 Finalized 1쿼리) +
// 자동 임시저장 존재 여부 1쿼리. 탐색/자동 전환 시 추가 쿼리 0.
export async function ClassBriefing({
  occurrences,
  today,
  previousBefore,
  todayMakeups = [],
  initialNow,
  logsUnavailable = false,
}: {
  occurrences: BriefingOccurrence[];
  today: string;
  // 직전 수업 source cutoff (exclusive) — 오늘 수업 종료 전에는 오늘 일지를
  // 미리 완료했어도 브리핑 source에서 제외한다 (Dashboard가 occurrence 기준으로 계산)
  previousBefore: string;
  // 오늘 scheduled 보충 (Dashboard가 이미 조회한 batch 재사용 — 추가 쿼리 0).
  // exact group relation 매칭은 buildStudentCheckSignals가 groupId로만 한다 (추측 금지).
  todayMakeups?: { studentId: string | null; groupId: string | null; startTime: string | null }[];
  // 서버 렌더 시각 (client shell의 초기 시각 — hydration mismatch 방지)
  initialNow: number;
  // 오늘 일지 조회 실패 — 마무리 카드가 "미완료"를 단정하지 않게
  logsUnavailable?: boolean;
}) {
  const groupIds = [...new Set(occurrences.map((occ) => occ.groupId))];
  const [dataByGroup, autosaveGroupIds] = await Promise.all([
    getGroupsBriefingData(groupIds, today, addDaysStr(today, -MISTAKE_WINDOW_DAYS), previousBefore),
    // 일지 row가 없는 그룹의 "작성 중" 안내용 — 그룹 전체 1쿼리 (탐색마다 조회하지 않는다)
    getAutosaveDraftGroupIdsOn(
      today,
      occurrences.filter((occ) => !occ.log).map((occ) => occ.groupId),
    ),
  ]);

  const cards: ClassCardEntry[] = occurrences.map((occ) => ({
    key: occ.key,
    groupId: occ.groupId,
    groupName: occ.groupName,
    groupIcon: occ.groupIcon,
    examPeriod: occ.examPeriod,
    supplement: occ.source === "supplement",
    startTime: occ.startTime,
    endTime: occ.endTime,
    startEpoch: occ.startEpoch,
    endEpoch: occ.endEpoch,
    finalized: occ.log?.status === "completed",
    briefing: (
      <BriefingBody
        data={dataByGroup.get(occ.groupId) ?? EMPTY_GROUP_BRIEFING}
        groupId={occ.groupId}
        exams={occ.exams}
        prepTexts={occ.prepTexts}
        todayMakeups={todayMakeups}
      />
    ),
    wrapUp: (
      <WrapUpBody
        occ={occ}
        today={today}
        hasAutosaveDraft={autosaveGroupIds.has(occ.groupId)}
        logsUnavailable={logsUnavailable}
      />
    ),
  }));

  return <ClassBriefingCard cards={cards} initialNow={initialNow} />;
}

// Suspense fallback — hero 렌더를 막지 않고 브리핑만 늦게 채운다
export function ClassBriefingSkeleton() {
  return (
    <Card className="mt-4 rounded-3xl border-[#e8ddf3] bg-[#fdfbf8] shadow-[0_2px_12px_rgba(90,70,120,0.06)]">
      <CardContent className="p-5 text-sm text-[#a79996]">수업 브리핑 준비 중...</CardContent>
    </Card>
  );
}
