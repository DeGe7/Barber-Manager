import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/auth/auth';
import { canAccess, getNavItemsForRole } from '@/auth/roles';
import { useStore } from '@/data/store';
import { getRoleLabel } from '@/auth/types';
import NoAccess from '@/pages/no-access';
import {
  LayoutDashboard,
  Calendar,
  CalendarCheck,
  UserPlus,
  Users,
  ShoppingCart,
  Package,
  CreditCard,
  DollarSign,
  Settings,
  LogOut,
  Menu,
  X,
  Scissors,
  ChevronLeft,
  ChevronRight,
  MessageSquare
  ,UserCircle
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  Calendar,
  CalendarCheck,
  UserPlus,
  Users,
  ShoppingCart,
  Package,
  CreditCard,
  DollarSign,
  Settings,
  MessageSquare,
  UserCircle,
};

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { profile, signOut } = useAuth();
  const store = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('barber-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  if (!profile) return null;

  const role = profile.role;
  const hasAccess = canAccess(role, location, profile.permissions);
  const navItems = getNavItemsForRole(role, profile.permissions);
  const mobileDailyPaths = ['/', '/agenda', '/controle', '/produtos', '/vendas', '/clientes'];
  const mobileNavItems = mobileDailyPaths
    .map((path) => navItems.find((item) => item.path === path))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 4);
  const currentNav = navItems.find((n) => location === n.path || (n.path !== '/' && location.startsWith(n.path)));
  const pageTitle = location === '/perfil' ? 'Meu Perfil' : currentNav?.label || 'Barber Manager';

  const handleLogout = () => {
    signOut().then(() => {
      setLocation('/login');
    });
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        localStorage.setItem('barber-sidebar-collapsed', String(next));
      } catch {
        // Keep the UI usable when storage is unavailable.
      }
      return next;
    });
  };

  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <>
      <div className={`relative p-4 flex items-center ${collapsed ? 'justify-center' : 'gap-3'} border-b border-brand-border bg-brand-bg h-[72px] shrink-0`}>
        <div className="w-9 h-9 rounded-lg bg-brand-gold flex items-center justify-center text-brand-bg shrink-0 shadow-[0_0_10px_rgba(201,168,76,0.3)]">
          <Scissors className="w-5 h-5" />
        </div>
        {!collapsed && <span className="font-bold text-lg text-foreground truncate uppercase tracking-wide">{store.config.name || 'Barber Manager'}</span>}
        {!collapsed && (
          <button type="button" onClick={toggleSidebar} aria-label="Recolher barra lateral" className="ml-auto p-2 rounded-lg text-muted-foreground hover:bg-brand-surface hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {collapsed && (
          <button type="button" onClick={toggleSidebar} aria-label="Expandir barra lateral" className="absolute top-5 right-2 p-1 rounded-md text-muted-foreground hover:bg-brand-surface hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto py-6 ${collapsed ? 'px-2' : 'px-4'} space-y-1.5 bg-brand-surface`}>
        {navItems.map((item) => {
          const Icon = ICON_MAP[item.icon] || LayoutDashboard;
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => setMobileMenuOpen(false)}
              title={collapsed ? item.label : undefined}
              className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-lg transition-all ${
                isActive 
                  ? 'bg-brand-gold/10 text-brand-gold font-medium border border-brand-gold/20' 
                  : 'text-muted-foreground hover:bg-brand-bg border border-transparent hover:text-foreground hover:border-brand-border'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-brand-gold' : 'opacity-70'}`} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </div>

      <div className={`${collapsed ? 'p-3' : 'p-5'} border-t border-brand-border bg-brand-bg shrink-0`}>
        <div className={`flex items-center ${collapsed ? 'justify-center mb-3' : 'gap-3 mb-5 px-1'}`}>
          <div className="w-10 h-10 rounded-full bg-brand-surface border border-brand-border flex items-center justify-center text-brand-gold font-bold text-sm">
            {profile.avatar ? <img src={profile.avatar} alt="" className="w-full h-full rounded-full object-cover" /> : profile.name.charAt(0).toUpperCase()}
          </div>
          {!collapsed && <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{profile.name}</p>
            <p className="text-xs text-brand-gold truncate">{getRoleLabel(role)}</p>
          </div>}
        </div>
        <button 
          onClick={handleLogout}
          aria-label="Sair do sistema"
          title={collapsed ? 'Sair do sistema' : undefined}
          className={`${collapsed ? 'px-2' : 'px-4 gap-2'} w-full flex items-center justify-center py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive border border-transparent hover:border-destructive/20 rounded-lg transition-all`}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Sair do sistema</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-[100dvh] flex bg-brand-bg text-foreground overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex flex-col ${sidebarCollapsed ? 'w-[76px]' : 'w-[280px]'} border-r border-brand-border shrink-0 z-20 shadow-xl transition-[width] duration-200`}>
        <SidebarContent collapsed={sidebarCollapsed} />
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative flex flex-col w-[280px] max-w-[85vw] h-full shadow-2xl bg-brand-surface" role="dialog" aria-modal="true" aria-label="Menu de navegação">
            <button 
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Fechar menu"
              className="absolute top-5 right-4 p-2 bg-brand-bg border border-brand-border rounded-lg text-muted-foreground hover:text-foreground z-10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
             <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-[100dvh] relative bg-brand-bg">
        {/* Topbar */}
        <header className="h-[72px] shrink-0 bg-brand-bg/80 backdrop-blur-md border-b border-brand-border flex items-center px-5 md:px-8 justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden p-2 -ml-2 rounded-lg bg-brand-surface border border-brand-border text-foreground transition-colors hover:bg-brand-border"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu de navegação"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-foreground">{pageTitle}</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center text-sm font-medium text-muted-foreground bg-brand-surface px-4 py-2 rounded-lg border border-brand-border">
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <Link href="/perfil" aria-label="Abrir meu perfil" title="Meu Perfil" className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface p-1.5 md:pr-3 hover:border-brand-gold/60 transition-colors">
              <div className="w-8 h-8 rounded-full bg-brand-bg border border-brand-border flex items-center justify-center text-brand-gold font-bold text-sm overflow-hidden">
                {profile.avatar ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" /> : profile.name.charAt(0).toUpperCase()}
              </div>
              <span className="hidden md:block max-w-32 truncate text-sm font-semibold text-foreground">{profile.name}</span>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto relative pb-20 md:pb-0">
          {hasAccess ? children : <NoAccess />}
        </div>
      </main>

      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-brand-border bg-brand-surface/95 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 backdrop-blur-lg"
        aria-label="Navegação principal"
      >
        {mobileNavItems.map((item) => {
          const Icon = ICON_MAP[item.icon] || LayoutDashboard;
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors ${
                isActive ? 'text-brand-gold' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{item.label.replace('Controle Diário', 'Controle').replace('Produtos & Estoque', 'Estoque')}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Abrir mais opções"
        >
          <Menu className="h-5 w-5" />
          <span>Mais</span>
        </button>
      </nav>
    </div>
  );
}
