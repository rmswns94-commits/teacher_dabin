import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildStudentCheckSignals } from "@/lib/student-checks";
import { MixedContextList, SavedLessonSections } from "@/components/mixed-context-display";
import { addDaysStr } from "@/lib/calendar";
import { formatKoreanDate } from "@/lib/dates";
import { formatHomeworkDisplay, homeworkAudienceLabel, isDerivedHomeworkMirror, stripHomeworkDuePrefix } from "@/lib/homework-assignments";
import { linkedContextLabel } from "@/lib/textbooks";
import { vocabPercent } from "@/lib/elementary";
import { getGroupBriefingData } from "@/lib/supabase/queries/briefing";
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

// 수업 전 반 브리핑 — 기존 데이터(약점/오답/숙제/출결/시험/To Do/진도)의 deterministic 정리.
// 데이터가 없는 섹션은 숨긴다. Dashboard에서 <Suspense>로 감싸 hero 렌더를 막지 않는다.
export async function ClassBriefing({
  group,
  isNow,
  startTime,
  today,
  previousBefore,
  exams,
  prepTexts,
  todayMakeups = [],
}: {
  group: { id: string; name: string; icon: string | null };
  isNow: boolean;
  startTime: string; // "HH:MM"
  today: string;
  // 직전 수업 source cutoff (exclusive) — 오늘 수업 종료 전에는 오늘 일지를
  // 미리 완료했어도 브리핑 source에서 제외한다 (Dashboard가 occurrence 기준으로 계산)
  previousBefore: string;
  // 이 그룹에 연결된 시험 일정 (Dashboard에서 이미 조회한 D-30 창 재사용 — 추가 쿼리 없음)
  exams: { id: string; title: string; badge: string }[];
  // 이 그룹의 미완료 준비 항목 (기존 shared To Do — 브리핑 전용 Todo 생성 없음)
  prepTexts: string[];
  // 오늘 scheduled 보충 (Dashboard가 이미 조회한 batch 재사용 — 추가 쿼리 0).
  // exact group relation 매칭은 buildStudentCheckSignals가 groupId로만 한다 (추측 금지).
  todayMakeups?: { studentId: string | null; groupId: string | null; startTime: string | null }[];
}) {
  const data = await getGroupBriefingData(
    group.id,
    today,
    addDaysStr(today, -MISTAKE_WINDOW_DAYS),
    previousBefore,
  );
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
    briefingGroupId: group.id,
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

  return (
    <Card className="mt-4 border-[#e8ddf3] bg-[#fdfbf8]">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <span aria-hidden>{group.icon ?? "📘"}</span> {group.name} 수업 브리핑
          </CardTitle>
          <span className="rounded-full bg-[#efe8fb] px-2.5 py-1 text-sm font-medium tabular-nums text-[#5d4ba5]">
            {isNow ? "지금 수업 중" : `${startTime} 시작`}
          </span>
        </div>
        <p className="secondary-text mt-1 text-[#8a7b77]">오늘 체크할 것</p>
      </CardHeader>
      <CardContent>
        {!hasAnything ? (
          <div className="body-text rounded-2xl bg-[#f6f1ec] p-3 text-[#655d5d]">
            오늘은 특별히 체크할 것이 없어요. 좋은 수업 되세요 🌿
          </div>
        ) : (
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
        )}
      </CardContent>
    </Card>
  );
}

// Suspense fallback — hero 렌더를 막지 않고 브리핑만 늦게 채운다
export function ClassBriefingSkeleton() {
  return (
    <Card className="mt-4 border-[#e8ddf3] bg-[#fdfbf8]">
      <CardContent className="p-5 text-sm text-[#a79996]">수업 브리핑 준비 중...</CardContent>
    </Card>
  );
}
