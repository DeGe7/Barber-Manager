export function formatDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMonthKey(date = new Date()): string {
  return formatDateKey(date).slice(0, 7);
}

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function differenceInCalendarDays(fromValue: string, toValue: string): number {
  const from = parseDateKey(fromValue);
  const to = parseDateKey(toValue);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return Number.NaN;
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatTimestampDateKey(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : formatDateKey(date);
}

export type SubscriptionDuration = 'Mensal' | 'Trimestral' | 'Semestral' | 'Anual';

export function addSubscriptionCycle(value: string, duration: SubscriptionDuration): string {
  const source = parseDateKey(value);
  // Date normalizes values such as 2026-02-31 to a different calendar day.
  // Subscription dates come from an input[type=date], so reject that drift
  // instead of allowing the client to disagree with the SQL date calculation.
  if (Number.isNaN(source.getTime()) || formatDateKey(source) !== value) return '';
  const months = duration === 'Trimestral' ? 3 : duration === 'Semestral' ? 6 : duration === 'Anual' ? 12 : 1;
  const day = source.getDate();
  // Start from the first day of the target month, then clamp the original
  // day to that month's actual length (e.g. Jan 31 + 1 month = Feb 28/29).
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1, 12, 0, 0, 0);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12, 0, 0, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return formatDateKey(target);
}