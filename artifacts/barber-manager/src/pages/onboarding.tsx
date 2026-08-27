import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth';
import { useStore } from '@/data/store';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, Role } from '@/auth/types';
import { Briefcase, User, Scissors, Package, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const ROLE_ICONS: Record<Role, React.ElementType> = {
  gestor: Briefcase,
  'dev-admin': ShieldCheck,
  barbeiro: Scissors,
  manicure: User,
  vendedor: Package,
};

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { profile, setRole, setProfessional } = useAuth();
  const { professionals } = useStore();
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [professionalId, setProfessionalId] = useState('');

  if (!profile) {
    setLocation('/login');
    return null;
  }

  const handleSelectRole = (role: Role) => {
    if (role !== 'gestor' && role !== 'dev-admin') {
      setPendingRole(role);
      setProfessionalId('');
      return;
    }
    setRole(role);
    toast.success(`Perfil definido como ${ROLE_LABELS[role]}`);
    setLocation('/');
  };

  const handleConfirmProfessional = () => {
    if (!pendingRole || !professionalId) {
      toast.error('Selecione o profissional vinculado a este perfil');
      return;
    }
    setRole(pendingRole);
    setProfessional(professionalId);
    toast.success(`Perfil definido como ${ROLE_LABELS[pendingRole]}`);
    setLocation('/');
  };

  return (
    <div className="min-h-[100dvh] bg-brand-bg p-6 flex flex-col items-center justify-center">
      <div className="max-w-4xl w-full space-y-10">
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">Bem-vindo(a), {profile.name}</h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">Para começarmos, selecione a sua função principal. Isso personalizará o seu acesso e ferramentas disponíveis.</p>
        </div>

        {pendingRole ? (
          <div className="max-w-xl mx-auto w-full rounded-2xl border border-brand-border bg-brand-surface p-6 space-y-5">
            <div>
              <h3 className="text-xl font-bold">Vincule seu profissional</h3>
              <p className="mt-2 text-sm text-muted-foreground">Seu dashboard e sua agenda mostrarão apenas os atendimentos deste perfil.</p>
            </div>
            <select value={professionalId} onChange={e => setProfessionalId(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-3 text-sm outline-none focus:ring-1 focus:ring-brand-gold">
              <option value="">Selecione...</option>
              {professionals.filter(p => p.isActive && p.role === pendingRole).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex gap-3">
              <button type="button" onClick={() => setPendingRole(null)} className="flex-1 rounded-lg border border-brand-border py-3 font-semibold">Voltar</button>
              <button type="button" onClick={handleConfirmProfessional} className="flex-1 rounded-lg bg-brand-gold py-3 font-bold text-brand-bg">Continuar</button>
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => {
            const Icon = ROLE_ICONS[role];
            return (
              <button
                key={role}
                onClick={() => handleSelectRole(role)}
                className="flex flex-col items-start p-6 rounded-2xl border border-brand-border bg-brand-surface hover:border-brand-gold/50 hover:bg-brand-surface/80 transition-all group text-left h-full shadow-sm hover:shadow-[0_0_20px_rgba(201,168,76,0.1)] hover:-translate-y-1"
              >
                <div className="p-4 rounded-xl bg-brand-bg border border-brand-border text-brand-gold group-hover:bg-brand-gold/10 group-hover:border-brand-gold/30 mb-5 transition-all">
                  <Icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-brand-gold transition-colors">
                  {ROLE_LABELS[role]}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </button>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
