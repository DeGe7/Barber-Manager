import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/auth/auth';
import { Scissors } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [, setLocation] = useLocation();
  const { signIn, acceptInvitation } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const inviteToken = new URLSearchParams(window.location.search).get('convite') || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Preencha e-mail e senha.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      await signIn(email, password);
      if (inviteToken) await acceptInvitation(inviteToken);
      toast.success('Bem-vindo de volta!');
      setLocation('/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível entrar.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-brand-bg p-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-gold/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-brand-surface border border-brand-border rounded-2xl shadow-2xl overflow-hidden flex flex-col relative z-10">
        <div className="p-8 text-center border-b border-brand-border bg-brand-bg/30">
          <div className="inline-flex items-center justify-center p-4 rounded-xl bg-brand-gold/10 text-brand-gold mb-5 border border-brand-gold/20">
            <Scissors className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Barber Manager</h1>
          <p className="text-sm text-muted-foreground mt-2">Sistema profissional de gestão</p>
        </div>
        
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {inviteToken && (
              <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 p-3 text-sm text-brand-gold">
                Convite encontrado. Use o e-mail que recebeu o convite para entrar na equipe.
              </div>
            )}
            {errorMessage && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">E-mail</label>
              <input 
                id="email"
                name="email"
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold text-foreground placeholder:text-muted-foreground transition-all"
                placeholder="seu@email.com"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Senha</label>
              <input 
                id="password"
                name="password"
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold text-foreground placeholder:text-muted-foreground transition-all"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-brand-gold text-brand-bg font-bold py-3 px-4 rounded-lg hover:bg-brand-gold/90 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-[0_0_15px_rgba(201,168,76,0.2)]"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-6">
            Ainda não tem uma conta? <Link href={inviteToken ? `/cadastro?convite=${encodeURIComponent(inviteToken)}` : '/cadastro'} className="text-brand-gold hover:underline">Cadastre-se</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
