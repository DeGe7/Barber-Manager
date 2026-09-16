import { useState } from 'react';
import { useStore, brl, ExpenseCategory, EXPENSE_CATEGORIES, PAY_LABELS, PayMethod } from '@/data/store';
import { useAuth } from '@/auth/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, History, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { formatDateKey, formatMonthKey, parseDateKey } from '@/data/date';

const TABS = ['Visão Geral', 'Por Profissional', 'Serviços', 'Produtos'] as const;
type Period = 'anual' | 'semestral' | 'trimestral' | 'mensal' | 'semanal';
const PAYMENT_METHODS: PayMethod[] = ['debito', 'credito', 'pix', 'dinheiro'];
const PAYMENT_CARD_STYLES: Record<PayMethod, string> = {
  debito: 'border-sky-500/30 bg-sky-500/5',
  credito: 'border-violet-500/30 bg-violet-500/5',
  pix: 'border-emerald-500/30 bg-emerald-500/5',
  dinheiro: 'border-amber-500/30 bg-amber-500/5',
};
const PAYMENT_VALUE_STYLES: Record<PayMethod, string> = {
  debito: 'text-sky-400',
  credito: 'text-violet-400',
  pix: 'text-emerald-400',
  dinheiro: 'text-amber-400',
};

export default function Financeiro() {
  const { profile } = useAuth();
  const { expenses, incomes, appointments, professionals, products, prothesisSales, mentoriaSessions, addExpense, updateExpense, removeExpense, addIncome, updateIncome, removeIncome, financeHistory, refreshFinanceHistory, isLoading } = useStore();
  const isManager = profile?.role === 'gestor' || profile?.role === 'dev-admin';

  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Visão Geral');
  const [selectedMonth, setSelectedMonth] = useState(formatMonthKey());
  const [period, setPeriod] = useState<Period>('mensal');
  const [historyOpen, setHistoryOpen] = useState(false);
  
  const year = parseInt(selectedMonth.split('-')[0]);
  const month = parseInt(selectedMonth.split('-')[1]);
  const anchorDate = parseDateKey(`${selectedMonth}-01`);
  const periodStart = new Date(anchorDate);
  if (period === 'anual') periodStart.setMonth(0);
  if (period === 'semestral') periodStart.setMonth(anchorDate.getMonth() < 6 ? 0 : 6);
  if (period === 'trimestral') periodStart.setMonth(Math.floor(anchorDate.getMonth() / 3) * 3);
  if (period === 'semanal') {
    const day = periodStart.getDay();
    periodStart.setDate(periodStart.getDate() - (day === 0 ? 6 : day - 1));
  }
  const periodEnd = new Date(periodStart);
  if (period === 'anual') periodEnd.setFullYear(periodEnd.getFullYear() + 1, 0, 0);
  if (period === 'semestral') periodEnd.setMonth(periodEnd.getMonth() + 6, 0);
  if (period === 'trimestral') periodEnd.setMonth(periodEnd.getMonth() + 3, 0);
  if (period === 'mensal') periodEnd.setMonth(periodEnd.getMonth() + 1, 0);
  if (period === 'semanal') periodEnd.setDate(periodEnd.getDate() + 6);
  const periodMatch = (date: string) => {
    const value = new Date(`${date}T12:00:00`);
    return value >= periodStart && value <= periodEnd;
  };

  const mExpenses = expenses.filter(e => periodMatch(e.date));
  const mIncomes = incomes.filter(i => periodMatch(i.date));
  const mAppts = appointments.filter(a => periodMatch(a.date) && (a.status === 'confirmed' || a.status === 'completed'));
  const mProthesis = prothesisSales.filter(p => periodMatch(p.date));
  const mMentoria = mentoriaSessions.filter(m => periodMatch(m.date) && m.status === 'completed');

  const apptRevenue = mAppts.reduce((s, a) => s + a.value + (a.tip || 0), 0);
  const prothesisRevenue = mProthesis.reduce((s, p) => s + (p.installmentsPaid / p.installments) * p.value, 0);
  const mentoriaRevenue = mMentoria.reduce((s, m) => s + m.value, 0);
  const manualRevenue = mIncomes.reduce((s, i) => s + i.amount, 0);
  const totalIn = apptRevenue + prothesisRevenue + mentoriaRevenue + manualRevenue;
  const totalOut = mExpenses.reduce((s, e) => s + e.amount, 0);
  const result = totalIn - totalOut;

  const paymentTotals = PAYMENT_METHODS.reduce<Record<PayMethod, number>>((totals, method) => {
    totals[method] = 0;
    return totals;
  }, {} as Record<PayMethod, number>);
  const expenseTotals = PAYMENT_METHODS.reduce<Record<PayMethod, number>>((totals, method) => {
    totals[method] = 0;
    return totals;
  }, {} as Record<PayMethod, number>);
  let expensesWithoutPaymentMethod = 0;
  mAppts.forEach(appointment => {
    const payments = appointment.paymentSplits?.length
      ? appointment.paymentSplits
      : [{ method: appointment.payMethod, amount: appointment.value + (appointment.tip || 0) }];
    payments.forEach(payment => {
      if (payment.method in paymentTotals) paymentTotals[payment.method] += Number(payment.amount) || 0;
    });
  });
  mProthesis.forEach(sale => {
    if (sale.payMethod1) {
      const paidAmount = sale.installments > 0
        ? (sale.value / sale.installments) * sale.installmentsPaid
        : 0;
      paymentTotals[sale.payMethod1] += paidAmount;
    }
  });
  mExpenses.forEach(expense => {
    if (expense.paymentMethod && expense.paymentMethod in expenseTotals) {
      expenseTotals[expense.paymentMethod] += expense.amount;
    } else {
      expensesWithoutPaymentMethod += expense.amount;
    }
  });

  const periodRevenue = (dateMatch: (d: string) => boolean) => ({
    appt: appointments.filter(a => dateMatch(a.date) && (a.status === 'confirmed' || a.status === 'completed')).reduce((s, a) => s + a.value + (a.tip || 0), 0),
    proth: prothesisSales.filter(p => dateMatch(p.date)).reduce((s, p) => s + (p.installmentsPaid / p.installments) * p.value, 0),
    ment: mentoriaSessions.filter(m => dateMatch(m.date) && m.status === 'completed').reduce((s, m) => s + m.value, 0),
    manual: incomes.filter(i => dateMatch(i.date)).reduce((s, i) => s + i.amount, 0),
  });
  const sumRev = (r: ReturnType<typeof periodRevenue>) => r.appt + r.proth + r.ment + r.manual;

  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyData = Array.from({length: daysInMonth}, (_, i) => {
    const d = `${selectedMonth}-${(i+1).toString().padStart(2,'0')}`;
    return {
      day: i+1,
      in: sumRev(periodRevenue(date => date === d)),
      out: mExpenses.filter(e => e.date === d).reduce((s, e) => s + e.amount, 0)
    };
  });

  const profData = professionals.map(p => {
    const pAppts = mAppts.filter(a => a.professionalId === p.id);
    const rev = pAppts.reduce((s, a) => s + a.value + (a.tip||0), 0);
    const comm = pAppts.reduce((s, a) => {
      const srvKey = a.service.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") as keyof typeof p.commissions;
      return s + (a.value * (p.commissions[srvKey] || 0));
    }, 0);
    return { name: p.name, count: pAppts.length, rev, comm };
  }).filter(d => d.rev > 0).sort((a,b) => b.rev - a.rev);

  const serviceDataObj: Record<string, {count:number, rev:number}> = {};
  mAppts.forEach(a => {
    if(!serviceDataObj[a.service]) serviceDataObj[a.service] = {count:0, rev:0};
    serviceDataObj[a.service].count++;
    serviceDataObj[a.service].rev += a.value;
  });
  const serviceData = Object.entries(serviceDataObj).map(([name, d]) => ({ name, ...d })).sort((a,b) => b.rev - a.rev);

  const prodDataObj: Record<string, {qty:number, rev:number}> = {};
  mAppts.forEach(a => {
    a.products.forEach(ap => {
      const p = products.find(x => x.id === ap.productId);
      if(p) {
        if(!prodDataObj[p.id]) prodDataObj[p.id] = {qty:0, rev:0};
        prodDataObj[p.id].qty += ap.quantity;
        prodDataObj[p.id].rev += (ap.quantity * p.price);
      }
    });
  });
  const prodDataList = Object.entries(prodDataObj).map(([id, d]) => ({ name: products.find(p=>p.id===id)?.name||'?', ...d })).sort((a,b) => b.rev - a.rev);

  const weekDataObj = { 'Dom':0, 'Seg':0, 'Ter':0, 'Qua':0, 'Qui':0, 'Sex':0, 'Sáb':0 };
  const weekDays = Object.keys(weekDataObj);
  const addToWeek = (date: string, amount: number) => {
    const dow = new Date(date + 'T12:00:00').getDay();
    weekDataObj[weekDays[dow] as keyof typeof weekDataObj] += amount;
  };
  mAppts.forEach(a => addToWeek(a.date, a.value + (a.tip || 0)));
  mProthesis.forEach(p => addToWeek(p.date, (p.installmentsPaid / p.installments) * p.value));
  mMentoria.forEach(m => addToWeek(m.date, m.value));
  mIncomes.forEach(i => addToWeek(i.date, i.amount));
  const weekData = weekDays.map(d => ({ name: d, val: weekDataObj[d as keyof typeof weekDataObj] }));

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const yearData = months.map((m, i) => {
    const prefix = `${year}-${(i+1).toString().padStart(2,'0')}`;
    const monthAppts = appointments.filter(a => a.date.startsWith(prefix) && (a.status === 'confirmed' || a.status === 'completed'));
    const monthProth = prothesisSales.filter(p => p.date.startsWith(prefix));
    const monthMent = mentoriaSessions.filter(ms => ms.date.startsWith(prefix) && ms.status === 'completed');
    const monthManual = incomes.filter(inc => inc.date.startsWith(prefix));
    return {
      name: m,
      in: monthAppts.reduce((s, a) => s + a.value + (a.tip || 0), 0) +
          monthProth.reduce((s, p) => s + (p.installmentsPaid / p.installments) * p.value, 0) +
          monthMent.reduce((s, ms) => s + ms.value, 0) +
          monthManual.reduce((s, inc) => s + inc.amount, 0),
      out: expenses.filter(e => e.date.startsWith(prefix)).reduce((s, e) => s + e.amount, 0)
    };
  });

  const [expOpen, setExpOpen] = useState(false);
  const [expForm, setExpForm] = useState({ date: formatDateKey(), desc: '', amount: '', cat: 'Outros' as ExpenseCategory, paymentMethod: '' as PayMethod | '' });
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const handleExp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expForm.paymentMethod) {
      toast.error('Selecione a forma de pagamento da despesa');
      return;
    }
    setIsSavingExpense(true);
    try {
      const payload = { date: expForm.date, description: expForm.desc, amount: Number(expForm.amount), category: expForm.cat, paymentMethod: expForm.paymentMethod };
      const saved = editingExpenseId ? await updateExpense(editingExpenseId, payload) : await addExpense(payload);
      if (saved) {
        toast.success(editingExpenseId ? 'Despesa atualizada' : 'Despesa adicionada');
        setExpOpen(false);
        setEditingExpenseId(null);
        setExpForm({ date: formatDateKey(), desc: '', amount: '', cat: 'Outros', paymentMethod: '' });
      }
    } finally {
      setIsSavingExpense(false);
    }
  };

  const [incOpen, setIncOpen] = useState(false);
  const [incForm, setIncForm] = useState({ date: formatDateKey(), desc: '', amount: '' });
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [isSavingIncome, setIsSavingIncome] = useState(false);
  const handleInc = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingIncome(true);
    try {
      const payload = { date: incForm.date, description: incForm.desc, amount: Number(incForm.amount) };
      const saved = editingIncomeId ? await updateIncome(editingIncomeId, payload) : await addIncome(payload);
      if (!saved) return;
      toast.success(editingIncomeId ? 'Receita atualizada' : 'Receita adicionada');
      setIncOpen(false);
      setEditingIncomeId(null);
      setIncForm({ date: formatDateKey(), desc: '', amount: '' });
    } finally {
      setIsSavingIncome(false);
    }
  };

  const startIncomeEdit = (income: typeof incomes[number]) => {
    setEditingIncomeId(income.id);
    setIncForm({ date: income.date, desc: income.description, amount: String(income.amount) });
    setIncOpen(true);
  };

  const startExpenseEdit = (expense: typeof expenses[number]) => {
    setEditingExpenseId(expense.id);
    setExpForm({ date: expense.date, desc: expense.description, amount: String(expense.amount), cat: expense.category, paymentMethod: expense.paymentMethod ?? '' });
    setExpOpen(true);
  };

  const handleRemoveIncome = async (id: string) => {
    if (await removeIncome(id)) toast.success('Removido');
  };

  const handleRemoveExpense = async (id: string) => {
    if (await removeExpense(id)) toast.success('Removido');
  };

  const openFinanceHistory = async () => {
    await refreshFinanceHistory();
    setHistoryOpen(true);
  };

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-foreground">Financeiro</h2>
         <div className="flex gap-2">
           <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none" aria-label="Período financeiro">
             <option value="anual">Anual</option><option value="semestral">Semestral</option><option value="trimestral">Trimestral</option><option value="mensal">Mensal</option><option value="semanal">Semanal</option>
           </select>
           <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-brand-surface border border-brand-border rounded-lg px-4 py-2 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none" aria-label="Mês de referência" />
         </div>
      </div>

      <div className="flex border-b border-brand-border overflow-x-auto hide-scrollbar">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab ? 'border-brand-gold text-brand-gold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab}
          </button>
        ))}
      </div>

          {isLoading ? (
        <div className="space-y-4">{Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>
      ) : (
        <div className="space-y-6">
          
          {activeTab === 'Visão Geral' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-24 h-24 bg-success/10 blur-2xl rounded-full" />
                  <p className="text-sm font-semibold text-muted-foreground uppercase">Entradas</p>
                  <p className="text-3xl font-bold text-success mt-2">{brl(totalIn)}</p>
                </div>
                <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-24 h-24 bg-destructive/10 blur-2xl rounded-full" />
                  <p className="text-sm font-semibold text-muted-foreground uppercase">Saídas</p>
                  <p className="text-3xl font-bold text-destructive mt-2">{brl(totalOut)}</p>
                </div>
                <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-24 h-24 bg-brand-gold/10 blur-2xl rounded-full" />
                  <p className="text-sm font-semibold text-muted-foreground uppercase">Resultado</p>
                  <p className={`text-3xl font-bold mt-2 ${result >= 0 ? 'text-brand-gold' : 'text-destructive'}`}>{brl(result)}</p>
                </div>
              </div>

              <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Entradas e saídas por forma de pagamento</h3>
                    <p className="text-xs text-muted-foreground mt-1">Movimentações financeiras no período selecionado</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {PAYMENT_METHODS.map(method => (
                    <div key={method} className={`rounded-xl border p-4 ${PAYMENT_CARD_STYLES[method]}`}>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">{PAY_LABELS[method]}</p>
                      <div className="mt-3 space-y-1.5 text-sm">
                        <p className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Entrou</span>
                          <strong className={PAYMENT_VALUE_STYLES[method]}>{brl(paymentTotals[method])}</strong>
                        </p>
                        <p className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Saiu</span>
                          <strong className="text-destructive">{brl(expenseTotals[method])}</strong>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {expensesWithoutPaymentMethod > 0 && (
                  <p className="mt-3 text-xs text-warning">
                    {brl(expensesWithoutPaymentMethod)} em despesas antigas sem forma de pagamento. Edite-as para classificá-las.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-brand-surface border border-brand-border rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-foreground mb-4">Fluxo Diário ({months[month-1]})</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--brand-border))" vertical={false} />
                        <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `R$${v}`} />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--brand-surface))', borderColor: 'hsl(var(--brand-border))' }} />
                        <Line type="monotone" dataKey="in" name="Entradas" stroke="hsl(var(--success))" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="out" name="Saídas" stroke="hsl(var(--destructive))" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 flex flex-col h-[400px]">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-foreground">Movimentações</h3>
                     <div className="flex gap-2">
                       {isManager && (
                         <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                           <button aria-label="Ver histórico financeiro" onClick={openFinanceHistory} className="h-8 px-2 flex items-center gap-1.5 rounded-lg bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20 transition-colors text-xs font-semibold">
                             <History className="w-4 h-4" /> Histórico
                           </button>
                           <DialogContent className="bg-brand-surface border-brand-border text-foreground max-w-3xl">
                             <DialogHeader>
                               <DialogTitle>Histórico de alterações financeiras</DialogTitle>
                             </DialogHeader>
                             <p className="text-sm text-muted-foreground">
                               Consulta somente leitura das alterações feitas em receitas e despesas manuais.
                             </p>
                             <div className="space-y-3">
                               {financeHistory.length === 0 ? (
                                 <p className="text-sm text-muted-foreground text-center py-8">Nenhuma alteração registrada.</p>
                               ) : financeHistory.map(change => {
                                 const values = change.entryType === 'expense'
                                   ? `${change.newValues.description} · ${change.newValues.category || 'Outros'}`
                                   : change.newValues.description;
                                 return (
                                   <div key={change.id} className="rounded-lg border border-brand-border bg-brand-bg p-3 text-sm">
                                     <div className="flex flex-wrap items-center justify-between gap-2">
                                       <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${change.entryType === 'income' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                                         {change.entryType === 'income' ? 'Receita' : 'Despesa'}
                                       </span>
                                       <span className="text-xs text-muted-foreground">
                                         {change.changedByName} · {new Date(change.changedAt).toLocaleString('pt-BR')}
                                       </span>
                                     </div>
                                     <p className="mt-2 font-medium">{values}</p>
                                     <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                       <div className="rounded border border-brand-border/70 p-2">
                                         <p className="text-muted-foreground mb-1">Antes</p>
                                         <p>{change.previousValues.date.split('-').reverse().join('/')} · {brl(change.previousValues.amount)}</p>
                                         <p className="truncate">{change.previousValues.description}{change.entryType === 'expense' && change.previousValues.category ? ` · ${change.previousValues.category}` : ''}</p>
                                       </div>
                                       <div className="rounded border border-brand-gold/30 p-2">
                                         <p className="text-brand-gold mb-1">Depois</p>
                                         <p>{change.newValues.date.split('-').reverse().join('/')} · {brl(change.newValues.amount)}</p>
                                         <p className="truncate">{change.newValues.description}{change.entryType === 'expense' && change.newValues.category ? ` · ${change.newValues.category}` : ''}</p>
                                       </div>
                                     </div>
                                   </div>
                                 );
                               })}
                             </div>
                           </DialogContent>
                         </Dialog>
                       )}
                      <Dialog open={incOpen} onOpenChange={open => {
                        setIncOpen(open);
                        if (!open) {
                          setEditingIncomeId(null);
                          setIncForm({ date: formatDateKey(), desc: '', amount: '' });
                        }
                      }}>
                        <DialogTrigger asChild><button aria-label="Lançar receita manual" className="w-8 h-8 flex justify-center items-center rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"><ArrowUpRight className="w-4 h-4"/></button></DialogTrigger>
                        <DialogContent className="bg-brand-surface border-brand-border text-foreground">
                          <DialogHeader><DialogTitle>{editingIncomeId ? 'Editar Receita Manual' : 'Lançar Receita Manual'}</DialogTitle></DialogHeader>
                          <form onSubmit={handleInc} className="space-y-4"><input aria-label="Data da receita" type="date" required value={incForm.date} onChange={e=>setIncForm(f=>({...f,date:e.target.value}))} className="w-full bg-brand-bg border border-brand-border rounded p-2" /><input aria-label="Descrição da receita" type="text" required placeholder="Descrição" value={incForm.desc} onChange={e=>setIncForm(f=>({...f,desc:e.target.value}))} className="w-full bg-brand-bg border border-brand-border rounded p-2" /><input aria-label="Valor da receita" type="number" step="0.01" required placeholder="Valor" value={incForm.amount} onChange={e=>setIncForm(f=>({...f,amount:e.target.value}))} className="w-full bg-brand-bg border border-brand-border rounded p-2" /><button type="submit" disabled={isSavingIncome} className="w-full bg-success text-white py-2 rounded font-bold disabled:opacity-60">{isSavingIncome ? 'Salvando...' : editingIncomeId ? 'Salvar alterações' : 'Salvar'}</button></form>
                        </DialogContent>
                      </Dialog>
                      <Dialog open={expOpen} onOpenChange={open => {
                        setExpOpen(open);
                        if (!open) {
                          setEditingExpenseId(null);
                           setExpForm({ date: formatDateKey(), desc: '', amount: '', cat: 'Outros', paymentMethod: '' });
                        }
                      }}>
                        <DialogTrigger asChild><button aria-label="Lançar despesa" className="w-8 h-8 flex justify-center items-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"><ArrowDownRight className="w-4 h-4"/></button></DialogTrigger>
                        <DialogContent className="bg-brand-surface border-brand-border text-foreground">
                          <DialogHeader><DialogTitle>{editingExpenseId ? 'Editar Despesa' : 'Lançar Despesa'}</DialogTitle></DialogHeader>
                           <form onSubmit={handleExp} className="space-y-4"><input aria-label="Data da despesa" type="date" required value={expForm.date} onChange={e=>setExpForm(f=>({...f,date:e.target.value}))} className="w-full bg-brand-bg border border-brand-border rounded p-2" /><select aria-label="Categoria da despesa" value={expForm.cat} onChange={e=>setExpForm(f=>({...f,cat:e.target.value as ExpenseCategory}))} className="w-full bg-brand-bg border border-brand-border rounded p-2">{EXPENSE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select><select aria-label="Forma de pagamento da despesa" required value={expForm.paymentMethod} onChange={e=>setExpForm(f=>({...f,paymentMethod:e.target.value as PayMethod}))} className="w-full bg-brand-bg border border-brand-border rounded p-2"><option value="">Forma de pagamento</option>{PAYMENT_METHODS.map(method=><option key={method} value={method}>{PAY_LABELS[method]}</option>)}</select><input aria-label="Descrição da despesa" type="text" required placeholder="Descrição" value={expForm.desc} onChange={e=>setExpForm(f=>({...f,desc:e.target.value}))} className="w-full bg-brand-bg border border-brand-border rounded p-2" /><input aria-label="Valor da despesa" type="number" step="0.01" required placeholder="Valor" value={expForm.amount} onChange={e=>setExpForm(f=>({...f,amount:e.target.value}))} className="w-full bg-brand-bg border border-brand-border rounded p-2" /><button type="submit" disabled={isSavingExpense} className="w-full bg-destructive text-white py-2 rounded font-bold disabled:opacity-60">{isSavingExpense ? 'Salvando...' : editingExpenseId ? 'Salvar alterações' : 'Salvar'}</button></form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {(() => {
                       type FeedItem = { id: string; date: string; label: string; description: string; amount: number; sign: '+' | '-'; canDelete: boolean; onDelete?: () => void; onEdit?: () => void };
                      const feed: FeedItem[] = [
                        ...mAppts.map(a => ({ id: a.id, date: a.date, label: 'Agendamento', description: `${a.client} — ${a.service}`, amount: a.value + (a.tip || 0), sign: '+' as const, canDelete: false })),
                        ...mProthesis.map(p => ({ id: p.id, date: p.date, label: 'Prótese', description: `${p.client} (${p.installmentsPaid}/${p.installments} parcelas)`, amount: (p.installmentsPaid / p.installments) * p.value, sign: '+' as const, canDelete: false })),
                        ...mMentoria.map(m => ({ id: m.id, date: m.date, label: 'Mentoria', description: m.client, amount: m.value, sign: '+' as const, canDelete: false })),
                         ...mIncomes.map(i => ({ id: i.id, date: i.date, label: 'Manual', description: i.description, amount: i.amount, sign: '+' as const, canDelete: true, onDelete: () => handleRemoveIncome(i.id), onEdit: () => startIncomeEdit(i) })),
                          ...mExpenses.map(e => ({ id: e.id, date: e.date, label: 'Despesa', description: `${e.description} · ${e.category}${e.paymentMethod ? ` · ${PAY_LABELS[e.paymentMethod]}` : ''}`, amount: e.amount, sign: '-' as const, canDelete: true, onDelete: () => handleRemoveExpense(e.id), onEdit: () => startExpenseEdit(e) })),
                      ].sort((a, b) => b.date.localeCompare(a.date));
                      if (feed.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">Nenhuma movimentação</p>;
                      return feed.map(item => (
                        <div key={`${item.label}-${item.id}`} className="p-3 bg-brand-bg rounded-lg border border-brand-border flex justify-between items-center group">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${item.sign === '+' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{item.label}</span>
                              <p className="text-sm font-medium truncate">{item.description}</p>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{item.date.split('-').reverse().join('/')}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            <span className={`font-bold text-sm ${item.sign === '+' ? 'text-success' : 'text-destructive'}`}>{item.sign}{brl(item.amount)}</span>
                             {item.canDelete && item.onEdit && (
                               <button aria-label="Editar lançamento" onClick={item.onEdit} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-brand-border/50 p-1 rounded transition-all"><Pencil className="w-3 h-3"/></button>
                             )}
                             {item.canDelete && item.onDelete && (
                               <AlertDialog><AlertDialogTrigger asChild><button aria-label="Excluir lançamento" className="opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/20 p-1 rounded transition-all"><Trash2 className="w-3 h-3"/></button></AlertDialogTrigger><AlertDialogContent className="bg-brand-surface border-brand-border text-foreground"><AlertDialogHeader><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogDescription>Remover este lançamento?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={item.onDelete}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                             )}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'Por Profissional' && (
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
              <h3 className="text-lg font-bold text-foreground mb-6">Faturamento por Profissional</h3>
              {profData.length === 0 ? <p className="text-muted-foreground text-center py-12">Sem dados para este mês.</p> : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead><tr className="border-b border-brand-border text-muted-foreground"><th className="pb-3">Profissional</th><th className="pb-3 text-center">Atendimentos</th><th className="pb-3 text-right">Faturamento Total</th><th className="pb-3 text-right">Comissão Devida</th></tr></thead>
                      <tbody>
                        {profData.map(d => (
                          <tr key={d.name} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors"><td className="py-4 font-bold text-brand-gold">{d.name}</td><td className="py-4 text-center">{d.count}</td><td className="py-4 text-right font-medium">{brl(d.rev)}</td><td className="py-4 text-right font-bold text-success">{brl(d.comm)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden space-y-3">
                    {profData.map(d => (
                      <div key={d.name} className="p-4 bg-brand-bg border border-brand-border rounded-xl">
                        <p className="font-bold text-brand-gold mb-2">{d.name}</p>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div><p className="text-muted-foreground">Atendimentos</p><p className="font-bold text-base">{d.count}</p></div>
                          <div><p className="text-muted-foreground">Faturamento</p><p className="font-bold text-base">{brl(d.rev)}</p></div>
                          <div><p className="text-muted-foreground">Comissão</p><p className="font-bold text-base text-success">{brl(d.comm)}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'Serviços' && (
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
              <h3 className="text-lg font-bold text-foreground mb-6">Receita por Serviço</h3>
              {serviceData.length === 0 ? <p className="text-muted-foreground text-center py-12">Sem dados para este mês.</p> : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead><tr className="border-b border-brand-border text-muted-foreground"><th className="pb-3">Serviço</th><th className="pb-3 text-center">Qtd</th><th className="pb-3 text-right">Receita</th><th className="pb-3 text-right">% do Total</th></tr></thead>
                      <tbody>
                        {serviceData.map(d => (
                          <tr key={d.name} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors"><td className="py-4 font-bold">{d.name}</td><td className="py-4 text-center">{d.count}</td><td className="py-4 text-right font-medium">{brl(d.rev)}</td><td className="py-4 text-right text-muted-foreground">{totalIn > 0 ? Math.round((d.rev / totalIn) * 100) : 0}%</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden space-y-3">
                    {serviceData.map(d => (
                      <div key={d.name} className="p-4 bg-brand-bg border border-brand-border rounded-xl flex justify-between items-center">
                        <div>
                          <p className="font-bold text-sm">{d.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{d.count} atendimento(s)</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{brl(d.rev)}</p>
                          <p className="text-xs text-muted-foreground">{totalIn > 0 ? Math.round((d.rev / totalIn) * 100) : 0}% do total</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'Produtos' && (
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
              <h3 className="text-lg font-bold text-foreground mb-6">Produtos Vendidos (via Atendimento)</h3>
              {prodDataList.length === 0 ? <p className="text-muted-foreground text-center py-12">Nenhum produto vendido este mês.</p> : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead><tr className="border-b border-brand-border text-muted-foreground"><th className="pb-3">Produto</th><th className="pb-3 text-center">Qtd Vendida</th><th className="pb-3 text-right">Receita Total</th></tr></thead>
                      <tbody>
                        {prodDataList.map(d => (
                          <tr key={d.name} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors"><td className="py-4 font-bold">{d.name}</td><td className="py-4 text-center">{d.qty}</td><td className="py-4 text-right font-medium text-success">{brl(d.rev)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden space-y-3">
                    {prodDataList.map(d => (
                      <div key={d.name} className="p-4 bg-brand-bg border border-brand-border rounded-xl flex justify-between items-center">
                        <div>
                          <p className="font-bold text-sm">{d.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{d.qty} unidade(s)</p>
                        </div>
                        <p className="font-bold text-success">{brl(d.rev)}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
