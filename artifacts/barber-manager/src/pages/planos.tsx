import { useMemo, useState } from 'react';
import { useStore, brl, SubscriptionPaymentStatus, SubscriptionPlan, Subscriber, PayMethod, PAY_LABELS } from '@/data/store';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogFooter, AlertDialogDescription } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CalendarClock, Check, Clock3, CreditCard, Edit2, History, MessageSquare, Plus, Receipt, Trash2, Users } from 'lucide-react';
import { addSubscriptionCycle, differenceInCalendarDays, formatDateKey, parseDateKey } from '@/data/date';

const paymentMethods: PayMethod[] = ['dinheiro', 'pix', 'debito', 'credito'];
const paymentStatusLabels: Record<SubscriptionPaymentStatus, string> = {
  pago: 'Paga',
  pendente: 'Pendente',
  vencido: 'Vencida',
};

function displayDate(value: string) {
  return value ? value.split('-').reverse().join('/') : '—';
}

function statusClasses(status: SubscriptionPaymentStatus) {
  return status === 'pago'
    ? 'bg-success/10 text-success'
    : status === 'vencido'
      ? 'bg-destructive/10 text-destructive'
      : 'bg-warning/10 text-warning';
}

function subscriberStatus(subscriber: Subscriber, today: string): SubscriptionPaymentStatus {
  if (subscriber.status === 'vencido' || subscriber.nextPayment < today) return 'vencido';
  if (subscriber.status === 'pendente') return 'pendente';
  return 'pago';
}

type NoticePeriod = '7' | '30' | 'month' | 'all';

function isSubscriberOverdue(subscriber: Subscriber, today: string) {
  return subscriber.status === 'vencido' || subscriber.nextPayment < today;
}

function noticeDueLabel(subscriber: Subscriber, today: string) {
  if (isSubscriberOverdue(subscriber, today)) {
    const daysOverdue = Math.max(1, differenceInCalendarDays(subscriber.nextPayment, today));
    return `Atrasada há ${daysOverdue} ${daysOverdue === 1 ? 'dia' : 'dias'}`;
  }
  const daysUntilDue = differenceInCalendarDays(today, subscriber.nextPayment);
  if (daysUntilDue === 0) return 'Vence hoje';
  return `Vence em ${daysUntilDue} ${daysUntilDue === 1 ? 'dia' : 'dias'}`;
}

function openSubscriberWhatsapp(subscriber: Subscriber, planName?: string) {
  const digits = subscriber.phone.replace(/\D/g, '');
  if (!digits) return;
  const phone = digits.startsWith('55') ? digits : `55${digits}`;
  const message = `Olá ${subscriber.name}, sua mensalidade${planName ? ` do plano ${planName}` : ''} vence dia ${displayDate(subscriber.nextPayment)}.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

export default function Planos() {
  const {
    plans, subscribers, subscriptionPayments, professionals,
    addPlan, updatePlan, removePlan, addSubscriber, updateSubscriber, removeSubscriber,
    setSubscriptionPaymentStatus, isLoading,
  } = useStore();
  const today = formatDateKey();
  const activeSubs = subscribers.filter(s => subscriberStatus(s, today) === 'pago');
  const mrr = activeSubs.reduce((total, sub) => total + (plans.find(plan => plan.id === sub.planId)?.price ?? 0), 0);
  const activeProfs = professionals.filter(p => p.isActive);

  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [planEditingId, setPlanEditingId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState({ name: '', price: '', duration: 'Mensal' as SubscriptionPlan['duration'], services: [''] });

  const handlePlanOpen = (plan?: SubscriptionPlan) => {
    if (plan) {
      setPlanEditingId(plan.id);
      setPlanForm({ name: plan.name, price: plan.price.toString(), duration: plan.duration, services: [...plan.services] });
    } else {
      setPlanEditingId(null);
      setPlanForm({ name: '', price: '', duration: 'Mensal', services: [''] });
    }
    setIsPlanOpen(true);
  };

  const handlePlanSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validServices = planForm.services.filter(service => service.trim() !== '');
    if (!planForm.name || !planForm.price || validServices.length === 0) {
      toast.error('Preencha os campos (mín. 1 serviço)');
      return;
    }
    const saved = planEditingId
      ? await updatePlan(planEditingId, { ...planForm, price: Number(planForm.price), services: validServices })
      : await addPlan({ ...planForm, price: Number(planForm.price), services: validServices });
    if (!saved) return;
    toast.success(planEditingId ? 'Plano atualizado' : 'Plano criado');
    setIsPlanOpen(false);
  };

  const handlePlanDelete = async (id: string) => {
    if (subscribers.some(subscriber => subscriber.planId === id)) {
      toast.error('Em uso. Remova os assinantes primeiro.');
      return;
    }
    if (await removePlan(id)) toast.success('Plano removido');
  };

  const [isSubOpen, setIsSubOpen] = useState(false);
  const [subEditingId, setSubEditingId] = useState<string | null>(null);
  const [subForm, setSubForm] = useState({
    name: '', phone: '', planId: '', professionalId: '', startDate: today,
    nextPayment: '', status: 'pendente' as 'ativo' | 'vencido' | 'pendente',
  });

  const calculatedNextPayment = (planId: string, startDate: string) => {
    const plan = plans.find(item => item.id === planId);
    return plan && startDate ? addSubscriptionCycle(startDate, plan.duration) : '';
  };

  const handleSubOpen = (subscriber?: Subscriber) => {
    if (subscriber) {
      setSubEditingId(subscriber.id);
      setSubForm({ ...subscriber });
    } else {
      setSubEditingId(null);
      setSubForm({ name: '', phone: '', planId: '', professionalId: '', startDate: today, nextPayment: '', status: 'pendente' });
    }
    setIsSubOpen(true);
  };

  const handleSubSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subForm.name || !subForm.planId || !subForm.professionalId) {
      toast.error('Preencha os obrigatórios');
      return;
    }
    const nextPayment = subEditingId && subForm.nextPayment
      ? subForm.nextPayment
      : calculatedNextPayment(subForm.planId, subForm.startDate);
    if (!nextPayment) {
      toast.error('Selecione um plano e uma data de início válidos');
      return;
    }
    const payload = { ...subForm, nextPayment };
    const saved = subEditingId ? await updateSubscriber(subEditingId, payload) : await addSubscriber(payload);
    if (!saved) return;
    toast.success(subEditingId ? 'Assinante atualizado' : 'Assinante cadastrado');
    setIsSubOpen(false);
  };

  const [paymentSubscriber, setPaymentSubscriber] = useState<Subscriber | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isPaymentSaving, setIsPaymentSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    status: 'pago' as SubscriptionPaymentStatus,
    dueDate: today,
    paidAt: today,
    amount: '',
    paymentMethod: 'dinheiro' as PayMethod,
    note: '',
  });

  const openPaymentDialog = (subscriber: Subscriber) => {
    const plan = plans.find(item => item.id === subscriber.planId);
    setPaymentSubscriber(subscriber);
    setPaymentForm({
      status: subscriberStatus(subscriber, today) === 'pago' ? 'pago' : subscriberStatus(subscriber, today),
      dueDate: subscriber.nextPayment,
      paidAt: today,
      amount: plan?.price.toFixed(2) ?? '',
      paymentMethod: 'dinheiro',
      note: '',
    });
    setIsPaymentOpen(true);
  };

  const handlePaymentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isPaymentSaving) return;
    if (!paymentSubscriber || !paymentForm.dueDate || Number(paymentForm.amount) < 0) {
      toast.error('Informe um valor válido para a mensalidade');
      return;
    }
    if (paymentForm.status === 'pago' && !paymentForm.paidAt) {
      toast.error('Informe a data do recebimento');
      return;
    }
    setIsPaymentSaving(true);
    try {
      const saved = await setSubscriptionPaymentStatus({
        subscriberId: paymentSubscriber.id,
        dueDate: paymentForm.dueDate,
        status: paymentForm.status,
        paidAt: paymentForm.status === 'pago' ? paymentForm.paidAt : undefined,
        amount: Number(paymentForm.amount),
        paymentMethod: paymentForm.status === 'pago' ? paymentForm.paymentMethod : undefined,
        note: paymentForm.note.trim() || undefined,
      });
      if (!saved) return;
      toast.success(paymentForm.status === 'pago' ? 'Mensalidade confirmada presencialmente' : `Mensalidade marcada como ${paymentStatusLabels[paymentForm.status].toLowerCase()}`);
      setIsPaymentOpen(false);
    } finally {
      setIsPaymentSaving(false);
    }
  };

  const history = useMemo(
    () => [...subscriptionPayments].sort((a, b) => (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate)),
    [subscriptionPayments],
  );

  const [noticePeriod, setNoticePeriod] = useState<NoticePeriod>('30');
  const [noticeProfessionalId, setNoticeProfessionalId] = useState('all');
  const noticeEndDate = useMemo(() => {
    if (noticePeriod === 'all') return '';
    const end = parseDateKey(today);
    if (noticePeriod === 'month') {
      return formatDateKey(new Date(end.getFullYear(), end.getMonth() + 1, 0, 12, 0, 0, 0));
    }
    end.setDate(end.getDate() + Number(noticePeriod));
    return formatDateKey(end);
  }, [noticePeriod, today]);
  const noticeSubscribers = useMemo(
    () => subscribers
      .filter(subscriber => {
        const professionalMatch = noticeProfessionalId === 'all' ||
          subscriber.professionalId === noticeProfessionalId;
        const overdue = isSubscriberOverdue(subscriber, today);
        const upcoming = subscriber.nextPayment >= today &&
          (noticePeriod === 'all' || subscriber.nextPayment <= noticeEndDate);
        return professionalMatch && (overdue || upcoming);
      })
      .sort((a, b) => {
        const aOverdue = isSubscriberOverdue(a, today);
        const bOverdue = isSubscriberOverdue(b, today);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return a.nextPayment.localeCompare(b.nextPayment);
      }),
    [noticeEndDate, noticePeriod, noticeProfessionalId, subscribers, today],
  );
  const overdueNoticeCount = noticeSubscribers.filter(subscriber => isSubscriberOverdue(subscriber, today)).length;

  return (
    <div className="p-5 md:p-8 space-y-10 max-w-7xl mx-auto">
      <div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><CreditCard className="text-brand-gold" /> Planos Disponíveis</h2>
          <Dialog open={isPlanOpen} onOpenChange={setIsPlanOpen}>
            <DialogTrigger asChild><button onClick={() => handlePlanOpen()} className="bg-brand-surface border border-brand-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-bg transition-colors flex items-center gap-2"><Plus className="w-4 h-4" /> Novo Plano</button></DialogTrigger>
            <DialogContent className="bg-brand-surface border-brand-border text-foreground">
              <DialogHeader><DialogTitle>{planEditingId ? 'Editar Plano' : 'Novo Plano'}</DialogTitle></DialogHeader>
              <form onSubmit={handlePlanSubmit} className="space-y-4 pt-4">
                <div><label className="text-xs uppercase text-muted-foreground">Nome do Plano</label><input required type="text" value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs uppercase text-muted-foreground">Valor (R$)</label><input required type="number" min="0" step="0.01" value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none" /></div>
                  <div><label className="text-xs uppercase text-muted-foreground">Frequência</label><select value={planForm.duration} onChange={e => setPlanForm({ ...planForm, duration: e.target.value as SubscriptionPlan['duration'] })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none"><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select></div>
                </div>
                <div>
                  <label className="text-xs uppercase text-muted-foreground block mb-2">Serviços Inclusos</label>
                  {planForm.services.map((service, index) => <div key={index} className="flex gap-2 mb-2"><input value={service} onChange={e => { const services = [...planForm.services]; services[index] = e.target.value; setPlanForm({ ...planForm, services }); }} className="flex-1 bg-brand-bg border border-brand-border rounded px-3 py-1 outline-none text-sm" placeholder="Ex: 4 Cortes por mês" /><button type="button" aria-label="Remover serviço" onClick={() => setPlanForm({ ...planForm, services: planForm.services.filter((_, itemIndex) => itemIndex !== index) })} className="text-destructive p-2"><Trash2 className="w-4 h-4" /></button></div>)}
                  <button type="button" onClick={() => setPlanForm({ ...planForm, services: [...planForm.services, ''] })} className="text-xs text-brand-gold font-bold flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar serviço</button>
                </div>
                <button type="submit" className="w-full bg-brand-gold text-brand-bg font-bold py-2 rounded-lg">Salvar Plano</button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-brand-surface border border-brand-border p-5 rounded-2xl"><p className="text-xs text-muted-foreground uppercase font-semibold">Total Planos</p><p className="text-3xl font-bold mt-1">{plans.length}</p></div>
          <div className="bg-brand-surface border border-brand-border p-5 rounded-2xl"><p className="text-xs text-muted-foreground uppercase font-semibold">Mensalidades em dia</p><p className="text-3xl font-bold mt-1 text-success">{activeSubs.length}</p></div>
          <div className="bg-brand-surface border border-brand-border p-5 rounded-2xl"><p className="text-xs text-muted-foreground uppercase font-semibold">Receita recorrente prevista</p><p className="text-3xl font-bold mt-1 text-brand-gold">{brl(mrr)}</p></div>
        </div>

        {isLoading ? <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-48 rounded-xl" />)}</div> :
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map(plan => <div key={plan.id} className="bg-brand-bg border border-brand-border rounded-xl p-5 flex flex-col relative group hover:border-brand-gold/30 transition-colors">
              <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button aria-label={`Editar plano ${plan.name}`} onClick={() => handlePlanOpen(plan)} className="p-1.5 bg-brand-surface border border-brand-border rounded text-muted-foreground hover:text-foreground"><Edit2 className="w-3 h-3" /></button><button aria-label={`Excluir plano ${plan.name}`} onClick={() => handlePlanDelete(plan.id)} className="p-1.5 bg-brand-surface border border-brand-border rounded text-destructive hover:bg-destructive/10"><Trash2 className="w-3 h-3" /></button></div>
              <h4 className="font-bold text-lg">{plan.name}</h4><p className="text-brand-gold font-bold text-2xl mt-1">{brl(plan.price)}<span className="text-sm text-muted-foreground font-normal"> / {plan.duration.toLowerCase()}</span></p>
              <div className="mt-4 flex-1"><ul className="space-y-2 text-sm text-muted-foreground">{plan.services.map((service, index) => <li key={index} className="flex items-start gap-2"><Check className="w-4 h-4 text-brand-gold shrink-0 mt-0.5" /> {service}</li>)}</ul></div>
              <div className="mt-5 pt-4 border-t border-brand-border flex justify-between items-center text-sm"><span className="text-muted-foreground">Assinantes:</span><span className="font-bold">{subscribers.filter(subscriber => subscriber.planId === plan.id).length}</span></div>
            </div>)}
          </div>}
      </div>

      <section className="pt-8 border-t border-brand-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><CalendarClock className="text-brand-gold" /> Avisos de vencimento</h2>
            <p className="text-sm text-muted-foreground mt-1">Acompanhe mensalidades atrasadas e os próximos vencimentos.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 text-sm text-muted-foreground">
            <label className="flex items-center gap-2">
              <span className="whitespace-nowrap">Período</span>
              <select value={noticePeriod} onChange={event => setNoticePeriod(event.target.value as NoticePeriod)} className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-foreground" aria-label="Período dos avisos de vencimento">
                <option value="7">Próximos 7 dias</option>
                <option value="30">Próximos 30 dias</option>
                <option value="month">Até o fim do mês</option>
                <option value="all">Todos os vencimentos</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="whitespace-nowrap">Profissional</span>
              <select value={noticeProfessionalId} onChange={event => setNoticeProfessionalId(event.target.value)} className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-foreground" aria-label="Profissional dos avisos de vencimento">
                <option value="all">Todos os profissionais</option>
                {professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
          {isLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div> :
            noticeSubscribers.length === 0 ? <div className="text-center py-8 text-muted-foreground"><CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Nenhum vencimento no período selecionado.</p></div> :
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-4">
                  <span>{noticeSubscribers.length} {noticeSubscribers.length === 1 ? 'aviso' : 'avisos'} no período</span>
                  {overdueNoticeCount > 0 && <span className="px-2 py-1 rounded-full bg-destructive/10 text-destructive font-semibold">{overdueNoticeCount} atrasada{overdueNoticeCount === 1 ? '' : 's'}</span>}
                </div>
                {noticeSubscribers.map(subscriber => {
                  const plan = plans.find(item => item.id === subscriber.planId);
                  const overdue = isSubscriberOverdue(subscriber, today);
                  return <div key={subscriber.id} className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border ${overdue ? 'bg-destructive/5 border-destructive/20' : 'bg-brand-bg border-brand-border/70'}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{subscriber.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${overdue ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>{overdue ? 'Atrasada' : 'Próxima'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{plan?.name || 'Plano não encontrado'} · {professionals.find(professional => professional.id === subscriber.professionalId)?.name || 'Profissional não encontrado'} · Vencimento: {displayDate(subscriber.nextPayment)}</p>
                      <p className={`text-xs font-medium mt-1 ${overdue ? 'text-destructive' : 'text-warning'}`}>{noticeDueLabel(subscriber, today)}</p>
                    </div>
                    {subscriber.phone && <button type="button" aria-label={`Abrir WhatsApp de ${subscriber.name}`} onClick={() => openSubscriberWhatsapp(subscriber, plan?.name)} className="self-start md:self-center shrink-0 inline-flex items-center justify-center gap-2 rounded-lg border border-[#25D366]/30 bg-[#25D366]/10 px-3 py-2 text-xs font-semibold text-[#25D366] hover:bg-[#25D366]/20 transition-colors"><MessageSquare className="w-4 h-4" /> WhatsApp</button>}
                  </div>;
                })}
              </div>}
        </div>
      </section>

      <div className="pt-8 border-t border-brand-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div><h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Users className="text-brand-gold" /> Assinantes</h2><p className="text-sm text-muted-foreground mt-1">Controle recebimentos diretamente no estabelecimento, sem cobrança online.</p></div>
          <Dialog open={isSubOpen} onOpenChange={setIsSubOpen}>
            <DialogTrigger asChild><button onClick={() => handleSubOpen()} className="bg-brand-gold text-brand-bg px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand-gold/90 flex items-center gap-2"><Plus className="w-4 h-4" /> Adicionar Assinante</button></DialogTrigger>
            <DialogContent className="bg-brand-surface border-brand-border text-foreground">
              <DialogHeader><DialogTitle>{subEditingId ? 'Editar Assinante' : 'Novo Assinante'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubSubmit} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4"><div><label className="text-xs uppercase text-muted-foreground">Nome *</label><input required type="text" value={subForm.name} onChange={e => setSubForm({ ...subForm, name: e.target.value })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none" /></div><div><label className="text-xs uppercase text-muted-foreground">WhatsApp</label><input type="text" value={subForm.phone} onChange={e => setSubForm({ ...subForm, phone: e.target.value })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none" /></div></div>
                <div className="grid grid-cols-2 gap-4"><div><label className="text-xs uppercase text-muted-foreground">Plano *</label><select required value={subForm.planId} onChange={e => { const planId = e.target.value; setSubForm({ ...subForm, planId, nextPayment: calculatedNextPayment(planId, subForm.startDate) }); }} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none"><option value="">Selecione...</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div><div><label className="text-xs uppercase text-muted-foreground">Profissional Responsável *</label><select required value={subForm.professionalId} onChange={e => setSubForm({ ...subForm, professionalId: e.target.value })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none"><option value="">Selecione...</option>{activeProfs.map(professional => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></div></div>
                <div className="grid grid-cols-2 gap-4"><div><label className="text-xs uppercase text-muted-foreground">Início</label><input type="date" required value={subForm.startDate} onChange={e => setSubForm({ ...subForm, startDate: e.target.value, nextPayment: calculatedNextPayment(subForm.planId, e.target.value) })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none text-xs" /></div><div><label className="text-xs uppercase text-muted-foreground">Próximo vencimento</label><div className="w-full bg-brand-bg/60 border border-brand-border rounded px-3 py-2 mt-1 text-xs text-muted-foreground">{subForm.nextPayment ? displayDate(subForm.nextPayment) : 'Selecione o plano'}</div></div></div>
                <p className="text-xs text-muted-foreground flex gap-2 items-start"><CalendarClock className="w-4 h-4 text-brand-gold shrink-0" /> O vencimento é calculado automaticamente conforme o ciclo do plano. O recebimento é confirmado na tela de controle presencial.</p>
                <button type="submit" className="w-full bg-brand-gold text-brand-bg font-bold py-2 rounded-lg">Salvar Assinante</button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
          {isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12" />)}</div> : subscribers.length === 0 ? <p className="text-center py-10 text-muted-foreground">Nenhum assinante</p> : <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left"><thead><tr className="border-b border-brand-border text-muted-foreground"><th className="pb-3">Nome</th><th className="pb-3">Plano</th><th className="pb-3">Próx. Venc.</th><th className="pb-3 text-center">Status</th><th className="pb-3 text-right">Ações</th></tr></thead>
                <tbody>{subscribers.map(subscriber => {
                  const plan = plans.find(item => item.id === subscriber.planId);
                  const status = subscriberStatus(subscriber, today);
                  return <tr key={subscriber.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50"><td className="py-3 font-medium">{subscriber.name}<br /><span className="text-xs text-muted-foreground font-normal">{subscriber.phone}</span></td><td className="py-3 font-medium text-brand-gold">{plan?.name || '—'}</td><td className="py-3">{displayDate(subscriber.nextPayment)}</td><td className="py-3 text-center"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${statusClasses(status)}`}>{paymentStatusLabels[status]}</span></td><td className="py-3 text-right"><div className="flex justify-end gap-1">
                    <button aria-label={`Registrar mensalidade de ${subscriber.name}`} title="Registrar mensalidade presencial" onClick={() => openPaymentDialog(subscriber)} className="p-1.5 text-brand-gold hover:bg-brand-gold/10 rounded"><Receipt className="w-4 h-4" /></button>
                     {subscriber.phone && <button aria-label={`Enviar WhatsApp para ${subscriber.name}`} onClick={() => openSubscriberWhatsapp(subscriber, plan?.name)} className="p-1.5 text-[#25D366] hover:bg-[#25D366]/10 rounded"><MessageSquare className="w-4 h-4" /></button>}
                    <button aria-label={`Editar assinante ${subscriber.name}`} onClick={() => handleSubOpen(subscriber)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-brand-bg rounded"><Edit2 className="w-4 h-4" /></button>
                    <AlertDialog><AlertDialogTrigger asChild><button aria-label={`Excluir assinante ${subscriber.name}`} className="p-1.5 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="w-4 h-4" /></button></AlertDialogTrigger><AlertDialogContent className="bg-brand-surface border-brand-border text-foreground"><AlertDialogHeader><AlertDialogTitle>Excluir Assinante?</AlertDialogTitle><AlertDialogDescription>Excluir o cadastro e o histórico presencial deste assinante?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border text-foreground">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={async () => { if (await removeSubscriber(subscriber.id)) toast.success('Excluído'); }}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                  </div></td></tr>;
                })}</tbody>
              </table>
            </div>
             <div className="md:hidden space-y-3">{subscribers.map(subscriber => {
              const plan = plans.find(item => item.id === subscriber.planId);
              const status = subscriberStatus(subscriber, today);
               return <div key={subscriber.id} className="p-4 bg-brand-bg border border-brand-border rounded-xl"><div className="flex justify-between items-start mb-2"><div><p className="font-bold text-sm">{subscriber.name}</p><p className="text-xs text-brand-gold font-medium">{plan?.name || '—'}</p></div><div className="flex flex-col items-end gap-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusClasses(status)}`}>{paymentStatusLabels[status]}</span><span className="text-xs text-muted-foreground">Vence: {displayDate(subscriber.nextPayment)}</span></div></div><div className="flex gap-1 pt-2 border-t border-brand-border/50 justify-end"><button aria-label={`Registrar mensalidade de ${subscriber.name}`} onClick={() => openPaymentDialog(subscriber)} className="p-1.5 text-brand-gold hover:bg-brand-gold/10 rounded"><Receipt className="w-4 h-4" /></button>{subscriber.phone && <button aria-label={`Enviar WhatsApp para ${subscriber.name}`} onClick={() => openSubscriberWhatsapp(subscriber, plan?.name)} className="p-1.5 text-[#25D366] hover:bg-[#25D366]/10 rounded"><MessageSquare className="w-4 h-4" /></button>}<button aria-label={`Editar assinante ${subscriber.name}`} onClick={() => handleSubOpen(subscriber)} className="p-1.5 text-muted-foreground hover:text-foreground rounded"><Edit2 className="w-4 h-4" /></button><AlertDialog><AlertDialogTrigger asChild><button aria-label={`Excluir assinante ${subscriber.name}`} className="p-1.5 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="w-4 h-4" /></button></AlertDialogTrigger><AlertDialogContent className="bg-brand-surface border-brand-border text-foreground"><AlertDialogHeader><AlertDialogTitle>Excluir Assinante?</AlertDialogTitle><AlertDialogDescription>Excluir o cadastro e o histórico presencial deste assinante?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border text-foreground">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={async () => { if (await removeSubscriber(subscriber.id)) toast.success('Excluído'); }}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></div>;
            })}</div>
          </>}
        </div>
      </div>

      <section className="pt-8 border-t border-brand-border">
        <div className="flex items-center gap-2 mb-4"><History className="text-brand-gold" /><div><h2 className="text-2xl font-bold">Histórico presencial</h2><p className="text-sm text-muted-foreground">Confirmações, pendências e vencimentos registrados por ciclo.</p></div></div>
        <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
          {history.length === 0 ? <p className="text-center py-8 text-muted-foreground">Nenhuma mensalidade registrada ainda.</p> : <div className="space-y-3">{history.slice(0, 20).map(payment => {
            const subscriber = subscribers.find(item => item.id === payment.subscriberId);
            return <div key={payment.id} className="grid grid-cols-1 md:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_1.5fr] gap-2 md:gap-4 items-center p-3 bg-brand-bg border border-brand-border/70 rounded-xl text-sm"><div><p className="font-semibold">{subscriber?.name || 'Assinante removido'}</p><p className="text-xs text-muted-foreground">Vencimento: {displayDate(payment.dueDate)}</p></div><span className={`w-fit px-2 py-1 rounded text-[10px] font-bold uppercase ${statusClasses(payment.status)}`}>{paymentStatusLabels[payment.status]}</span><span className="text-muted-foreground"><span className="text-xs block">Data</span>{displayDate(payment.paidAt ?? payment.dueDate)}</span><span className="font-semibold">{brl(payment.amount)}<span className="block text-xs text-muted-foreground font-normal">{payment.paymentMethod ? PAY_LABELS[payment.paymentMethod] : 'Sem recebimento'}</span></span><span className="text-muted-foreground truncate" title={payment.note}>{payment.note || 'Sem observação'}</span></div>;
          })}</div>}
        </div>
      </section>

      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="bg-brand-surface border-brand-border text-foreground max-w-lg">
          <DialogHeader><DialogTitle>Controle de mensalidade presencial</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Atualize o ciclo de <strong className="text-foreground">{paymentSubscriber?.name}</strong>. Nenhuma cobrança online será criada.</p>
          <form onSubmit={handlePaymentSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs uppercase text-muted-foreground">Status *</label><select value={paymentForm.status} onChange={e => setPaymentForm({ ...paymentForm, status: e.target.value as SubscriptionPaymentStatus })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none"><option value="pago">Paga</option><option value="pendente">Pendente</option><option value="vencido">Vencida</option></select></div><div><label className="text-xs uppercase text-muted-foreground">Vencimento</label><input type="date" required value={paymentForm.dueDate} onChange={e => setPaymentForm({ ...paymentForm, dueDate: e.target.value })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none text-sm" /></div></div>
            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs uppercase text-muted-foreground">Valor (R$)</label><input type="number" min="0" step="0.01" required value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none" /></div>{paymentForm.status === 'pago' && <div><label className="text-xs uppercase text-muted-foreground">Recebido em *</label><input type="date" required value={paymentForm.paidAt} onChange={e => setPaymentForm({ ...paymentForm, paidAt: e.target.value })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none text-sm" /></div>}</div>
            {paymentForm.status === 'pago' && <div><label className="text-xs uppercase text-muted-foreground">Forma de pagamento *</label><select required value={paymentForm.paymentMethod} onChange={e => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value as PayMethod })} className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none">{paymentMethods.map(method => <option key={method} value={method}>{PAY_LABELS[method]}</option>)}</select></div>}
            <div><label className="text-xs uppercase text-muted-foreground">Observação da confirmação presencial</label><textarea rows={3} value={paymentForm.note} onChange={e => setPaymentForm({ ...paymentForm, note: e.target.value })} placeholder="Ex.: recebido no balcão pelo gestor" className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 mt-1 outline-none resize-none" /></div>
            <div className="flex gap-2 text-xs text-muted-foreground bg-brand-bg border border-brand-border rounded-lg p-3"><Clock3 className="w-4 h-4 text-brand-gold shrink-0" /> Ao marcar como paga, o próximo vencimento avançará automaticamente conforme o ciclo do plano.</div>
             <button type="submit" disabled={isPaymentSaving} className="w-full bg-brand-gold text-brand-bg font-bold py-2 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed">{isPaymentSaving ? 'Salvando...' : 'Salvar controle presencial'}</button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}