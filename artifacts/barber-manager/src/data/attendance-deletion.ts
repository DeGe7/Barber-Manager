const ATTENDANCE_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinAttendanceDeleteWindow(
  attendanceRecordedAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!attendanceRecordedAt) return true;

  const recordedAt = Date.parse(attendanceRecordedAt);
  return Number.isFinite(recordedAt)
    && recordedAt <= now
    && now - recordedAt < ATTENDANCE_DELETE_WINDOW_MS;
}

export function canDeleteAttendance(
  attendanceRecordedAt: string | null | undefined,
  role: string | null | undefined,
  now = Date.now(),
): boolean {
  if (role === 'gestor' || role === 'dev-admin') return true;
  return isWithinAttendanceDeleteWindow(attendanceRecordedAt, now);
}
