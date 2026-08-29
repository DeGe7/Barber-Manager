import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/auth/auth';
import { Scissors } from 'lucide-react';
import { toast } from 'sonner';

export default function Cadastro() {
  const [, setLocation] = useLocation();
  const { signUp, acceptInvitation } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const inviteToken = new URLSearchParams(window.location.search).get('convite') || '';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email || !password || !confirmation) {
      toast.error('Preencha todos os campos.');
      return;
    }
    if (name.trim().split(/\s+/).length < 2) {
      toast.error('Informe nome e sobrenome.');
      return;
    }
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmation) {
      toast.error('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUp(name, email, password);
      if (needsEmailConfirmation) {
        toast.success('Conta criada. Confira seu e-mail para confirmar o cadastro.');
        setLocation(inviteToken ? `/login?convite=${encodeURIComponent(inviteToken)}` : '/login');
      } else {
        if (inviteToken) await acceptInvitation(inviteToken);
        toast.success('Conta criada com sucesso!');
        setLocation('/dashboard');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-brand-bg p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-gold/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="w-full max-w-md bg-brand-surface border border-brand-border rounded-2xl shadow-2xl overflow-hidden relative z-10">
        <div className="p-8 text-center border-b border-brand-border bg-brand-bg/30">
          <div className="inline-flex items-center justify-center p-4 rounded-xl bg-brand-gold/10 text-brand-gold mb-5 border border-brand-gold/20"><Scissors className="w-8 h-8" /></div>
          <h1 className="text-2xl font-bold text-foreground">Criar sua conta</h1>
          <p className="text-sm text-muted-foreground mt-2">Comece a gerenciar seu estabelecimento</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {inviteToken && (
            <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 p-3 text-sm text-brand-gold">
              Você está se cadastrando a partir de um convite para uma equipe existente.
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="signup-name" className="text-sm font-medium text-foreground">Nome e sobrenome</label>
            <input id="signup-name" type="text" value={name} onChange={event => setName(event.target.value)} autoComplete="name" required className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold text-foreground" placeholder="Seu nome completo" />
          </div>
          <div className="space-y-2">
            <label htmlFor="signup-email" className="text-sm font-medium text-foreground">E-mail</label>
            <input id="signup-email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold text-foreground" placeholder="seu@email.com" />
          </div>
          <div className="space-y-2">
            <label htmlFor="signup-password" className="text-sm font-medium text-foreground">Senha</label>
            <input id="signup-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" required className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold text-foreground" placeholder="Mínimo de 6 caracteres" />
          </div>
          <div className="space-y-2">
            <label htmlFor="signup-confirmation" className="text-sm font-medium text-foreground">Confirmar senha</label>
            <input id="signup-confirmation" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" required className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold text-foreground" placeholder="Repita sua senha" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-brand-gold text-brand-bg font-bold py-3 px-4 rounded-lg hover:bg-brand-gold/90 transition-all disabled:opacity-50">{loading ? 'Cadastrando...' : 'Cadastrar'}</button>
           <p className="text-center text-sm text-muted-foreground pt-2">Já tem uma conta? <Link href={inviteToken ? `/login?convite=${encodeURIComponent(inviteToken)}` : '/login'} className="text-brand-gold hover:underline">Entrar</Link></p>
        </form>
      </div>
    </div>
  );
}