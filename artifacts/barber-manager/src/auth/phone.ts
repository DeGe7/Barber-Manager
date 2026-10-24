export function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  let normalized: string;

  if (trimmed.startsWith('+')) {
    normalized = `+${digits}`;
  } else if (trimmed.startsWith('00')) {
    normalized = `+${digits.slice(2)}`;
  } else if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    normalized = `+${digits}`;
  } else if (digits.length === 10 || digits.length === 11) {
    normalized = `+55${digits}`;
  } else {
    throw new Error('Informe um telefone válido com código do país, por exemplo +55 11 99999-9999.');
  }

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error('Informe um telefone válido com código do país, por exemplo +55 11 99999-9999.');
  }

  return normalized;
}
