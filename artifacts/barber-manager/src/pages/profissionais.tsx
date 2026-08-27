import { useState } from 'react';
import { useStore, Professional } from '@/data/store';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Plus, Trash2, Edit2, ShieldAlert } from 'lucide-react';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, 
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, 
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const PRESET_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#64748b'];

export default function Profissionais() {
  const { professionals, appointments, config, addProfessional, updateProfessional, removeProfessional, isLoading } = useStore();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [form, setForm] = useState({
    name: '', role: 'barbeiro' as Professional['role'], initials: '', color: PRESET_COLORS[0], isActive: true,
    commissions: { barbearia: 0, manutencao: 0, manicure: 0, protese: 0, mentoria: 0 }
  });

  const getInitials = (n: string) => n.split(' ').map(x => x[0]).join('').substring(0,2).toUpperCase();

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
    </div>
  );
}