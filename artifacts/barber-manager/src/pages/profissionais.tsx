import { useEffect, useState } from 'react';
import { useStore, Professional } from '@/data/store';
import { api, OrganizationInvitation } from '@/data/api';
import { useAuth } from '@/auth/auth';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Plus, Trash2, Edit2, Mail, Copy, RefreshCw, Ban, CheckCircle2, Clock } from 'lucide-react';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, 
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, 
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const PRESET_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#64748b'];

export default function Profissionais() {
  const { professionals, appointments, config, addProfessional, updateProfessional, removeProfessional, isLoading } = useStore();
  const { profile } = useAuth();
  const isManager = profile?.role === 'gestor' || profile?.role === 'dev-admin';

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [form, setForm] = useState({
    name: '', role: 'barbeiro' as Professional['role'], initials: '', color: PRESET_COLORS[0], isActive: true,
    commissions: { barbearia: 0, manutencao: 0, manicure: 0, protese: 0, mentoria: 0 }
  });
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteProfessional, setInviteProfessional] = useState<Professional | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');

  const getInitials = (n: string) => n.split(' ').map(x => x[0]).join('').substring(0,2).toUpperCase();

  const loadInvitations = async () => {
    if (!isManager) return;
    try {
      setInvitations(await api.invitations.list());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os convites.');
    }
  };

  useEffect(() => {
    void loadInvitations();
  }, [isManager]);

  const handleOpenEdit = (p: Professional) => {
    setEditingId(p.id);
    setForm({
      name: p.name, role: p.role, initials: p.initials, color: p.color, isActive: p.isActive,
      commissions: { ...p.commissions }
    });
    setIsOpen(true);
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setForm({
      name: '', role: 'barbeiro', initials: '', color: PRESET_COLORS[Math.floor(Math.random()*PRESET_COLORS.length)], isActive: true,
      commissions: { barbearia: 0.5, manutencao: 0.4, manicure: 0, protese: 0, mentoria: 0 }
    });
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Nome obrigatório'); return; }
    const initials = form.initials || getInitials(form.name);
    
    if (editingId) {
      updateProfessional(editingId, { ...form, initials });
      toast.success('Profissional atualizado');
    } else {
      addProfessional({ ...form, initials });
      toast.success('Profissional adicionado');
    }
    setIsOpen(false);
  };

  const handleDelete = (id: string) => {
    const hasAppts = appointments.some(a => a.professionalId === id);
    if (hasAppts) {
      toast.error('Em uso, não é possível excluir. Apenas desative-o.');
      return;
    }
    removeProfessional(id);
    toast.success('Excluído com sucesso');
  };

  const openInvite = (professional: Professional) => {
    setInviteProfessional(professional);
    setInviteEmail('');
    setGeneratedLink('');
    setInviteOpen(true);
  };

  const invitationFor = (professionalId: string) => invitations.find(invitation =>
    invitation.professionalId === professionalId &&
    !invitation.acceptedAt &&
    !invitation.revokedAt &&
    new Date(invitation.expiresAt).getTime() > Date.now()
  );

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteProfessional || !inviteEmail.trim()) {
      toast.error('Informe o e-mail do profissional.');
      return;
    }
    setInviteLoading(true);
    try {
      const invitation = await api.invitations.create(inviteProfessional.id, inviteEmail.trim());
      const basePath = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
      const link = `${window.location.origin}${basePath}convite/${invitation.token}`;
      setGeneratedLink(link);
      setInvitations(current => [
        invitation,
        ...current.filter(item => item.professionalId !== invitation.professionalId || item.acceptedAt || item.revokedAt),
      ]);
      try {
        await navigator.clipboard.writeText(link);
        toast.success('Convite criado e link copiado.');
      } catch {
        toast.success('Convite criado. Copie o link para enviar.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o convite.');
    } finally {
      setInviteLoading(false);
    }
  };

  const revokeInvite = async (invitation: OrganizationInvitation) => {
    try {
      await api.invitations.revoke(invitation.id);
      setInvitations(current => current.map(item => item.id === invitation.id ? { ...item, revokedAt: new Date().toISOString() } : item));
      toast.success('Convite revogado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível revogar o convite.');
    }
  };

  const resendInvite = (professional: Professional, invitation: OrganizationInvitation) => {
    setInviteProfessional(professional);
    setInviteEmail(invitation.email);
    setGeneratedLink('');
    setInviteOpen(true);
  };

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Equipe</h2>
          <p className="text-sm text-muted-foreground mt-1">{professionals.length} profissionais cadastrados</p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <button onClick={handleOpenNew} className="bg-brand-gold text-brand-bg px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand-gold/90 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Adicionar Profissional
            </button>
          </DialogTrigger>
          <DialogContent className="bg-brand-surface border-brand-border text-foreground max-w-xl">
            <DialogHeader><DialogTitle>{editingId ? 'Editar Profissional' : 'Novo Profissional'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Nome *</label>
                  <input type="text" required value={form.name} onChange={e => {
                    setForm(f => ({ ...f, name: e.target.value, initials: !editingId ? getInitials(e.target.value) : f.initials }));
                  }} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:ring-1 focus:ring-brand-gold" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Cargo</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:ring-1 focus:ring-brand-gold">
                    {config.roles.filter(role => role.isActive).map(role => <option key={role.key} value={role.key}>{role.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Iniciais</label>
                  <input type="text" maxLength={3} value={form.initials} onChange={e => setForm(f => ({ ...f, initials: e.target.value.toUpperCase() }))} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:ring-1 focus:ring-brand-gold" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Cor</label>
                  <div className="flex gap-2 mt-2">
                    {PRESET_COLORS.map(c => (
                      <button key={c} type="button" aria-label={`Selecionar cor ${c}`} aria-pressed={form.color === c} onClick={() => setForm(f => ({...f, color: c}))} className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${form.color === c ? 'ring-2 ring-brand-gold ring-offset-2 ring-offset-brand-surface' : ''}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground uppercase border-b border-brand-border/50 pb-2 mb-3 block">Comissões (%)</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.entries(form.commissions).map(([key, val]) => (
                    <div key={key}>
                      <label className="text-xs text-muted-foreground capitalize">{key}</label>
                      <div className="flex items-center gap-2 mt-1">
                        <input type="number" min="0" max="100" value={Math.round(val * 100)} onChange={e => setForm(f => ({...f, commissions: {...f.commissions, [key]: Number(e.target.value)/100}}))} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-gold" />
                        <span className="text-sm font-medium">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-brand-bg border border-brand-border rounded-lg">
                <div>
                  <p className="font-bold text-sm">Status do Profissional</p>
                  <p className="text-xs text-muted-foreground">Inativar esconde da agenda, mas mantém o histórico.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({...f, isActive: e.target.checked}))} className="sr-only peer" />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-success"></div>
                </label>
              </div>

              <button type="submit" className="w-full bg-brand-gold text-brand-bg font-bold py-3 rounded-lg hover:bg-brand-gold/90 transition-all">Salvar Profissional</button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isManager && invitations.length > 0 && (
        <section className="rounded-2xl border border-brand-border bg-brand-surface p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-foreground">Convites da equipe</h3>
              <p className="mt-1 text-xs text-muted-foreground">Links expiram em até 30 dias e só funcionam para o e-mail convidado.</p>
            </div>
            <Mail className="h-5 w-5 text-brand-gold" />
          </div>
          <div className="space-y-2">
            {invitations.slice(0, 8).map(invitation => {
              const professional = professionals.find(item => item.id === invitation.professionalId);
              const accepted = Boolean(invitation.acceptedAt);
              const revoked = Boolean(invitation.revokedAt);
              const expired = !accepted && !revoked && new Date(invitation.expiresAt).getTime() <= Date.now();
              return (
                <div key={invitation.id} className="flex flex-col gap-3 rounded-xl border border-brand-border bg-brand-bg p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`rounded-lg p-2 ${accepted ? 'bg-success/10 text-success' : revoked || expired ? 'bg-muted text-muted-foreground' : 'bg-brand-gold/10 text-brand-gold'}`}>
                      {accepted ? <CheckCircle2 className="h-4 w-4" /> : revoked || expired ? <Ban className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{professional?.name || 'Profissional removido'}</p>
                      <p className="truncate text-xs text-muted-foreground">{invitation.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${accepted ? 'bg-success/10 text-success' : revoked ? 'bg-muted text-muted-foreground' : expired ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                      {accepted ? 'Aceito' : revoked ? 'Revogado' : expired ? 'Expirado' : 'Pendente'}
                    </span>
                    {!accepted && !revoked && !expired && professional && (
                      <>
                        <button type="button" onClick={() => resendInvite(professional, invitation)} className="rounded-lg border border-brand-border p-2 text-muted-foreground hover:border-brand-gold hover:text-brand-gold" aria-label={`Reenviar convite para ${professional.name}`} title="Reenviar convite">
                          <RefreshCw className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => revokeInvite(invitation)} className="rounded-lg border border-destructive/20 p-2 text-destructive hover:bg-destructive/10" aria-label={`Revogar convite de ${professional.name}`} title="Revogar convite">
                          <Ban className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{Array.from({length: 6}).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)}</div>
      ) : professionals.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-brand-surface rounded-2xl border border-brand-border">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhum profissional cadastrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {professionals.map(p => (
            <div key={p.id} className={`bg-brand-surface border rounded-2xl p-5 flex flex-col ${!p.isActive ? 'border-brand-border/50 opacity-75' : 'border-brand-border hover:border-brand-gold/30'} transition-all`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: p.color }}>
                    {p.initials}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-lg leading-tight">{p.name}</h3>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-bg border border-brand-border capitalize inline-block mt-1 text-muted-foreground">
                      {p.role}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${p.isActive ? 'bg-success shadow-[0_0_8px_var(--color-success)]' : 'bg-muted-foreground'}`} title={p.isActive ? 'Ativo' : 'Inativo'} />
                </div>
              </div>

              <div className="flex-1 bg-brand-bg rounded-xl p-3 border border-brand-border/50 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Comissões Ativas</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(p.commissions).filter(([_,v]) => v > 0).map(([k, v]) => (
                    <span key={k} className="text-[10px] bg-brand-gold/10 text-brand-gold px-2 py-1 rounded capitalize font-medium">
                      {k}: {Math.round(v*100)}%
                    </span>
                  ))}
                  {Object.values(p.commissions).every(v => v === 0) && <span className="text-xs text-muted-foreground italic">Nenhuma configurada</span>}
                </div>
              </div>

              <div className="flex justify-between mt-auto pt-4 border-t border-brand-border">
                <button onClick={() => updateProfessional(p.id, { isActive: !p.isActive })} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                  {p.isActive ? 'Desativar' : 'Reativar'}
                </button>
                 <div className="flex gap-2">
                   {isManager && !invitationFor(p.id) && (
                     <button onClick={() => openInvite(p)} aria-label={`Convidar ${p.name}`} title="Convidar para a equipe" className="p-2 text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all hover:scale-105"><Mail className="w-4 h-4" /></button>
                   )}
                  <button onClick={() => handleOpenEdit(p)} aria-label={`Editar ${p.name}`} className="p-2 text-muted-foreground hover:text-foreground hover:bg-brand-bg rounded-lg transition-all hover:scale-105"><Edit2 className="w-4 h-4" /></button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><button aria-label={`Excluir ${p.name}`} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-all hover:scale-105"><Trash2 className="w-4 h-4" /></button></AlertDialogTrigger>
                    <AlertDialogContent className="bg-brand-surface border-brand-border text-foreground">
                      <AlertDialogHeader><AlertDialogTitle>Excluir {p.name}?</AlertDialogTitle><AlertDialogDescription>Se ele já realizou atendimentos, você deve apenas desativá-lo para não perder o histórico financeiro.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border">Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Tentar Excluir</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-brand-surface border-brand-border text-foreground max-w-lg">
          <DialogHeader><DialogTitle>Convidar {inviteProfessional?.name}</DialogTitle></DialogHeader>
          {!generatedLink ? (
            <form onSubmit={createInvite} className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">O papel será definido pelo cargo cadastrado. O profissional deverá usar este e-mail ao criar ou acessar a conta.</p>
              <div>
                <label htmlFor="invite-email" className="text-xs font-semibold text-muted-foreground uppercase">E-mail do profissional</label>
                <input id="invite-email" type="email" required value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} autoComplete="email" placeholder="profissional@email.com" className="mt-1 w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-brand-gold" />
              </div>
              <button type="submit" disabled={inviteLoading} className="w-full rounded-lg bg-brand-gold py-3 font-bold text-brand-bg disabled:opacity-60">
                {inviteLoading ? 'Criando convite...' : 'Gerar link de convite'}
              </button>
            </form>
          ) : (
            <div className="space-y-4 pt-4">
              <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success">Convite pronto. Envie o link abaixo para o profissional.</div>
              <div className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-bg p-2">
                <input readOnly value={generatedLink} aria-label="Link do convite" className="min-w-0 flex-1 bg-transparent px-2 text-xs text-muted-foreground outline-none" />
                <button type="button" onClick={() => navigator.clipboard.writeText(generatedLink).then(() => toast.success('Link copiado.')).catch(() => toast.error('Não foi possível copiar o link.'))} className="rounded-lg bg-brand-gold p-2 text-brand-bg" aria-label="Copiar link do convite" title="Copiar link">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <a
                href={`mailto:${encodeURIComponent(inviteEmail)}?subject=${encodeURIComponent('Convite para o Barber Manager')}&body=${encodeURIComponent(`Olá! Você foi convidado para a equipe do Barber Manager. Acesse este link para entrar: ${generatedLink}`)}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-border py-3 text-sm font-semibold hover:border-brand-gold hover:text-brand-gold"
              >
                <Mail className="h-4 w-4" /> Abrir e-mail para enviar
              </a>
              <button type="button" onClick={() => setInviteOpen(false)} className="w-full rounded-lg border border-brand-border py-3 text-sm font-semibold hover:border-brand-gold hover:text-brand-gold">Fechar</button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}