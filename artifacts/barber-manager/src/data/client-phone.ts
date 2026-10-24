export function normalizeClientPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
}
