export function canAccess(
  _role: string | null,
  _path: string,
  _permissions?: string[],
) {
  return true;
}

export function getPermissionsForRole(_role: string, _permissions?: string[]) {
  return [];
}

export function getNavItemsForRole(_role: string | null, _permissions?: string[]) {
  return [
    { path: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
    { path: '/controle', label: 'Controle Diário', icon: 'Calendar' },
    { path: '/agenda', label: 'Agenda', icon: 'CalendarCheck' },
    { path: '/clientes', label: 'Clientes', icon: 'UserPlus' },
    { path: '/profissionais', label: 'Profissionais', icon: 'Users' },
    { path: '/produtos', label: 'Produtos & Estoque', icon: 'Package' },
    { path: '/planos', label: 'Planos & Mensalidades', icon: 'CreditCard' },
    { path: '/financeiro', label: 'Financeiro', icon: 'DollarSign' },
    { path: '/comunicacao', label: 'Disparos de Mensagens', icon: 'MessageSquare' },
    { path: '/configuracoes', label: 'Configurações', icon: 'Settings' },
  ];
}
