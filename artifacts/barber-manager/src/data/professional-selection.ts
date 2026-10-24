import type { Professional } from '@/data/store';

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

export function isAssignableProfessional(
  professional: Pick<Professional, 'name' | 'role'>,
): boolean {
  return normalizeLabel(professional.role) !== 'recepcao'
    && normalizeLabel(professional.name) !== 'recepcao';
}
