// Auth types — frontend-first (to be backed by Supabase in the backend phase)

export type Role = string;

export const ROLE_LABELS: Record<string, string> = {
  gestor: 'Gestor / Proprietário',
  'dev-admin': 'DEV/ADMIN',
  barbeiro: 'Barbeiro',
  manicure: 'Manicure',
  vendedor: 'Vendedor de Prótese',
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  gestor: 'Acesso completo ao sistema, incluindo financeiro, equipe, configurações e relatórios.',
  'dev-admin': 'Acesso completo ao sistema, incluindo financeiro, equipe, configurações e relatórios.',
  barbeiro: 'Acesso à agenda própria, controle diário e clientes.',
  manicure: 'Acesso à agenda própria, controle diário e clientes.',
  vendedor: 'Acesso à agenda de prótese e vendas, clientes e dashboard.',
};

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: Role | null; // null = needs onboarding
  professionalId?: string;
  avatar?: string;
  organizationId?: string;
  permissions?: string[];
}

export function getRoleLabel(role: string | null | undefined): string {
  if (!role) return '';
  return ROLE_LABELS[role] || role;
}
