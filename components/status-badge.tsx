import { cn } from "@/lib/utils";
import type { AttendanceStatus, DailyLogStatus, MakeupStatus } from "@/lib/supabase/types";

const styles: Record<string, { label: string; className: string }> = {
  // daily log status
  draft: { label: "작성 중", className: "bg-[#fdf3e4] text-[#94702f]" },
  completed_log: { label: "작성 완료", className: "bg-[#edf9f3] text-[#3d7f64]" },
  // attendance
  present: { label: "출석", className: "bg-[#edf9f3] text-[#3d7f64]" },
  late: { label: "지각", className: "bg-[#fdf3e4] text-[#94702f]" },
  absent: { label: "결석", className: "bg-[#fff0ef] text-[#a26660]" },
  // makeup status
  required: { label: "보충 필요", className: "bg-[#fff0ef] text-[#a26660]" },
  scheduled: { label: "예정", className: "bg-[#f3eefc] text-[#614ea7]" },
  completed: { label: "완료", className: "bg-[#edf9f3] text-[#3d7f64]" },
  cancelled: { label: "취소", className: "bg-[#f6f1ee] text-[#796b67]" },
};

export function DailyLogStatusBadge({ status, className }: { status: DailyLogStatus; className?: string }) {
  const style = status === "completed" ? styles.completed_log : styles.draft;
  return <Badge label={style.label} badgeClassName={style.className} className={className} />;
}

export function AttendanceBadge({ status, className }: { status: AttendanceStatus; className?: string }) {
  const style = styles[status];
  return <Badge label={style.label} badgeClassName={style.className} className={className} />;
}

export function MakeupStatusBadge({ status, className }: { status: MakeupStatus; className?: string }) {
  const style = styles[status];
  return <Badge label={style.label} badgeClassName={style.className} className={className} />;
}

function Badge({
  label,
  badgeClassName,
  className,
}: {
  label: string;
  badgeClassName: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
        badgeClassName,
        className,
      )}
    >
      {label}
    </span>
  );
}
