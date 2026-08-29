import { useState, useEffect } from 'react';
import { useStore, brl, ClientSource } from '@/data/store';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, Search, UserPlus, Cake, MessageSquare, 
  Trash2, Eye, Calendar, DollarSign, Edit
} from 'lucide-react';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, 
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, 
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatDateKey, parseDateKey } from '@/data/date';

const TABS = ['Todos', 'Aniversariantes', 'Inativos', 'Origem / CAC'] as const;

export default function Clientes() {
  const { clients, addClient, updateClient, removeClient, addVisit, removeVisit, isLoading } = useStore();

  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Todos');
  const [search, setSearch] = useState('');
  
  const today = new Date();
  const currentMonth = formatDateKey(today).slice(5, 7);

  const bdaysCount = clients.filter(c => c.birthday?.slice(5, 7) === currentMonth).length;
  const inativosCount = clients.filter(c => {
    if (c.visits.length === 0) return false;
    const lastVisit = [...c.visits].sort((a,b) => b.date.localeCompare(a.date))[0].date;
    const daysSince = Math.floor((today.getTime() - parseDateKey(lastVisit).getTime()) / (1000 * 60 * 60 * 24));
    return daysSince > 45;
  }).length;

  let displayed = clients;
  if (search) {
    const s = search.toLowerCase();
    displayed = displayed.filter(c => c.name.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s) || c.whatsapp.includes(s));
  }
  
  const aniversariantes = clients.filter(c => c.birthday?.slice(5, 7) === currentMonth);
  const inativos = clients.map(c => {
    const lastV = c.visits.length > 0 ? [...c.visits].sort((a,b) => b.date.localeCompare(a.date))[0].date : null;
    const daysSince = lastV ? Math.floor((today.getTime() - parseDateKey(lastV).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    return { ...c, lastV, daysSince };
  }).filter(c => c.daysSince > 45);

  const origens = ['Indicação', 'Instagram', 'Google', 'Anúncio', 'Passou na rua', 'Outro'].map(origem => {
    const origClients = clients.filter(c => c.source === origem);
    const revenue = origClients.reduce((sum, c) => sum + c.visits.reduce((s, v) => s + v.amount, 0), 0);
    return { origem, count: origClients.length, revenue, ticket: origClients.length ? revenue / origClients.length : 0 };
  }).filter(o => o.count > 0).sort((a,b) => b.count - a.count);

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [form, setForm] = useState({ name: '', whatsapp: '', email: '', birthday: '', source: 'Indicação' as ClientSource, sourceOther: '', interest: 'barbearia' as const });

  const handleOpenEdit = (c: any) => {
    setEditingId(c.id);
    setForm({ name: c.name, whatsapp: c.whatsapp, email: c.email || '', birthday: c.birthday || '', source: c.source || 'Indicação', sourceOther: c.sourceOther || '', interest: c.interest || 'barbearia' });
    setIsOpen(true);
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setForm({ name: '', whatsapp: '', email: '', birthday: '', source: 'Indicação', sourceOther: '', interest: 'barbearia' });
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.whatsapp) { toast.error('Nome e WhatsApp são obrigatórios'); return; }
    if (form.source === 'Outro' && !form.sourceOther.trim()) { toast.error('Descreva a origem do cliente'); return; }
    if (editingId) { updateClient(editingId, form); toast.success('Cliente atualizado'); }
    else { addClient(form); toast.success('Cliente cadastrado'); }
    setIsOpen(false);
  };

  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [visitForm, setVisitForm] = useState({ date: formatDateKey(today), type: 'servico' as 'servico'|'produto', description: '', professional: '', amount: 0 });

  useEffect(() => {
    if (!selectedClient) return;
    const updated = clients.find(c => c.id === selectedClient.id);
    if (updated) setSelectedClient(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  const handleAddVisit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    addVisit(selectedClient.id, visitForm);
    toast.success('Visita registrada');
    setVisitForm({ date: formatDateKey(today), type: 'servico', description: '', professional: '', amount: 0 });
  };

  const sendWpp = (phone: string, text: string = '') => {
    window.open(`https://wa.me/55${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Clientes</h2>
          <p className="text-sm text-muted-foreground mt-1">{clients.length} cadastrados • {bdaysCount} aniversários • {inativosCount} inativos</p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <button onClick={handleOpenNew} className="bg-brand-gold text-brand-bg px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand-gold/90 flex items-center gap-2 transition-all">
              <UserPlus className="w-4 h-4" /> Novo Cliente
            </button>
          </DialogTrigger>
          <DialogContent className="bg-brand-surface border-brand-border text-foreground">
            <DialogHeader><DialogTitle>{editingId ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Nome *</label>
                <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:ring-1 focus:ring-brand-gold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">WhatsApp *</label>
                  <input type="text" required value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:ring-1 focus:ring-brand-gold" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Data Nasc.</label>
                  <input type="date" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:ring-1 focus:ring-brand-gold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:ring-1 focus:ring-brand-gold" />
                </div>
                  <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Origem</label>
                  <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as ClientSource }))} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:ring-1 focus:ring-brand-gold">
                     <option>Indicação</option><option>Instagram</option><option>Google</option><option>Facebook</option><option>Site</option><option>Passou na rua</option><option>Outro</option>
                  </select>
                </div>
              </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Interesse do cliente *</label>
                  <select required value={form.interest} onChange={e => setForm(f => ({ ...f, interest: e.target.value as typeof form.interest }))} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:ring-1 focus:ring-brand-gold">
                    <option value="barbearia">Barbearia</option><option value="salao">Salão de Beleza</option><option value="protese">Prótese Capilar</option>
                  </select>
                </div>
                {form.source === 'Outro' && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Qual foi a origem? *</label>
                    <input required type="text" value={form.sourceOther} onChange={e => setForm(f => ({ ...f, sourceOther: e.target.value }))} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:ring-1 focus:ring-brand-gold" placeholder="Ex.: indicação de parceiro" />
                  </div>
                )}
              <button type="submit" className="w-full bg-brand-gold text-brand-bg font-bold py-2 rounded-lg hover:bg-brand-gold/90 transition-all">Salvar Cliente</button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex border-b border-brand-border overflow-x-auto hide-scrollbar">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab ? 'border-brand-gold text-brand-gold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
        {isLoading ? (
          <div className="space-y-3">{Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <>
            {activeTab === 'Todos' && (
              <div className="space-y-4">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" placeholder="Buscar por nome, email ou whatsapp..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-brand-bg border border-brand-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground focus:ring-1 focus:ring-brand-gold outline-none transition-all" />
                </div>
                
                {displayed.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">Nenhum cliente encontrado</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-brand-border text-muted-foreground">
                            <th className="pb-3 font-medium">Nome</th>
                            <th className="pb-3 font-medium">WhatsApp</th>
                            <th className="pb-3 font-medium">Última Visita</th>
                            <th className="pb-3 font-medium">Ticket Médio</th>
                            <th className="pb-3 font-medium text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayed.map(c => {
                            const lastV = c.visits.length > 0 ? [...c.visits].sort((a,b) => b.date.localeCompare(a.date))[0].date : '-';
                            const total = c.visits.reduce((s, v) => s + v.amount, 0);
                            const tkm = c.visits.length ? total / c.visits.length : 0;
                            const isBday = c.birthday?.slice(5,7) === currentMonth;

                            return (
                              <tr key={c.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                                <td className="py-3 font-medium flex items-center gap-2">
                                  {c.name} {isBday && <Cake className="w-3 h-3 text-brand-gold" aria-label="Aniversário este mês" />}
                                </td>
                                <td className="py-3 text-muted-foreground">{c.whatsapp}</td>
                                <td className="py-3 text-muted-foreground">{lastV && lastV !== '-' ? lastV.split('-').reverse().join('/') : '-'}</td>
                                <td className="py-3">{brl(tkm)}</td>
                                <td className="py-3 text-right">
                                  <div className="flex justify-end gap-2">
                                    <Dialog>
                                      <DialogTrigger asChild>
                                        <button onClick={() => setSelectedClient(c)} aria-label={`Ver ficha de ${c.name}`} className="p-2 text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all hover:scale-105"><Eye className="w-4 h-4" /></button>
                                      </DialogTrigger>
                                      <DialogContent className="bg-brand-surface border-brand-border text-foreground max-w-2xl max-h-[85vh] overflow-y-auto">
                                        <DialogHeader><DialogTitle>Ficha do Cliente: {selectedClient?.name}</DialogTitle></DialogHeader>
                                        {selectedClient && (
                                          <div className="space-y-6 pt-4">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-brand-bg p-4 rounded-xl border border-brand-border">
                                              <div><p className="text-xs text-muted-foreground">Total Visitas</p><p className="font-bold text-lg">{selectedClient.visits.length}</p></div>
                                              <div><p className="text-xs text-muted-foreground">Total Gasto</p><p className="font-bold text-lg text-success">{brl(selectedClient.visits.reduce((s:any, v:any) => s + v.amount, 0))}</p></div>
                                              <div><p className="text-xs text-muted-foreground">Ticket Médio</p><p className="font-bold text-lg">{brl(selectedClient.visits.length ? selectedClient.visits.reduce((s:any, v:any) => s + v.amount, 0) / selectedClient.visits.length : 0)}</p></div>
                                              <div><p className="text-xs text-muted-foreground">Cadastrado em</p><p className="font-bold text-lg">{selectedClient.createdAt.split('-').reverse().join('/')}</p></div>
                                            </div>
                                            <div>
                                              <h4 className="font-bold mb-3">Adicionar Visita Manual</h4>
                                              <form onSubmit={handleAddVisit} className="flex flex-wrap gap-2 items-end bg-brand-bg p-4 rounded-xl border border-brand-border">
                                                <div><label className="text-[10px] uppercase">Data</label><input type="date" required value={visitForm.date} onChange={e => setVisitForm(f => ({...f, date: e.target.value}))} className="w-full bg-brand-surface border border-brand-border rounded px-2 py-1 text-sm outline-none" /></div>
                                                <div><label className="text-[10px] uppercase">Tipo</label><select value={visitForm.type} onChange={e => setVisitForm(f => ({...f, type: e.target.value as 'servico'|'produto'}))} className="w-full bg-brand-surface border border-brand-border rounded px-2 py-1 text-sm outline-none"><option value="servico">Serviço</option><option value="produto">Produto</option></select></div>
                                                <div className="flex-1"><label className="text-[10px] uppercase">Descrição</label><input type="text" required value={visitForm.description} onChange={e => setVisitForm(f => ({...f, description: e.target.value}))} className="w-full bg-brand-surface border border-brand-border rounded px-2 py-1 text-sm outline-none" /></div>
                                                <div className="w-24"><label className="text-[10px] uppercase">Valor</label><input type="number" required value={visitForm.amount} onChange={e => setVisitForm(f => ({...f, amount: Number(e.target.value)}))} className="w-full bg-brand-surface border border-brand-border rounded px-2 py-1 text-sm outline-none" /></div>
                                                <button type="submit" className="bg-brand-gold text-brand-bg px-3 py-1.5 rounded text-sm font-bold">Salvar</button>
                                              </form>
                                            </div>
                                            <div>
                                              <h4 className="font-bold mb-3">Histórico</h4>
                                              <div className="space-y-2">
                                                {selectedClient.visits.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma visita registrada.</p> :
                                                  [...selectedClient.visits].sort((a,b) => b.date.localeCompare(a.date)).map((v:any) => (
                                                    <div key={v.id} className="flex justify-between items-center p-3 border border-brand-border/50 rounded-lg">
                                                      <div>
                                                        <p className="text-sm font-medium">{v.description}</p>
                                                        <p className="text-xs text-muted-foreground">{v.date.split('-').reverse().join('/')} • {v.type}</p>
                                                      </div>
                                                      <div className="flex items-center gap-3">
                                                        <span className="font-bold">{brl(v.amount)}</span>
                                                        <button aria-label="Remover visita" onClick={() => { removeVisit(selectedClient.id, v.id); toast.success('Removido'); }} className="text-destructive hover:bg-destructive/10 p-1 rounded transition-all hover:scale-105"><Trash2 className="w-4 h-4"/></button>
                                                      </div>
                                                    </div>
                                                  ))
                                                }
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </DialogContent>
                                    </Dialog>
                                    <button onClick={() => handleOpenEdit(c)} aria-label={`Editar ${c.name}`} className="p-2 text-muted-foreground hover:text-foreground hover:bg-brand-bg rounded-lg transition-all hover:scale-105"><Edit className="w-4 h-4" /></button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild><button aria-label={`Excluir ${c.name}`} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-all hover:scale-105"><Trash2 className="w-4 h-4" /></button></AlertDialogTrigger>
                                      <AlertDialogContent className="bg-brand-surface border-brand-border text-foreground">
                                        <AlertDialogHeader><AlertDialogTitle>Excluir cliente?</AlertDialogTitle><AlertDialogDescription>Excluirá todo o histórico de visitas também.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border">Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => {removeClient(c.id); toast.success('Excluído');}} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction></AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
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
                      {displayed.map(c => {
                        const lastV = c.visits.length > 0 ? [...c.visits].sort((a,b) => b.date.localeCompare(a.date))[0].date : null;
                        const total = c.visits.reduce((s, v) => s + v.amount, 0);
                        const tkm = c.visits.length ? total / c.visits.length : 0;
                        const isBday = c.birthday?.slice(5,7) === currentMonth;
                        return (
                          <div key={c.id} className="p-4 bg-brand-bg border border-brand-border rounded-xl">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-bold text-sm flex items-center gap-1">
                                  {c.name} {isBday && <Cake className="w-3 h-3 text-brand-gold" aria-label="Aniversário este mês" />}
                                </p>
                                <p className="text-xs text-muted-foreground">{c.whatsapp}</p>
                              </div>
                              <div className="flex gap-1">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <button onClick={() => setSelectedClient(c)} aria-label={`Ver ficha de ${c.name}`} className="p-1.5 text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all hover:scale-105"><Eye className="w-4 h-4" /></button>
                                  </DialogTrigger>
                                  <DialogContent className="bg-brand-surface border-brand-border text-foreground max-w-2xl max-h-[85vh] overflow-y-auto">
                                    <DialogHeader><DialogTitle>Ficha: {selectedClient?.name}</DialogTitle></DialogHeader>
                                    {selectedClient && (
                                      <div className="space-y-4 pt-4">
                                        <div className="grid grid-cols-2 gap-3 bg-brand-bg p-4 rounded-xl border border-brand-border">
                                          <div><p className="text-xs text-muted-foreground">Visitas</p><p className="font-bold">{selectedClient.visits.length}</p></div>
                                          <div><p className="text-xs text-muted-foreground">Total Gasto</p><p className="font-bold text-success">{brl(selectedClient.visits.reduce((s:any, v:any) => s + v.amount, 0))}</p></div>
                                        </div>
                                        <p className="text-sm text-muted-foreground">Histórico de visitas disponível na versão desktop.</p>
                                      </div>
                                    )}
                                  </DialogContent>
                                </Dialog>
                                <button onClick={() => handleOpenEdit(c)} aria-label={`Editar ${c.name}`} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-brand-bg rounded-lg transition-all hover:scale-105"><Edit className="w-4 h-4" /></button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild><button aria-label={`Excluir ${c.name}`} className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-all hover:scale-105"><Trash2 className="w-4 h-4" /></button></AlertDialogTrigger>
                                  <AlertDialogContent className="bg-brand-surface border-brand-border text-foreground">
                                    <AlertDialogHeader><AlertDialogTitle>Excluir cliente?</AlertDialogTitle><AlertDialogDescription>Excluirá todo o histórico.</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border">Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => {removeClient(c.id); toast.success('Excluído');}} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction></AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                              <span>Última: {lastV ? lastV.split('-').reverse().join('/') : 'Nunca'}</span>
                              <span>Ticket: <span className="font-bold text-foreground">{brl(tkm)}</span></span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'Aniversariantes' && (
              <div>
                {aniversariantes.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Cake className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">Nenhum aniversariante este mês</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {aniversariantes.map(c => (
                      <div key={c.id} className="p-4 border border-brand-border rounded-xl bg-brand-bg flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold">{c.name}</p>
                            <p className="text-sm text-brand-gold mt-1"><Cake className="w-3 h-3 inline mr-1" /> {c.birthday?.split('-').reverse().slice(0,2).join('/')}</p>
                          </div>
                        </div>
                        <button onClick={() => sendWpp(c.whatsapp, `Olá ${c.name}! A Barbearia deseja um feliz aniversário! Temos um presente para você...`)} className="w-full bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 font-medium py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
                          <MessageSquare className="w-4 h-4" /> Enviar Parabéns
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'Inativos' && (
              <div>
                {inativos.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">Nenhum cliente inativo (+45 dias)</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-brand-border text-muted-foreground">
                            <th className="pb-3 font-medium">Nome</th>
                            <th className="pb-3 font-medium">Última Visita</th>
                            <th className="pb-3 font-medium">Dias Inativo</th>
                            <th className="pb-3 font-medium text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inativos.sort((a,b) => b.daysSince - a.daysSince).map(c => (
                            <tr key={c.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                              <td className="py-3 font-medium">{c.name}</td>
                              <td className="py-3">{c.lastV?.split('-').reverse().join('/')}</td>
                              <td className="py-3 text-destructive font-bold">{c.daysSince} dias</td>
                              <td className="py-3 text-right">
                                <button onClick={() => sendWpp(c.whatsapp, `Olá ${c.name}! Sentimos sua falta na barbearia. Que tal agendar um horário esta semana?`)} className="bg-brand-bg border border-brand-border hover:bg-brand-border px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-2 transition-colors">
                                  <MessageSquare className="w-3 h-3" /> Reativar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile cards */}
                    <div className="md:hidden space-y-3">
                      {inativos.sort((a,b) => b.daysSince - a.daysSince).map(c => (
                        <div key={c.id} className="p-4 bg-brand-bg border border-brand-border rounded-xl flex justify-between items-center">
                          <div>
                            <p className="font-bold text-sm">{c.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Última: {c.lastV?.split('-').reverse().join('/')}</p>
                            <p className="text-xs text-destructive font-bold mt-0.5">{c.daysSince} dias inativo</p>
                          </div>
                          <button onClick={() => sendWpp(c.whatsapp, `Olá ${c.name}! Sentimos sua falta na barbearia. Que tal agendar um horário esta semana?`)} aria-label={`Reativar contato com ${c.name}`} className="p-2 text-[#25D366] hover:bg-[#25D366]/10 rounded-lg transition-colors shrink-0">
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'Origem / CAC' && (
              <div>
                {origens.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">Sem dados de origem</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {origens.map(o => (
                      <div key={o.origem} className="p-4 border border-brand-border rounded-xl bg-brand-bg flex flex-col gap-4">
                        <div className="flex justify-between items-center border-b border-brand-border/50 pb-2">
                          <h4 className="font-bold text-lg">{o.origem}</h4>
                          <span className="bg-brand-gold/10 text-brand-gold px-2 py-1 rounded text-xs font-bold">{o.count} clientes</span>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase">Receita Total</p>
                          <p className="text-xl font-bold text-success">{brl(o.revenue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase">Ticket Médio por Cliente</p>
                          <p className="text-lg font-bold">{brl(o.ticket)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
