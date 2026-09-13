import { addDaysStr } from "@/lib/calendar";
import { isCompletedToday } from "@/lib/preparation";

type HomeworkDateState = {
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
};

// Carry-forward is a today-only projection. Historical and future dates stay exact-due.
export function shouldShowHomeworkOnSelectedDate(item: HomeworkDateState, selectedDate: string, today: string) {
  if (!item.dueDate) return false;
  if (selectedDate !== today) return item.dueDate === selectedDate;
  return item.completed ? isCompletedToday(item, today) : item.dueDate <= today;
}

// Added to the calendar range in one PostgREST OR; never fetch all completed history.
export function homeworkTodayFilter(today: string) {
  const start = `${today}T00:00:00+09:00`;
  const end = `${addDaysStr(today, 1)}T00:00:00+09:00`;
  return `and(completed.eq.false,due_date.lte.${today}),and(completed.eq.true,completed_at.gte.${start},completed_at.lt.${end})`;
}
