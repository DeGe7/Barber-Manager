import type { UserSession } from './types';

const demoProfile: UserSession = {
  id: 'demo-user',
  name: 'Marcos Macedo',
  email: 'gestor@exemplo.com',
  role: 'gestor',
  avatar: undefined,
  professionalId: undefined,
  permissions: [],
};

export function useAuth() {
  return {
    profile: demoProfile,
    viewAsProfile: null as UserSession | null,
    setViewAsProfile: (_profile: UserSession | null) => undefined,
    signOut: async () => undefined,
  };
}
