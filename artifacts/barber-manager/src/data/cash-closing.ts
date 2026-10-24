import { formatDateKey, parseDateKey } from './date';

export type CashClosingFrequency = 'weekly' | 'monthly';

export interface CashClosingSchedule {
  frequency: CashClosingFrequency;
  weekday: number;
  dayOfMonth: number;
}

export interface CashClosingWindow {
  periodStart: string;
  periodEnd: string;
  isDue: boolean;
}

const dateAt = (value: string) => parseDateKey(value);

function dayKey(date: Date): string {
  return formatDateKey(date);
}

function monthBoundary(year: number, monthIndex: number, dayOfMonth: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0, 12).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(dayOfMonth, 1), lastDay), 12);
}

function boundaryOnOrAfter(value: string, schedule: CashClosingSchedule): string {
  const date = dateAt(value);
  if (schedule.frequency === 'weekly') {
    const daysAhead = (schedule.weekday - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + daysAhead);
    return dayKey(date);
  }

  const thisMonth = monthBoundary(date.getFullYear(), date.getMonth(), schedule.dayOfMonth);
  if (thisMonth >= date) return dayKey(thisMonth);
  return dayKey(monthBoundary(date.getFullYear(), date.getMonth() + 1, schedule.dayOfMonth));
}

function previousBoundary(value: string, schedule: CashClosingSchedule): string {
  const boundary = dateAt(value);
  if (schedule.frequency === 'weekly') {
    boundary.setDate(boundary.getDate() - 7);
    return dayKey(boundary);
  }
  return dayKey(monthBoundary(boundary.getFullYear(), boundary.getMonth() - 1, schedule.dayOfMonth));
}

function dayAfter(value: string): string {
  const date = dateAt(value);
  date.setDate(date.getDate() + 1);
  return dayKey(date);
}

export function getNextCashClosingWindow(
  schedule: CashClosingSchedule,
  closedPeriods: Array<{ periodEnd: string }>,
  today = formatDateKey(),
): CashClosingWindow {
  const latestClose = [...closedPeriods].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  const periodStart = latestClose
    ? dayAfter(latestClose.periodEnd)
    : dayAfter(previousBoundary(boundaryOnOrAfter(today, schedule), schedule));
  const periodEnd = boundaryOnOrAfter(periodStart, schedule);

  return {
    periodStart,
    periodEnd,
    isDue: periodEnd <= today,
  };
}
