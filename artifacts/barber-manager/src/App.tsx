import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Redirect,
} from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

import { AppStoreProvider } from '@/data/store';
import { AuthProvider, useAuth } from '@/auth/auth';
import { SplashScreen } from '@/components/SplashScreen';
import { Layout } from '@/components/Layout';

// Pages
import Login from '@/pages/login';
import Cadastro from '@/pages/cadastro';
import Onboarding from '@/pages/onboarding';
import Convite from '@/pages/convite';
import Dashboard from '@/pages/dashboard';
import Controle from '@/pages/controle';
import Agenda from '@/pages/agenda';
import Clientes from '@/pages/clientes';
import Profissionais from '@/pages/profissionais';
import Vendas from '@/pages/vendas';
import Produtos from '@/pages/produtos';
import Planos from '@/pages/planos';
import Financeiro from '@/pages/financeiro';
import Configuracoes from '@/pages/configuracoes';
import Comunicacao from '@/pages/comunicacao';
import Perfil from '@/pages/perfil';

const queryClient = new QueryClient();

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function PageTransition({ children, locationKey }: { children: ReactNode; locationKey: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={locationKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeInOut' }}
        className="h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function MainRouter() {
  const { session, profile, loading } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return <div className="min-h-[100dvh] bg-brand-bg" />;
  }

  // Auth routing logic
  const isInviteRoute = location.startsWith('/convite/');
  const hasInviteContext = Boolean(new URLSearchParams(window.location.search).get('convite'));

  if (!session && location !== '/login' && location !== '/cadastro' && !isInviteRoute) {
    return <Redirect to="/login" />;
  }

  if (session && profile && profile.role === null && location !== '/onboarding' && !isInviteRoute && !(hasInviteContext && (location === '/login' || location === '/cadastro'))) {
    return <Redirect to="/onboarding" />;
  }

  if (session && profile && profile.role !== null && (location === '/login' || location === '/cadastro')) {
    return <Redirect to="/" />;
  }

  // Public/Unwrapped routes
  if (location === '/login' || location === '/cadastro') {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/cadastro" component={Cadastro} />
      </Switch>
    );
  }

  if (location === '/onboarding') {
    return (
      <Switch>
        <Route path="/onboarding" component={Onboarding} />
      </Switch>
    );
  }

  if (isInviteRoute) {
    return (
      <Switch>
        <Route path="/convite/:token" component={Convite} />
      </Switch>
    );
  }

  // Wrapped main app routes
  return (
    <Layout>
      <RoutedErrorBoundary>
        <PageTransition locationKey={location}>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/controle" component={Controle} />
            <Route path="/agenda" component={Agenda} />
            <Route path="/clientes" component={Clientes} />
            <Route path="/profissionais" component={Profissionais} />
            <Route path="/vendas" component={Vendas} />
            <Route path="/produtos" component={Produtos} />
            <Route path="/planos" component={Planos} />
            <Route path="/financeiro" component={Financeiro} />
            <Route path="/comunicacao" component={Comunicacao} />
            <Route path="/perfil" component={Perfil} />
            <Route path="/configuracoes/:section" component={Configuracoes} />
            <Route path="/configuracoes" component={Configuracoes} />
            <Route component={NotFound} />
          </Switch>
        </PageTransition>
      </RoutedErrorBoundary>
    </Layout>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppStoreProvider>
            {showSplash ? (
              <SplashScreen />
            ) : (
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <MainRouter />
              </WouterRouter>
            )}
            <Toaster
              position="top-center"
              theme="dark"
              richColors
              icons={{
                success: <CheckCircle2 className="w-4 h-4" />,
                error: <XCircle className="w-4 h-4" />,
                warning: <AlertTriangle className="w-4 h-4" />,
                info: <Info className="w-4 h-4" />,
              }}
            />
          </AppStoreProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
