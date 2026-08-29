import { useState } from 'react';
import { useStore, brl, productStatus, EXPENSE_CATEGORIES, PAY_LABELS, ExpenseCategory, PayMethod, PaymentSplit, ProfessionalCommissions } from '@/data/store';
import { useAuth } from '@/auth/auth';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';
import { formatDateKey } from '@/data/date';

export default function Controle() {
  const { 
    professionals, products, appointments, expenses, config,
    addAppointment, addExpense, sellProduct, isLoading
  } = useStore();
  const { profile: session } = useAuth();

  const today = formatDateKey();
  const activeProfs = professionals.filter(p => p.isActive);

  // Form states
  const [client, setClient] = useState('');
  const [service, setService] = useState('Barbearia');
  const [profId, setProfId] = useState('');
  const [value, setValue] = useState('');
  const [tip, setTip] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('pix');
  const [notes, setNotes] = useState('');
  const [apptProducts, setApptProducts] = useState<{productId: string, quantity: number}[]>([]);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);

  // Expense form
  const [expDate, setExpDate] = useState(today);
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Outros');

  const ownProfile = Boolean(session?.professionalId && session.role !== 'gestor' && session.role !== 'dev-admin');
  const resolvedProfId = ownProfile ? session?.professionalId : profId;
  const selectedProf = professionals.find(p => p.id === resolvedProfId);
  const serviceItem = config.services.find(s => s.name === service && s.isActive) ?? config.services.find(s => s.isActive);
  const serviceKey = (serviceItem?.commissionKey ?? 'barbearia') as keyof ProfessionalCommissions;
  const commRate = selectedProf?.commissions[serviceKey] || 0;
  const serviceValue = parseFloat(value) || 0;
  const calculatedComm = serviceValue * commRate;

  const handleAddProduct = () => setApptProducts([...apptProducts, { productId: '', quantity: 1 }]);
  const updateApptProduct = (index: number, field: 'productId' | 'quantity', val: any) => {
    const newP = [...apptProducts];
    newP[index] = { ...newP[index], [field]: val };
    setApptProducts(newP);
  };
  const removeApptProduct = (index: number) => setApptProducts(apptProducts.filter((_, i) => i !== index));

  const totalProducts = apptProducts.reduce((sum, ap) => {
    const p = products.find(prod => prod.id === ap.productId);
    return sum + (p ? p.price * ap.quantity : 0);
  }, 0);

  const handleRegisterAppt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !resolvedProfId || !serviceItem) { toast.error('Preencha os campos obrigatórios'); return; }
    
    const valNum = serviceValue;
    const tipNum = parseFloat(tip) || 0;
    const duration = serviceItem.duration;
    const currentTime = new Date().toTimeString().slice(0, 5);
    
    const validProducts = apptProducts.filter(p => p.productId && p.quantity > 0);

    // Aggregate quantities by productId so duplicate rows are combined
    const aggregated: Record<string, number> = {};
    for (const p of validProducts) {
      aggregated[p.productId] = (aggregated[p.productId] || 0) + p.quantity;
    }

    const total = valNum + tipNum + totalProducts;
    const normalizedPayments = paymentSplits.length > 0
      ? paymentSplits
      : [{ method: payMethod, amount: total }];
    const hasInvalidPayment = normalizedPayments.some(payment =>
      !Number.isFinite(Number(payment.amount)) || Number(payment.amount) < 0
    );
    if (hasInvalidPayment || Math.abs(normalizedPayments.reduce((sum, payment) => sum + Number(payment.amount), 0) - total) > 0.01) {
      toast.error(`As formas de pagamento devem totalizar ${brl(total)}`);
      return;
    }

    // Pre-validate ALL quantities before mutating any stock
    for (const [productId, qty] of Object.entries(aggregated)) {
      const prod = products.find(pr => pr.id === productId);
      if (!prod || prod.stock < qty) {
        toast.error(`Estoque insuficiente: ${prod?.name ?? 'produto'} (disponível: ${prod?.stock ?? 0})`);
        return;
      }
    }

    // All valid — apply stock deductions
    for (const [productId, qty] of Object.entries(aggregated)) {
      sellProduct(productId, qty);
    }

    addAppointment({
      date: today,
      time: currentTime,
      client,
      professionalId: resolvedProfId,
      service,
      duration,
      status: 'confirmed',
      value: valNum,
      tip: tipNum,
      products: validProducts,
      payMethod,
      paymentSplits: normalizedPayments,
      notes
    });

    toast.success('Atendimento registrado!');
    setClient(''); setValue(''); setTip(''); setNotes(''); setApptProducts([]); setPaymentSplits([]);
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDate || !expDesc || !expAmount) { toast.error('Preencha os campos obrigatórios'); return; }
    
    addExpense({
      date: expDate,
      description: expDesc,
      amount: parseFloat(expAmount),
      category: expCategory
    });
    
    toast.success('Despesa registrada!');
    setExpDesc(''); setExpAmount(''); setExpDate(today); setExpCategory('Outros');
  };

  // Revenue derived from confirmed appointments (no stale income records)
  const todayAppts = appointments.filter(a => a.date === today && (a.status === 'confirmed' || a.status === 'completed'));
  const todayExpenses = expenses.filter(e => e.date === today);
  const movs = [
    ...todayAppts.map(a => ({
      id: a.id,
      date: a.date,
      description: `${a.client} — ${a.service} (${professionals.find(p => p.id === a.professionalId)?.name || ''})`,
      amount: a.value + (a.tip || 0),
      type: 'in' as const
    })),
    ...todayExpenses.map(e => ({ ...e, type: 'out' as const }))
  ].sort((a, b) => b.id.localeCompare(a.id));

  const totalIn = todayAppts.reduce((s, a) => s + a.value + (a.tip || 0), 0);
  const totalOut = todayExpenses.reduce((s, e) => s + e.amount, 0);
  const alertProducts = products.filter(p => productStatus(p) !== 'ok');

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-foreground">Controle Diário</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lançar Atendimento */}
        <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
          <h3 className="text-lg font-bold text-foreground mb-4">Registrar Atendimento</h3>
          <form onSubmit={handleRegisterAppt} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Cliente *</label>
              <input type="text" required value={client} onChange={e => setClient(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2 mt-1 text-sm text-foreground focus:ring-1 focus:ring-brand-gold focus:border-brand-gold outline-none transition-all" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Serviço *</label>
                <select value={service} onChange={e => setService(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2 mt-1 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none">
                  {config.services.filter(s => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Profissional *</label>
                <select required disabled={ownProfile} value={resolvedProfId || ''} onChange={e => setProfId(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2 mt-1 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none disabled:opacity-60">
                  <option value="">Selecione...</option>
                  {activeProfs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {selectedProf && (
              <div className="p-3 bg-brand-gold/10 border border-brand-gold/20 rounded-lg flex justify-between items-center text-sm">
                <span className="text-brand-gold font-medium">Comissão ({Math.round(commRate * 100)}%):</span>
                <span className="font-bold text-brand-gold">{brl(calculatedComm)}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Valor do Serviço</label>
                 <input type="number" min="0" step="0.01" required value={value} onChange={e => setValue(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2 mt-1 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none" placeholder="Digite o valor" />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Gorjeta (R$)</label>
                <input type="number" step="0.01" min="0" value={tip} onChange={e => setTip(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2 mt-1 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1 block">Produtos Consumidos</label>
              <div className="space-y-2">
                {apptProducts.map((ap, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select value={ap.productId} onChange={e => updateApptProduct(i, 'productId', e.target.value)} className="flex-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none">
                      <option value="">Selecione o produto...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.stock} em estoque)</option>)}
                    </select>
                    <input type="number" min="1" value={ap.quantity} onChange={e => updateApptProduct(i, 'quantity', parseInt(e.target.value) || 1)} className="w-20 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none" />
                    <button type="button" aria-label="Remover produto" onClick={() => removeApptProduct(i)} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-all hover:scale-105"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button type="button" onClick={handleAddProduct} className="text-sm text-brand-gold font-medium flex items-center gap-1 hover:underline"><Plus className="w-4 h-4" /> Adicionar Produto</button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Forma de Pagamento *</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value as PayMethod)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2 mt-1 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none">
                {config.paymentMethods.filter(p => p.isActive).map(payment => <option key={payment.key} value={payment.key}>{payment.label}</option>)}
              </select>
              <div className="mt-2 space-y-2">
                {paymentSplits.map((payment, index) => (
                  <div key={index} className="flex gap-2">
                    <select value={payment.method} onChange={e => setPaymentSplits(items => items.map((item, i) => i === index ? { ...item, method: e.target.value as PayMethod } : item))} className="flex-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm">
                      {config.paymentMethods.filter(p => p.isActive).map(paymentOption => <option key={paymentOption.key} value={paymentOption.key}>{paymentOption.label}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" value={payment.amount} onChange={e => setPaymentSplits(items => items.map((item, i) => i === index ? { ...item, amount: Number(e.target.value) } : item))} className="w-28 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm" aria-label={`Valor da forma ${index + 1}`} />
                    <button type="button" onClick={() => setPaymentSplits(items => items.filter((_, i) => i !== index))} className="px-2 text-destructive" aria-label="Remover forma de pagamento"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setPaymentSplits(items => [...items, { method: 'pix', amount: 0 }])} className="text-sm text-brand-gold font-medium hover:underline">+ Adicionar Forma de Pagamento</button>
              </div>
            </div>
            
            <div>
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Observações</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2 mt-1 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none h-20 resize-none"></textarea>
            </div>

            <button type="submit" className="w-full bg-brand-gold text-brand-bg font-bold py-3 rounded-lg hover:bg-brand-gold/90 transition-all">
              Salvar Atendimento — Total: {brl(serviceValue + (parseFloat(tip)||0) + totalProducts)}
            </button>
          </form>
        </div>

        <div className="space-y-6">
          {/* Lançar Despesa */}
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
            <h3 className="text-lg font-bold text-foreground mb-4">Lançar Despesa</h3>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Data *</label>
                  <input type="date" required value={expDate} onChange={e => setExpDate(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2 mt-1 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Categoria *</label>
                  <select required value={expCategory} onChange={e => setExpCategory(e.target.value as ExpenseCategory)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2 mt-1 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none">
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Descrição *</label>
                <input type="text" required value={expDesc} onChange={e => setExpDesc(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2 mt-1 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none" />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Valor (R$) *</label>
                <input type="number" step="0.01" min="0.01" required value={expAmount} onChange={e => setExpAmount(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2 mt-1 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none" />
              </div>
              
              <button type="submit" className="w-full bg-brand-surface border border-destructive text-destructive font-bold py-3 rounded-lg hover:bg-destructive/10 transition-all">
                Registrar Despesa
              </button>
            </form>
          </div>

          {/* Estoque em Alerta */}
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
            <h3 className="text-lg font-bold text-foreground mb-4">Estoque em Alerta</h3>
            {alertProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todos os produtos estão com estoque regular.</p>
            ) : (
              <div className="space-y-2">
                {alertProducts.map(p => (
                  <div key={p.id} className="flex justify-between items-center p-3 rounded-lg bg-brand-bg border border-brand-border">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-md ${productStatus(p) === 'critical' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                      {p.stock} / min {p.minStock}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Movimentações do Dia */}
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
        <h3 className="text-lg font-bold text-foreground mb-4">Movimentações do Dia</h3>
        {isLoading ? (
          <div className="space-y-3">{Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : movs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Nenhuma movimentação registrada hoje.</p>
          </div>
        ) : (
          <div>
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-brand-border text-muted-foreground">
                      <th className="pb-3 font-medium">Tipo</th>
                      <th className="pb-3 font-medium">Descrição</th>
                      <th className="pb-3 font-medium text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movs.map(m => (
                      <tr key={m.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                        <td className="py-3">
                          {m.type === 'in' ? (
                            <span className="flex items-center gap-1 text-success text-xs font-medium"><ArrowUpRight className="w-4 h-4"/> Entrada</span>
                          ) : (
                            <span className="flex items-center gap-1 text-destructive text-xs font-medium"><ArrowDownRight className="w-4 h-4"/> Saída</span>
                          )}
                        </td>
                        <td className="py-3 text-muted-foreground">{m.description}</td>
                        <td className={`py-3 text-right font-medium ${m.type === 'in' ? 'text-success' : 'text-destructive'}`}>
                          {m.type === 'in' ? '+' : '-'}{brl(m.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {movs.map(m => (
                  <div key={m.id} className="p-3 bg-brand-bg border border-brand-border rounded-xl flex justify-between items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.description}</p>
                      {m.type === 'in' ? (
                        <span className="flex items-center gap-1 text-success text-xs font-medium mt-0.5"><ArrowUpRight className="w-3 h-3"/> Entrada</span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive text-xs font-medium mt-0.5"><ArrowDownRight className="w-3 h-3"/> Saída</span>
                      )}
                    </div>
                    <span className={`font-bold text-sm ml-2 shrink-0 ${m.type === 'in' ? 'text-success' : 'text-destructive'}`}>
                      {m.type === 'in' ? '+' : '-'}{brl(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </>
            <div className="mt-4 pt-4 border-t border-brand-border flex justify-end gap-6 text-sm">
              <div><span className="text-muted-foreground">Entradas:</span> <span className="text-success font-bold">{brl(totalIn)}</span></div>
              <div><span className="text-muted-foreground">Saídas:</span> <span className="text-destructive font-bold">{brl(totalOut)}</span></div>
              <div><span className="text-muted-foreground">Saldo:</span> <span className={`font-bold ${totalIn >= totalOut ? 'text-success' : 'text-destructive'}`}>{brl(totalIn - totalOut)}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}