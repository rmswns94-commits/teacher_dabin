import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { Student } from "@/data/mock";

export function StudentRow({ student }: { student: Student }) {
  return (
    <Link href={`/students/${student.id}`}>
      <Card className="mb-3 p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(120,109,164,0.12)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-[#2b2323]">{student.name}</h3>
              {student.makeupStatus === "없음" ? (
                <span className="rounded-full bg-[#edf9f3] px-2 py-1 text-[10px] font-medium text-[#3d7f64]">보충 없음</span>
              ) : (
                <span className="rounded-full bg-[#fff0ef] px-2 py-1 text-[10px] font-medium text-[#a26258]">{student.makeupStatus}</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[#665b5a]">
              <span>{student.grade}</span>
              <span>•</span>
              <span>{student.className}</span>
            </div>
          </div>

          <div className="grid gap-2 text-sm text-[#5a4f4d] md:min-w-[340px] md:grid-cols-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#8a7b7a]">최근 진도</div>
              <div className="mt-1 font-medium">{student.recentProgress}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#8a7b7a]">최근 수업</div>
              <div className="mt-1 font-medium">{student.lastLesson}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#8a7b7a]">출석</div>
              <div className="mt-1 font-medium">{student.attendance}</div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
