// Auth types — frontend-first (to be backed by Supabase in the backend phase)

export type Role = 'gestor' | 'dev-admin' | 'barbeiro' | 'manicure' | 'vendedor';

export const ROLE_LABELS: Record<Role, string> = {
  gestor: 'Gestor / Proprietário',
  'dev-admin': 'DEV/ADMIN',
  barbeiro: 'Barbeiro',
  manicure: 'Manicure',
  vendedor: 'Vendedor de Prótese',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
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
}
