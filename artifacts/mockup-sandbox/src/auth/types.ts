export type UserSession = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  avatar?: string;
  phone?: string;
  professionalId?: string;
  permissions?: string[];
};

export function getRoleLabel(role: string | null) {
  return role === 'gestor' ? 'Gestor / Proprietário' : role ?? 'Sem cargo';
}
