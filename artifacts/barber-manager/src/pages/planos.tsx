import { useState } from 'react';
import { useStore, brl, SubscriptionPlan, Subscriber } from '@/data/store';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { CreditCard, Plus, Trash2, Edit2, Users, Check, X, MessageSquare } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogFooter, AlertDialogDescription } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function Planos() {
  const { plans, subscribers, professionals, addPlan, updatePlan, removePlan, addSubscriber, updateSubscriber, removeSubscriber, isLoading } = useStore();

  const activeSubs = subscribers.filter(s => s.status === 'ativo');
  const mrr = activeSubs.reduce((s, sub) => {
    const p = plans.find(plan => plan.id === sub.planId);
    return s + (p ? p.price : 0);
  }, 0);

  const activeProfs = professionals.filter(p => p.isActive);

  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [planEditingId, setPlanEditingId] = useState<string|null>(null);
  const [planForm, setPlanForm] = useState({ name: '', price: '', duration: 'Mensal' as any, services: [''] });

  const handlePlanOpen = (p?: SubscriptionPlan) => {
    if(p) { setPlanEditingId(p.id); setPlanForm({ name: p.name, price: p.price.toString(), duration: p.duration, services: [...p.services] }); }
    else { setPlanEditingId(null); setPlanForm({ name: '', price: '', duration: 'Mensal', services: [''] }); }
    setIsPlanOpen(true);
  };

  const handlePlanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validServices = planForm.services.filter(s => s.trim() !== '');
    if(!planForm.name || !planForm.price || validServices.length === 0) { toast.error('Preencha os campos (mín. 1 serviço)'); return; }
    if(planEditingId) { updatePlan(planEditingId, { ...planForm, price: Number(planForm.price), services: validServices }); toast.success('Plano atualizado'); }
    else { addPlan({ ...planForm, price: Number(planForm.price), services: validServices }); toast.success('Plano criado'); }
    setIsPlanOpen(false);
  };

  const handlePlanDelete = (id: string) => {
    if(subscribers.some(s => s.planId === id)) { toast.error('Em uso. Remova os assinantes primeiro.'); return; }
    removePlan(id); toast.success('Plano removido');
  };

  const [isSubOpen, setIsSubOpen] = useState(false);
  const [subEditingId, setSubEditingId] = useState<string|null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth()+1);
  const [subForm, setSubForm] = useState({ name: '', phone: '', planId: '', professionalId: '', startDate: today, nextPayment: nextMonth.toISOString().slice(0, 10), status: 'ativo' as 'ativo'|'vencido'|'pendente' });

  const handleSubOpen = (s?: Subscriber) => {
    if(s) { setSubEditingId(s.id); setSubForm({ ...s }); }
    else { setSubEditingId(null); setSubForm({ name: '', phone: '', planId: '', professionalId: '', startDate: today, nextPayment: nextMonth.toISOString().slice(0, 10), status: 'ativo' }); }
    setIsSubOpen(true);
  };

  const handleSubSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!subForm.name || !subForm.planId || !subForm.professionalId) { toast.error('Preencha os obrigatórios'); return; }
    if(subEditingId) { updateSubscriber(subEditingId, subForm); toast.success('Assinante atualizado'); }
    else { addSubscriber(subForm); toast.success('Assinante cadastrado'); }
    setIsSubOpen(false);
  };

  return (
    <div className="p-5 md:p-8 space-y-10 max-w-7xl mx-auto">
      <div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><CreditCard className="text-brand-gold"/> Planos Disponíveis</h2>
          <Dialog open={isPlanOpen} onOpenChange={setIsPlanOpen}>
            <DialogTrigger asChild><button onClick={()=>handlePlanOpen()} className="bg-brand-surface border border-brand-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-bg transition-colors flex items-center gap-2"><Plus className="w-4 h-4"/> Novo Plano</button></DialogTrigger>
            <DialogContent className="bg-brand-surface border-brand-border text-foreground">
              <DialogHeader><DialogTitle>{planEditingId?'Editar Plano':'Novo Plano'}</DialogTitle></DialogHeader>
              <form onSubmit={handlePlanSubmit} className="space-y-4 pt-4">
                <div><label className="text-xs uppercase text-muted-foreground">Nome do Plano</label><input required type="text" value={planForm.name} onChange={e=>setPlanForm({...planForm,name:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none"/></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs uppercase text-muted-foreground">Valor (R$)</label><input required type="number" step="0.01" value={planForm.price} onChange={e=>setPlanForm({...planForm,price:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none"/></div>
                  <div><label className="text-xs uppercase text-muted-foreground">Frequência</label><select value={planForm.duration} onChange={e=>setPlanForm({...planForm,duration:e.target.value as any})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none"><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select></div>
                </div>
                <div>
                  <label className="text-xs uppercase text-muted-foreground block mb-2">Serviços Inclusos</label>
                  {planForm.services.map((s,i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input value={s} onChange={e=>{const ns=[...planForm.services]; ns[i]=e.target.value; setPlanForm({...planForm,services:ns});}} className="flex-1 bg-brand-bg border border-brand-border rounded px-3 py-1 outline-none text-sm" placeholder="Ex: 4 Cortes por mês" />
                      <button type="button" aria-label="Remover serviço" onClick={()=>{const ns=planForm.services.filter((_,idx)=>idx!==i); setPlanForm({...planForm,services:ns});}} className="text-destructive p-2"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  ))}
                  <button type="button" onClick={()=>setPlanForm({...planForm,services:[...planForm.services, '']})} className="text-xs text-brand-gold font-bold flex items-center gap-1"><Plus className="w-3 h-3"/> Adicionar serviço</button>
                </div>
                <button type="submit" className="w-full bg-brand-gold text-brand-bg font-bold py-2 rounded-lg">Salvar Plano</button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-brand-surface border border-brand-border p-5 rounded-2xl"><p className="text-xs text-muted-foreground uppercase font-semibold">Total Planos</p><p className="text-3xl font-bold mt-1">{plans.length}</p></div>
          <div className="bg-brand-surface border border-brand-border p-5 rounded-2xl"><p className="text-xs text-muted-foreground uppercase font-semibold">Assinantes Ativos</p><p className="text-3xl font-bold mt-1 text-success">{activeSubs.length}</p></div>
          <div className="bg-brand-surface border border-brand-border p-5 rounded-2xl"><p className="text-xs text-muted-foreground uppercase font-semibold">MRR (Receita Recorrente)</p><p className="text-3xl font-bold mt-1 text-brand-gold">{brl(mrr)}</p></div>
        </div>

        {isLoading ? <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-48 rounded-xl"/>)}</div> :
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map(p => (
              <div key={p.id} className="bg-brand-bg border border-brand-border rounded-xl p-5 flex flex-col relative group hover:border-brand-gold/30 transition-colors">
                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button aria-label={`Editar plano ${p.name}`} onClick={()=>handlePlanOpen(p)} className="p-1.5 bg-brand-surface border border-brand-border rounded text-muted-foreground hover:text-foreground transition-all hover:scale-105"><Edit2 className="w-3 h-3"/></button>
                  <button aria-label={`Excluir plano ${p.name}`} onClick={()=>handlePlanDelete(p.id)} className="p-1.5 bg-brand-surface border border-brand-border rounded text-destructive hover:bg-destructive/10 transition-all hover:scale-105"><Trash2 className="w-3 h-3"/></button>
                </div>
                <h4 className="font-bold text-lg">{p.name}</h4>
                <p className="text-brand-gold font-bold text-2xl mt-1">{brl(p.price)}<span className="text-sm text-muted-foreground font-normal"> / {p.duration.toLowerCase()}</span></p>
                <div className="mt-4 flex-1">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {p.services.map((s,i) => <li key={i} className="flex items-start gap-2"><Check className="w-4 h-4 text-brand-gold shrink-0 mt-0.5"/> {s}</li>)}
                  </ul>
                </div>
                <div className="mt-5 pt-4 border-t border-brand-border flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Assinantes:</span>
                  <span className="font-bold text-foreground">{subscribers.filter(s=>s.planId===p.id).length}</span>
                </div>
              </div>
            ))}
          </div>
        }
      </div>

      <div className="pt-8 border-t border-brand-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Users className="text-brand-gold"/> Assinantes</h2>
          <Dialog open={isSubOpen} onOpenChange={setIsSubOpen}>
            <DialogTrigger asChild><button onClick={()=>handleSubOpen()} className="bg-brand-gold text-brand-bg px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand-gold/90 flex items-center gap-2 transition-all"><Plus className="w-4 h-4"/> Adicionar Assinante</button></DialogTrigger>
            <DialogContent className="bg-brand-surface border-brand-border text-foreground">
              <DialogHeader><DialogTitle>{subEditingId?'Editar Assinante':'Novo Assinante'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubSubmit} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs uppercase text-muted-foreground">Nome *</label><input required type="text" value={subForm.name} onChange={e=>setSubForm({...subForm,name:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none"/></div>
                  <div><label className="text-xs uppercase text-muted-foreground">WhatsApp</label><input type="text" value={subForm.phone} onChange={e=>setSubForm({...subForm,phone:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none"/></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs uppercase text-muted-foreground">Plano *</label><select required value={subForm.planId} onChange={e=>setSubForm({...subForm,planId:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none"><option value="">Selecione...</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                  <div><label className="text-xs uppercase text-muted-foreground">Profissional Responsável *</label><select required value={subForm.professionalId} onChange={e=>setSubForm({...subForm,professionalId:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none"><option value="">Selecione...</option>{activeProfs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="text-xs uppercase text-muted-foreground">Início</label><input type="date" required value={subForm.startDate} onChange={e=>setSubForm({...subForm,startDate:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none text-xs"/></div>
                  <div><label className="text-xs uppercase text-muted-foreground">Próx. Venc.</label><input type="date" required value={subForm.nextPayment} onChange={e=>setSubForm({...subForm,nextPayment:e.target.value})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none text-xs"/></div>
                  <div><label className="text-xs uppercase text-muted-foreground">Status</label><select value={subForm.status} onChange={e=>setSubForm({...subForm,status:e.target.value as any})} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none text-xs"><option value="ativo">Ativo</option><option value="pendente">Pendente</option><option value="vencido">Vencido</option></select></div>
                </div>
                <button type="submit" className="w-full bg-brand-gold text-brand-bg font-bold py-2 rounded-lg">Salvar Assinante</button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
          {isLoading ? <div className="space-y-3">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-12"/>)}</div> : subscribers.length === 0 ? <p className="text-center py-10 text-muted-foreground">Nenhum assinante</p> : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead><tr className="border-b border-brand-border text-muted-foreground"><th className="pb-3">Nome</th><th className="pb-3">Plano</th><th className="pb-3">Profissional</th><th className="pb-3">Próx. Venc.</th><th className="pb-3 text-center">Status</th><th className="pb-3 text-right">Ações</th></tr></thead>
                  <tbody>
                    {subscribers.map(s => {
                      const pl = plans.find(x=>x.id===s.planId);
                      const pr = professionals.find(x=>x.id===s.professionalId);
                      return (
                        <tr key={s.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                          <td className="py-3 font-medium">{s.name}<br/><span className="text-xs text-muted-foreground font-normal">{s.phone}</span></td>
                          <td className="py-3 font-medium text-brand-gold">{pl?.name || '-'}</td>
                          <td className="py-3">{pr?.name || '-'}</td>
                          <td className="py-3">{s.nextPayment.split('-').reverse().join('/')}</td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${s.status==='ativo'?'bg-success/10 text-success':s.status==='vencido'?'bg-destructive/10 text-destructive':'bg-warning/10 text-warning'}`}>{s.status}</span>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex justify-end gap-1">
                              {s.phone && <button aria-label={`Enviar WhatsApp para ${s.name}`} onClick={()=>window.open(`https://wa.me/55${s.phone.replace(/\D/g,'')}?text=Olá ${s.name}, sua mensalidade do plano ${pl?.name} vence dia ${s.nextPayment.split('-').reverse().join('/')}.`, '_blank')} className="p-1.5 text-[#25D366] hover:bg-[#25D366]/10 rounded transition-all hover:scale-105"><MessageSquare className="w-4 h-4"/></button>}
                              <button aria-label={`Editar assinante ${s.name}`} onClick={()=>handleSubOpen(s)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-brand-bg rounded transition-all hover:scale-105"><Edit2 className="w-4 h-4"/></button>
                              <AlertDialog><AlertDialogTrigger asChild><button aria-label={`Excluir assinante ${s.name}`} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-all hover:scale-105"><Trash2 className="w-4 h-4"/></button></AlertDialogTrigger><AlertDialogContent className="bg-brand-surface border-brand-border text-foreground"><AlertDialogHeader><AlertDialogTitle>Excluir Assinante?</AlertDialogTitle><AlertDialogDescription>Excluir?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border text-foreground">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={()=>{removeSubscriber(s.id);toast.success('Excluído');}}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {subscribers.map(s => {
                  const pl = plans.find(x=>x.id===s.planId);
                  const pr = professionals.find(x=>x.id===s.professionalId);
                  return (
                    <div key={s.id} className="p-4 bg-brand-bg border border-brand-border rounded-xl">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-sm">{s.name}</p>
                          <p className="text-xs text-brand-gold font-medium">{pl?.name || '-'}</p>
                          <p className="text-xs text-muted-foreground">{pr?.name || '-'}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${s.status==='ativo'?'bg-success/10 text-success':s.status==='vencido'?'bg-destructive/10 text-destructive':'bg-warning/10 text-warning'}`}>{s.status}</span>
                          <span className="text-xs text-muted-foreground">Vence: {s.nextPayment.split('-').reverse().join('/')}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 pt-2 border-t border-brand-border/50 justify-end">
                        {s.phone && <button aria-label={`Enviar WhatsApp para ${s.name}`} onClick={()=>window.open(`https://wa.me/55${s.phone.replace(/\D/g,'')}?text=Olá ${s.name}`, '_blank')} className="p-1.5 text-[#25D366] hover:bg-[#25D366]/10 rounded transition-all hover:scale-105"><MessageSquare className="w-4 h-4"/></button>}
                        <button aria-label={`Editar assinante ${s.name}`} onClick={()=>handleSubOpen(s)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-brand-surface rounded transition-all hover:scale-105"><Edit2 className="w-4 h-4"/></button>
                        <AlertDialog><AlertDialogTrigger asChild><button aria-label={`Excluir assinante ${s.name}`} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-all hover:scale-105"><Trash2 className="w-4 h-4"/></button></AlertDialogTrigger><AlertDialogContent className="bg-brand-surface border-brand-border text-foreground"><AlertDialogHeader><AlertDialogTitle>Excluir Assinante?</AlertDialogTitle><AlertDialogDescription>Excluir?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border text-foreground">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={()=>{removeSubscriber(s.id);toast.success('Excluído');}}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
