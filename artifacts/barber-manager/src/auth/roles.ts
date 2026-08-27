import type { Role } from './types';

// Routes each role can access
export const ROLE_ROUTES: Record<Role, string[]> = {
  gestor: [
    '/',
    '/dashboard',
    '/agenda',
    '/clientes',
    '/controle',
    '/financeiro',
    '/profissionais',
    '/produtos',
    '/planos',
    '/vendas',
    '/comunicacao',
    '/perfil',
    '/configuracoes',
  ],
  'dev-admin': [
    '/',
    '/dashboard',
    '/agenda',
    '/clientes',
    '/controle',
    '/financeiro',
    '/profissionais',
    '/produtos',
    '/planos',
    '/vendas',
    '/comunicacao',
    '/perfil',
    '/configuracoes',
  ],
  barbeiro: ['/', '/dashboard', '/agenda', '/controle', '/perfil'],
  manicure: ['/', '/dashboard', '/agenda', '/controle', '/perfil'],
  vendedor: ['/', '/dashboard', '/agenda', '/clientes', '/vendas', '/perfil'],
};

export function canAccess(role: Role | null, path: string): boolean {
  if (!role) return false;
  const allowed = ROLE_ROUTES[role];
  // Exact match or prefix match for nested routes
  return allowed.some((r) => path === r || (r !== '/' && path.startsWith(r)));
}

// Nav items per role (in display order)
export interface NavItem {
  path: string;
  label: string;
  icon: string; // lucide icon name
}

export const ALL_NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { path: '/controle', label: 'Controle Diário', icon: 'Calendar' },
  { path: '/agenda', label: 'Agenda', icon: 'CalendarCheck' },
  { path: '/clientes', label: 'Clientes', icon: 'UserPlus' },
  { path: '/profissionais', label: 'Profissionais', icon: 'Users' },
  { path: '/vendas', label: 'Vendas & Mentoria', icon: 'ShoppingCart' },
  { path: '/produtos', label: 'Produtos & Estoque', icon: 'Package' },
  { path: '/planos', label: 'Planos & Mensalidades', icon: 'CreditCard' },
  { path: '/financeiro', label: 'Financeiro', icon: 'DollarSign' },
  { path: '/comunicacao', label: 'Disparos de Mensagens', icon: 'MessageSquare' },
  { path: '/configuracoes', label: 'Configurações', icon: 'Settings' },
];

export function getNavItemsForRole(role: Role | null): NavItem[] {
  if (!role) return [];
  const allowed = ROLE_ROUTES[role];
  return ALL_NAV_ITEMS.filter((item) => allowed.includes(item.path));
}
