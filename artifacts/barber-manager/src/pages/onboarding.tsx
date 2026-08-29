import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth';
import { Building2, ShieldCheck, Link as LinkIcon, LogIn } from 'lucide-react';
import { toast } from 'sonner';

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { profile, completeOnboarding, acceptInvitation } = useAuth();
  const [organizationName, setOrganizationName] = useState('');
  const [invitationToken, setInvitationToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  if (!profile) {
    setLocation('/login');
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationName.trim()) {
      toast.error('Informe o nome do estabelecimento.');
      return;
    }

    setIsSaving(true);
    try {
      await completeOnboarding(organizationName);
      toast.success('Estabelecimento criado com sucesso.');
      setLocation('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAcceptInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invitationToken.trim()) {
      toast.error('Cole o código ou link do convite.');
      return;
    }
    setIsAccepting(true);
    try {
      const token = invitationToken.includes('/convite/')
        ? invitationToken.split('/convite/').pop()?.split(/[?#]/)[0] || ''
        : invitationToken.trim();
      await acceptInvitation(decodeURIComponent(token));
      toast.success('Convite aceito. Bem-vindo à equipe!');
      setLocation('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível aceitar o convite.');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-brand-bg p-6 flex flex-col items-center justify-center">
      <div className="max-w-xl w-full space-y-8">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-brand-surface border border-brand-border text-brand-gold flex items-center justify-center">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">Configure seu estabelecimento</h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            {profile.name}, crie o espaço que será usado para sua equipe, agenda, clientes e financeiro.
          </p>
        </div>

         <form onSubmit={handleSubmit} className="rounded-2xl border border-brand-border bg-brand-surface p-6 md:p-8 space-y-6">
          <div>
            <label htmlFor="organization-name" className="block text-sm font-semibold mb-2">Nome do estabelecimento</label>
            <input
              id="organization-name"
              value={organizationName}
              onChange={event => setOrganizationName(event.target.value)}
              placeholder="Ex.: Barbearia Carvalho"
              autoComplete="organization"
              autoFocus
              className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-3 text-sm outline-none focus:ring-1 focus:ring-brand-gold"
            />
          </div>

          <div className="flex gap-3 rounded-xl border border-brand-border bg-brand-bg/60 p-4">
            <ShieldCheck className="w-5 h-5 shrink-0 text-brand-gold mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              A primeira conta se torna Gestor / Proprietário. A equipe será vinculada com permissões seguras depois do cadastro.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-brand-gold py-3 font-bold text-brand-bg hover:bg-brand-gold/90 disabled:opacity-60"
          >
            {isSaving ? 'Criando estabelecimento...' : 'Continuar'}
          </button>
        </form>

         <div className="relative flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
           <span className="h-px flex-1 bg-brand-border" />
           <span>ou</span>
           <span className="h-px flex-1 bg-brand-border" />
         </div>

         <form onSubmit={handleAcceptInvitation} className="rounded-2xl border border-brand-gold/30 bg-brand-surface p-6 md:p-8 space-y-5">
           <div className="flex items-start gap-3">
             <LinkIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold" />
             <div>
               <h2 className="font-bold text-foreground">Entrar por convite</h2>
               <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Use o link recebido do gestor. Sua conta será vinculada à empresa existente, sem criar uma nova.</p>
             </div>
           </div>
           <input
             value={invitationToken}
             onChange={event => setInvitationToken(event.target.value)}
             placeholder="Cole aqui o link do convite"
             className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-3 text-sm outline-none focus:ring-1 focus:ring-brand-gold"
           />
           <button type="submit" disabled={isAccepting} className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-gold py-3 font-bold text-brand-gold hover:bg-brand-gold/10 disabled:opacity-60">
             <LogIn className="h-4 w-4" />
             {isAccepting ? 'Validando convite...' : 'Aceitar convite'}
           </button>
         </form>
      </div>
    </div>
  );
}