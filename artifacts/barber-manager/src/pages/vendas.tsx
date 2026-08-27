import { useState } from 'react';
import { useStore, brl, PayMethod, PAY_LABELS } from '@/data/store';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, AlertTriangle, MessageSquare, Edit2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogFooter, AlertDialogDescription } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function Vendas() {
  const { professionals, prothesisSales, mentoriaSessions, addProthesisSale, updateProthesisSale, removeProthesisSale, addMentoriaSession, updateMentoriaSession, removeMentoriaSession, isLoading } = useStore();

  const [activeTab, setActiveTab] = useState<'Prótese' | 'Mentoria'>('Prótese');
  const today = new Date().toISOString().slice(0, 10);
  const sellers = professionals.filter(p => p.role === 'vendedor' && p.isActive);

  // --- Prótese ---
  const [pForm, setPForm] = useState({ date: today, client: '', whatsapp: '', value: '', sellerId: '', installments: 1, payMethod1: 'pix' as PayMethod, notes: '' });
  
  const prothesisRev = prothesisSales.reduce((s,p) => s + p.value, 0);
  const prothesisPending = prothesisSales.reduce((s,p) => {
    const valPerInst = p.value / p.installments;
    return s + (valPerInst * (p.installments - p.installmentsPaid));
  }, 0);

  const maintenanceAlerts = prothesisSales.map(p => {
    const lastM = p.lastMaintenance ? new Date(p.lastMaintenance) : new Date(p.date);
    const daysSince = Math.floor((new Date().getTime() - lastM.getTime()) / (1000 * 60 * 60 * 24));
    return { ...p, daysSince };
  }).filter(p => p.daysSince >= 10).sort((a,b) => b.daysSince - a.daysSince);

  const handleProthesisSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pForm.client || !pForm.value || !pForm.sellerId) { toast.error('Preencha os obrigatórios'); return; }
    addProthesisSale({
      date: pForm.date, client: pForm.client, whatsapp: pForm.whatsapp, value: Number(pForm.value),
      sellerId: pForm.sellerId, installments: Number(pForm.installments), installmentsPaid: 1,
      payMethod1: pForm.payMethod1, payAmount1: Number(pForm.value) / Number(pForm.installments), notes: pForm.notes,
      lastMaintenance: pForm.date
    });
    toast.success('Venda de prótese registrada');
    setPForm({ ...pForm, client: '', whatsapp: '', value: '', notes: '' });
  };

  // Edit prótese
  const [isEditPOpen, setIsEditPOpen] = useState(false);
  const [editPSale, setEditPSale] = useState<typeof prothesisSales[0] | null>(null);
  const [pEditForm, setPEditForm] = useState({ date: today, client: '', whatsapp: '', value: '', sellerId: '', installments: 1, payMethod1: 'pix' as PayMethod, notes: '' });

  const openEditP = (p: typeof prothesisSales[0]) => {
    setEditPSale(p);
    setPEditForm({ date: p.date, client: p.client, whatsapp: p.whatsapp || '', value: p.value.toString(), sellerId: p.sellerId, installments: p.installments, payMethod1: p.payMethod1, notes: p.notes || '' });
    setIsEditPOpen(true);
  };

  const handleEditP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPSale || !pEditForm.client || !pEditForm.value) { toast.error('Preencha os obrigatórios'); return; }
    updateProthesisSale(editPSale.id, {
      date: pEditForm.date, client: pEditForm.client, whatsapp: pEditForm.whatsapp,
      value: Number(pEditForm.value), sellerId: pEditForm.sellerId,
      installments: Number(pEditForm.installments), payMethod1: pEditForm.payMethod1,
      payAmount1: Number(pEditForm.value) / Number(pEditForm.installments), notes: pEditForm.notes,
    });
    toast.success('Venda atualizada');
    setIsEditPOpen(false);
  };

  // --- Mentoria ---
  const [mForm, setMForm] = useState({ date: today, client: '', sellerId: '', value: '', durationHours: 2, status: 'scheduled' as 'scheduled'|'completed', notes: '' });
  
  const mentoriaRev = mentoriaSessions.filter(m => m.status === 'completed').reduce((s,m) => s + m.value, 0);
  const mentoriaSched = mentoriaSessions.filter(m => m.status === 'scheduled').length;

  const handleMentoriaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mForm.client || !mForm.value || !mForm.sellerId) { toast.error('Preencha os obrigatórios'); return; }
    addMentoriaSession({
      date: mForm.date, client: mForm.client, sellerId: mForm.sellerId, value: Number(mForm.value),
      durationHours: Number(mForm.durationHours), status: mForm.status as any, notes: mForm.notes
    });
    toast.success('Sessão registrada');
    setMForm({ ...mForm, client: '', value: '', notes: '' });
  };

  // Edit mentoria
  const [isEditMOpen, setIsEditMOpen] = useState(false);
  const [editMSession, setEditMSession] = useState<typeof mentoriaSessions[0] | null>(null);
  const [mEditForm, setMEditForm] = useState({ date: today, client: '', sellerId: '', value: '', durationHours: 2, notes: '' });

  const openEditM = (m: typeof mentoriaSessions[0]) => {
    setEditMSession(m);
    setMEditForm({ date: m.date, client: m.client, sellerId: m.sellerId, value: m.value.toString(), durationHours: m.durationHours, notes: m.notes || '' });
    setIsEditMOpen(true);
  };

  const handleEditM = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMSession || !mEditForm.client || !mEditForm.value) { toast.error('Preencha os obrigatórios'); return; }
    updateMentoriaSession(editMSession.id, {
      date: mEditForm.date, client: mEditForm.client, sellerId: mEditForm.sellerId,
      value: Number(mEditForm.value), durationHours: Number(mEditForm.durationHours), notes: mEditForm.notes,
    });
    toast.success('Sessão atualizada');
    setIsEditMOpen(false);
  };

  const getSellerComm = (id: string, type: 'protese'|'mentoria', val: number) => {
    const prof = professionals.find(p => p.id === id);
    if (!prof) return 0;
    return val * (prof.commissions[type] || 0);
  };

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-foreground">Vendas & Mentoria</h2>
      </div>

      <div className="flex border-b border-brand-border">
        {['Prótese', 'Mentoria'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-6 py-3 font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-brand-gold text-brand-gold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-32 w-full"/>)}</div>
      ) : activeTab === 'Prótese' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-brand-surface border border-brand-border p-4 rounded-xl"><p className="text-xs text-muted-foreground uppercase">Receita Total</p><p className="text-xl font-bold mt-1 text-brand-gold">{brl(prothesisRev)}</p></div>
            <div className="bg-brand-surface border border-brand-border p-4 rounded-xl"><p className="text-xs text-muted-foreground uppercase">A Receber</p><p className="text-xl font-bold mt-1">{brl(prothesisPending)}</p></div>
            <div className="bg-brand-surface border border-warning/30 p-4 rounded-xl"><p className="text-xs text-warning uppercase">Manutenções Próximas</p><p className="text-xl font-bold mt-1 text-warning">{maintenanceAlerts.filter(a => a.daysSince >= 10 && a.daysSince < 20).length}</p></div>
            <div className="bg-brand-surface border border-destructive/30 p-4 rounded-xl"><p className="text-xs text-destructive uppercase">Manutenções Vencidas</p><p className="text-xl font-bold mt-1 text-destructive">{maintenanceAlerts.filter(a => a.daysSince >= 20).length}</p></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-brand-surface border border-brand-border rounded-2xl p-6">
              <h3 className="text-lg font-bold text-foreground mb-4">Registrar Venda de Prótese</h3>
              <form onSubmit={handleProthesisSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs text-muted-foreground uppercase">Data</label><input type="date" required value={pForm.date} onChange={e=>setPForm({...pForm,date:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
                  <div><label className="text-xs text-muted-foreground uppercase">Vendedor</label><select required value={pForm.sellerId} onChange={e=>setPForm({...pForm,sellerId:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"><option value="">Selecione...</option>{sellers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs text-muted-foreground uppercase">Cliente</label><input type="text" required value={pForm.client} onChange={e=>setPForm({...pForm,client:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
                  <div><label className="text-xs text-muted-foreground uppercase">WhatsApp</label><input type="text" value={pForm.whatsapp} onChange={e=>setPForm({...pForm,whatsapp:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
                </div>
                <div className="grid grid-cols-3 gap-4 items-start">
                  <div><label className="text-xs text-muted-foreground uppercase">Valor Total</label><input type="number" required value={pForm.value} onChange={e=>setPForm({...pForm,value:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
                  <div><label className="text-xs text-muted-foreground uppercase">Parcelas</label><input type="number" min="1" max="12" required value={pForm.installments} onChange={e=>setPForm({...pForm,installments:Number(e.target.value)})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
                  <div><label className="text-xs text-muted-foreground uppercase">Mét. Pag.</label><select value={pForm.payMethod1} onChange={e=>setPForm({...pForm,payMethod1:e.target.value as any})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold">{Object.entries(PAY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
                </div>
                {pForm.sellerId && pForm.value && (
                  <div className="p-3 bg-brand-gold/10 text-brand-gold rounded border border-brand-gold/20 text-sm font-medium">
                    Comissão Projetada: {brl(getSellerComm(pForm.sellerId, 'protese', Number(pForm.value)))}
                  </div>
                )}
                <div><label className="text-xs text-muted-foreground uppercase">Observações</label><input type="text" value={pForm.notes} onChange={e=>setPForm({...pForm,notes:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
                <button type="submit" className="w-full bg-brand-gold text-brand-bg py-2 rounded-lg font-bold">Registrar Venda</button>
              </form>
            </div>

            <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 flex flex-col h-[400px]">
              <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-warning"/> Alertas Manutenção</h3>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {maintenanceAlerts.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Nenhum alerta.</p> :
                  maintenanceAlerts.map(a => {
                    const isOver = a.daysSince >= 20;
                    return (
                      <div key={a.id} className={`p-3 rounded-lg border ${isOver ? 'bg-destructive/10 border-destructive/20' : 'bg-warning/10 border-warning/20'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className={`font-bold text-sm ${isOver ? 'text-destructive-foreground' : 'text-foreground'}`}>{a.client}</p>
                            <p className="text-xs opacity-70">Última: {a.lastMaintenance?.split('-').reverse().join('/')}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isOver ? 'bg-destructive text-white' : 'bg-warning text-black'}`}>{a.daysSince} dias</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-black/10 dark:border-white/10">
                          <button onClick={()=>{updateProthesisSale(a.id, {lastMaintenance: today}); toast.success('Atualizado');}} className="text-xs font-medium px-2 py-1 rounded bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10">Renovar Hoje</button>
                          {a.whatsapp && <button aria-label={`Avisar ${a.client} pelo WhatsApp`} onClick={()=>{const wa=a.whatsapp!; window.open(`https://wa.me/55${wa.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá ${a.client}, já faz ${a.daysSince} dias desde sua última manutenção de prótese. Vamos agendar?`)}`, '_blank');}} className="text-xs font-medium px-2 py-1 rounded bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 ml-auto flex items-center gap-1"><MessageSquare className="w-3 h-3"/> Avisar</button>}
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </div>
          </div>

          {/* Histórico de Vendas */}
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
            <h3 className="text-lg font-bold text-foreground mb-4">Histórico de Vendas (Prótese)</h3>
            {prothesisSales.length === 0 ? <p className="text-muted-foreground text-center py-8">Nenhuma venda registrada.</p> : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead><tr className="border-b border-brand-border text-muted-foreground"><th className="pb-3">Data</th><th className="pb-3">Cliente</th><th className="pb-3">Vendedor</th><th className="pb-3 text-right">Valor</th><th className="pb-3 text-center">Parcelas</th><th className="pb-3 text-right">Ações</th></tr></thead>
                    <tbody>
                      {prothesisSales.map(p => (
                        <tr key={p.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                          <td className="py-3">{p.date.split('-').reverse().join('/')}</td>
                          <td className="py-3 font-medium">{p.client}</td>
                          <td className="py-3 text-muted-foreground">{professionals.find(x=>x.id===p.sellerId)?.name}</td>
                          <td className="py-3 text-right font-medium text-brand-gold">{brl(p.value)}</td>
                          <td className="py-3 text-center">
                            <span className={`text-xs px-2 py-1 rounded ${p.installmentsPaid === p.installments ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                              {p.installmentsPaid}/{p.installments}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex justify-end gap-2 items-center">
                              {p.installmentsPaid < p.installments && <button onClick={()=>{updateProthesisSale(p.id,{installmentsPaid: p.installmentsPaid+1}); toast.success('Parcela paga');}} className="text-xs bg-success text-white px-2 py-1 rounded hover:bg-success/80 transition-colors">Pagar Parc.</button>}
                              <button aria-label={`Editar venda de ${p.client}`} onClick={()=>openEditP(p)} className="p-1.5 text-brand-gold hover:bg-brand-gold/10 rounded transition-all hover:scale-105"><Edit2 className="w-4 h-4"/></button>
                              <AlertDialog><AlertDialogTrigger asChild><button aria-label={`Excluir venda de ${p.client}`} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-all hover:scale-105"><Trash2 className="w-4 h-4"/></button></AlertDialogTrigger><AlertDialogContent className="bg-brand-surface border-brand-border text-foreground"><AlertDialogHeader><AlertDialogTitle>Excluir Venda?</AlertDialogTitle><AlertDialogDescription>Deseja remover?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border text-foreground">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={()=>{removeProthesisSale(p.id);toast.success('Excluído');}}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {prothesisSales.map(p => (
                    <div key={p.id} className="p-4 bg-brand-bg border border-brand-border rounded-xl">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-sm">{p.client}</p>
                          <p className="text-xs text-muted-foreground">{professionals.find(x=>x.id===p.sellerId)?.name} • {p.date.split('-').reverse().join('/')}</p>
                        </div>
                        <p className="font-bold text-brand-gold">{brl(p.value)}</p>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-brand-border/50">
                        <span className={`text-xs px-2 py-0.5 rounded ${p.installmentsPaid === p.installments ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{p.installmentsPaid}/{p.installments} parcelas</span>
                        <div className="flex gap-1">
                          {p.installmentsPaid < p.installments && <button onClick={()=>{updateProthesisSale(p.id,{installmentsPaid: p.installmentsPaid+1}); toast.success('Parcela paga');}} className="text-xs bg-success text-white px-2 py-1 rounded">Pagar</button>}
                          <button aria-label={`Editar venda de ${p.client}`} onClick={()=>openEditP(p)} className="p-1.5 text-brand-gold hover:bg-brand-gold/10 rounded transition-all hover:scale-105"><Edit2 className="w-4 h-4"/></button>
                          <AlertDialog><AlertDialogTrigger asChild><button aria-label={`Excluir venda de ${p.client}`} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-all hover:scale-105"><Trash2 className="w-4 h-4"/></button></AlertDialogTrigger><AlertDialogContent className="bg-brand-surface border-brand-border text-foreground"><AlertDialogHeader><AlertDialogTitle>Excluir Venda?</AlertDialogTitle><AlertDialogDescription>Deseja remover?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border text-foreground">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={()=>{removeProthesisSale(p.id);toast.success('Excluído');}}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-brand-surface border border-brand-border p-4 rounded-xl"><p className="text-xs text-muted-foreground uppercase">Receita (Concluídas)</p><p className="text-2xl font-bold mt-1 text-brand-gold">{brl(mentoriaRev)}</p></div>
            <div className="bg-brand-surface border border-brand-border p-4 rounded-xl"><p className="text-xs text-muted-foreground uppercase">Sessões Agendadas</p><p className="text-2xl font-bold mt-1">{mentoriaSched}</p></div>
          </div>

          <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 max-w-3xl">
            <h3 className="text-lg font-bold text-foreground mb-4">Agendar Mentoria</h3>
            <form onSubmit={handleMentoriaSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-muted-foreground uppercase">Data</label><input type="date" required value={mForm.date} onChange={e=>setMForm({...mForm,date:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
                <div><label className="text-xs text-muted-foreground uppercase">Mentor (Vendedor)</label><select required value={mForm.sellerId} onChange={e=>setMForm({...mForm,sellerId:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"><option value="">Selecione...</option>{sellers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <div><label className="text-xs text-muted-foreground uppercase">Cliente / Aluno</label><input type="text" required value={mForm.client} onChange={e=>setMForm({...mForm,client:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="text-xs text-muted-foreground uppercase">Valor</label><input type="number" required value={mForm.value} onChange={e=>setMForm({...mForm,value:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
                <div><label className="text-xs text-muted-foreground uppercase">Duração (Horas)</label><input type="number" min="1" required value={mForm.durationHours} onChange={e=>setMForm({...mForm,durationHours:Number(e.target.value)})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
                <div><label className="text-xs text-muted-foreground uppercase">Status</label><select value={mForm.status} onChange={e=>setMForm({...mForm,status:e.target.value as any})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"><option value="scheduled">Agendada</option><option value="completed">Concluída</option></select></div>
              </div>
              <button type="submit" className="w-full bg-brand-gold text-brand-bg py-2 rounded-lg font-bold">Agendar Mentoria</button>
            </form>
          </div>

          {/* Sessões */}
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
            <h3 className="text-lg font-bold text-foreground mb-4">Sessões</h3>
            {mentoriaSessions.length === 0 ? <p className="text-muted-foreground text-center py-8">Nenhuma sessão registrada.</p> : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead><tr className="border-b border-brand-border text-muted-foreground"><th className="pb-3">Data</th><th className="pb-3">Aluno</th><th className="pb-3">Mentor</th><th className="pb-3">Duração</th><th className="pb-3 text-right">Valor</th><th className="pb-3 text-center">Status</th><th className="pb-3 text-right">Ações</th></tr></thead>
                    <tbody>
                      {mentoriaSessions.map(m => (
                        <tr key={m.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                          <td className="py-3">{m.date.split('-').reverse().join('/')}</td>
                          <td className="py-3 font-medium">{m.client}</td>
                          <td className="py-3 text-muted-foreground">{professionals.find(x=>x.id===m.sellerId)?.name}</td>
                          <td className="py-3">{m.durationHours}h</td>
                          <td className="py-3 text-right font-medium text-brand-gold">{brl(m.value)}</td>
                          <td className="py-3 text-center">
                            <select value={m.status} onChange={e=>{updateMentoriaSession(m.id, {status: e.target.value as any}); toast.success('Status alterado');}} className={`text-xs font-bold px-2 py-1 rounded outline-none cursor-pointer ${m.status==='completed'?'bg-success/10 text-success': m.status==='cancelled'?'bg-destructive/10 text-destructive':'bg-warning/10 text-warning'}`}>
                              <option value="scheduled">Agendada</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option>
                            </select>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex justify-end gap-1 items-center">
                              <button aria-label={`Editar sessão de ${m.client}`} onClick={()=>openEditM(m)} className="p-1.5 text-brand-gold hover:bg-brand-gold/10 rounded transition-all hover:scale-105"><Edit2 className="w-4 h-4"/></button>
                              <AlertDialog><AlertDialogTrigger asChild><button aria-label={`Excluir sessão de ${m.client}`} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-all hover:scale-105"><Trash2 className="w-4 h-4"/></button></AlertDialogTrigger><AlertDialogContent className="bg-brand-surface border-brand-border text-foreground"><AlertDialogHeader><AlertDialogTitle>Excluir Sessão?</AlertDialogTitle><AlertDialogDescription>Deseja remover?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border text-foreground">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={()=>{removeMentoriaSession(m.id);toast.success('Excluído');}}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {mentoriaSessions.map(m => (
                    <div key={m.id} className="p-4 bg-brand-bg border border-brand-border rounded-xl">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-sm">{m.client}</p>
                          <p className="text-xs text-muted-foreground">{professionals.find(x=>x.id===m.sellerId)?.name} • {m.date.split('-').reverse().join('/')} • {m.durationHours}h</p>
                        </div>
                        <p className="font-bold text-brand-gold">{brl(m.value)}</p>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-brand-border/50">
                        <select value={m.status} onChange={e=>{updateMentoriaSession(m.id, {status: e.target.value as any}); toast.success('Status alterado');}} className={`text-xs font-bold px-2 py-0.5 rounded outline-none cursor-pointer ${m.status==='completed'?'bg-success/10 text-success': m.status==='cancelled'?'bg-destructive/10 text-destructive':'bg-warning/10 text-warning'}`}>
                          <option value="scheduled">Agendada</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option>
                        </select>
                        <div className="flex gap-1">
                          <button aria-label={`Editar sessão de ${m.client}`} onClick={()=>openEditM(m)} className="p-1.5 text-brand-gold hover:bg-brand-gold/10 rounded transition-all hover:scale-105"><Edit2 className="w-4 h-4"/></button>
                          <AlertDialog><AlertDialogTrigger asChild><button aria-label={`Excluir sessão de ${m.client}`} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-all hover:scale-105"><Trash2 className="w-4 h-4"/></button></AlertDialogTrigger><AlertDialogContent className="bg-brand-surface border-brand-border text-foreground"><AlertDialogHeader><AlertDialogTitle>Excluir Sessão?</AlertDialogTitle><AlertDialogDescription>Deseja remover?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border text-foreground">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={()=>{removeMentoriaSession(m.id);toast.success('Excluído');}}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Prótese Dialog */}
      <Dialog open={isEditPOpen} onOpenChange={setIsEditPOpen}>
        <DialogContent className="bg-brand-surface border-brand-border text-foreground">
          <DialogHeader><DialogTitle>Editar Venda de Prótese</DialogTitle></DialogHeader>
          <form onSubmit={handleEditP} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs text-muted-foreground uppercase">Data</label><input type="date" required value={pEditForm.date} onChange={e=>setPEditForm({...pEditForm,date:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
              <div><label className="text-xs text-muted-foreground uppercase">Vendedor</label><select required value={pEditForm.sellerId} onChange={e=>setPEditForm({...pEditForm,sellerId:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"><option value="">Selecione...</option>{sellers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs text-muted-foreground uppercase">Cliente</label><input type="text" required value={pEditForm.client} onChange={e=>setPEditForm({...pEditForm,client:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
              <div><label className="text-xs text-muted-foreground uppercase">WhatsApp</label><input type="text" value={pEditForm.whatsapp} onChange={e=>setPEditForm({...pEditForm,whatsapp:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="text-xs text-muted-foreground uppercase">Valor Total</label><input type="number" required value={pEditForm.value} onChange={e=>setPEditForm({...pEditForm,value:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
              <div><label className="text-xs text-muted-foreground uppercase">Parcelas</label><input type="number" min="1" max="12" required value={pEditForm.installments} onChange={e=>setPEditForm({...pEditForm,installments:Number(e.target.value)})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
              <div><label className="text-xs text-muted-foreground uppercase">Mét. Pag.</label><select value={pEditForm.payMethod1} onChange={e=>setPEditForm({...pEditForm,payMethod1:e.target.value as any})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold">{Object.entries(PAY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <button type="submit" className="w-full bg-brand-gold text-brand-bg font-bold py-2 rounded-lg">Salvar Alterações</button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Mentoria Dialog */}
      <Dialog open={isEditMOpen} onOpenChange={setIsEditMOpen}>
        <DialogContent className="bg-brand-surface border-brand-border text-foreground">
          <DialogHeader><DialogTitle>Editar Sessão de Mentoria</DialogTitle></DialogHeader>
          <form onSubmit={handleEditM} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs text-muted-foreground uppercase">Data</label><input type="date" required value={mEditForm.date} onChange={e=>setMEditForm({...mEditForm,date:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
              <div><label className="text-xs text-muted-foreground uppercase">Mentor</label><select required value={mEditForm.sellerId} onChange={e=>setMEditForm({...mEditForm,sellerId:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"><option value="">Selecione...</option>{sellers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            </div>
            <div><label className="text-xs text-muted-foreground uppercase">Cliente / Aluno</label><input type="text" required value={mEditForm.client} onChange={e=>setMEditForm({...mEditForm,client:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs text-muted-foreground uppercase">Valor</label><input type="number" required value={mEditForm.value} onChange={e=>setMEditForm({...mEditForm,value:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
              <div><label className="text-xs text-muted-foreground uppercase">Duração (Horas)</label><input type="number" min="1" required value={mEditForm.durationHours} onChange={e=>setMEditForm({...mEditForm,durationHours:Number(e.target.value)})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none focus:ring-1 focus:ring-brand-gold"/></div>
            </div>
            <button type="submit" className="w-full bg-brand-gold text-brand-bg font-bold py-2 rounded-lg">Salvar Alterações</button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
