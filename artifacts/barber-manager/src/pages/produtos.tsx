import { useState } from 'react';
import { useStore, brl, productStatus, Product } from '@/data/store';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Plus, Trash2, Edit2, Check, X, AlertTriangle, ArrowUp, CheckCircle2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function Produtos() {
  const { products, addProduct, updateProduct, removeProduct, restock, isLoading } = useStore();

  const totalItems = products.length;
  const totalValue = products.reduce((s, p) => s + (p.cost * p.stock), 0);
  const okItems = products.filter(p => productStatus(p) === 'ok').length;
  const alertItems = products.filter(p => productStatus(p) !== 'ok').length;

  const [isAdding, setIsAdding] = useState(false);
  const [newP, setNewP] = useState({ name: '', category: '', price: '', cost: '', stock: '', minStock: '' });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newP.name || !newP.price || !newP.cost) { toast.error('Preencha os campos obrigatórios'); return; }
    addProduct({
      name: newP.name, category: newP.category || 'Geral', price: Number(newP.price), cost: Number(newP.cost),
      stock: Number(newP.stock)||0, minStock: Number(newP.minStock)||0, isActive: true
    });
    toast.success('Produto adicionado');
    setIsAdding(false);
    setNewP({ name: '', category: '', price: '', cost: '', stock: '', minStock: '' });
  };

  const [editingId, setEditingId] = useState<string|null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const startEdit = (p: Product) => { setEditingId(p.id); setEditForm({ ...p }); };
  const cancelEdit = () => { setEditingId(null); };
  const saveEdit = () => {
    updateProduct(editingId!, { name: editForm.name, category: editForm.category, price: Number(editForm.price), cost: Number(editForm.cost), minStock: Number(editForm.minStock) });
    toast.success('Salvo');
    setEditingId(null);
  };

  const [restockQs, setRestockQs] = useState<Record<string, string>>({});
  const handleRestock = (id: string) => {
    const q = Number(restockQs[id]);
    if(q > 0) { restock(id, q); toast.success('Estoque atualizado'); setRestockQs({...restockQs, [id]: ''}); }
  };

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-foreground">Produtos & Estoque</h2>
        {!isAdding && <button onClick={() => setIsAdding(true)} className="bg-brand-gold text-brand-bg px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand-gold/90 flex items-center gap-2 transition-all"><Plus className="w-4 h-4"/> Adicionar Produto</button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-brand-surface border border-brand-border p-4 rounded-xl"><p className="text-xs text-muted-foreground uppercase">Total Produtos</p><p className="text-2xl font-bold mt-1">{totalItems}</p></div>
        <div className="bg-brand-surface border border-brand-border p-4 rounded-xl"><p className="text-xs text-muted-foreground uppercase">Valor em Estoque</p><p className="text-2xl font-bold mt-1 text-brand-gold">{brl(totalValue)}</p></div>
        <div className="bg-brand-surface border border-success/30 p-4 rounded-xl"><p className="text-xs text-success uppercase">Estoque OK</p><p className="text-2xl font-bold mt-1 text-success">{okItems}</p></div>
        <div className="bg-brand-surface border border-destructive/30 p-4 rounded-xl"><p className="text-xs text-destructive uppercase">Em Alerta</p><p className="text-2xl font-bold mt-1 text-destructive">{alertItems}</p></div>
      </div>

      <div className={`md:hidden flex items-center gap-3 rounded-2xl border p-4 ${alertItems > 0 ? 'border-destructive/25 bg-destructive/10' : 'border-success/25 bg-success/10'}`}>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${alertItems > 0 ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success'}`}>
          {alertItems > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-foreground">{alertItems > 0 ? `${alertItems} produto${alertItems !== 1 ? 's' : ''} precisam de atenção` : 'Estoque saudável'}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {alertItems > 0 ? `${products.filter(p => productStatus(p) === 'critical').length} crítico(s) e ${products.filter(p => productStatus(p) === 'low').length} baixo(s)` : `Todos os ${totalItems} produtos estão em nível adequado`}
          </p>
        </div>
      </div>

      {isAdding && (
        <div className="bg-brand-bg border border-brand-gold p-4 rounded-xl shadow-[0_0_15px_rgba(201,168,76,0.1)]">
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-7 gap-4 items-end">
            <div className="md:col-span-2"><label className="text-[10px] uppercase text-muted-foreground">Nome</label><input required type="text" value={newP.name} onChange={e=>setNewP({...newP,name:e.target.value})} className="w-full bg-brand-surface border border-brand-border rounded px-3 py-2 text-sm outline-none" autoFocus/></div>
            <div><label className="text-[10px] uppercase text-muted-foreground">Categoria</label><input type="text" value={newP.category} onChange={e=>setNewP({...newP,category:e.target.value})} className="w-full bg-brand-surface border border-brand-border rounded px-3 py-2 text-sm outline-none" /></div>
            <div><label className="text-[10px] uppercase text-muted-foreground">Preço Venda (R$)</label><input required type="number" step="0.01" value={newP.price} onChange={e=>setNewP({...newP,price:e.target.value})} className="w-full bg-brand-surface border border-brand-border rounded px-3 py-2 text-sm outline-none" /></div>
            <div><label className="text-[10px] uppercase text-muted-foreground">Custo (R$)</label><input required type="number" step="0.01" value={newP.cost} onChange={e=>setNewP({...newP,cost:e.target.value})} className="w-full bg-brand-surface border border-brand-border rounded px-3 py-2 text-sm outline-none" /></div>
            <div><label className="text-[10px] uppercase text-muted-foreground">Estoque Inicial</label><input type="number" value={newP.stock} onChange={e=>setNewP({...newP,stock:e.target.value})} className="w-full bg-brand-surface border border-brand-border rounded px-3 py-2 text-sm outline-none" /></div>
            <div><label className="text-[10px] uppercase text-muted-foreground">Estoque Min.</label><input type="number" value={newP.minStock} onChange={e=>setNewP({...newP,minStock:e.target.value})} className="w-full bg-brand-surface border border-brand-border rounded px-3 py-2 text-sm outline-none" /></div>
            <div className="md:col-span-7 flex justify-end gap-2 mt-2">
              <button type="button" onClick={()=>setIsAdding(false)} className="px-4 py-2 text-sm hover:bg-brand-surface rounded">Cancelar</button>
              <button type="submit" className="bg-brand-gold text-brand-bg px-6 py-2 rounded text-sm font-bold">Salvar Produto</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
        {isLoading ? <div className="space-y-3">{Array.from({length: 5}).map((_,i)=><Skeleton key={i} className="h-12 w-full"/>)}</div> : products.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground"><Package className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>Nenhum produto</p></div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead><tr className="border-b border-brand-border text-muted-foreground"><th className="pb-3">Produto</th><th className="pb-3">Categoria</th><th className="pb-3">Venda</th><th className="pb-3">Custo</th><th className="pb-3">Margem</th><th className="pb-3">Estoque</th><th className="pb-3">Reposição</th><th className="pb-3 text-right">Ações</th></tr></thead>
                <tbody>
                  {products.map(p => {
                    const isEd = editingId === p.id;
                    const st = productStatus(p);
                    const stClass = st === 'critical' ? 'text-destructive bg-destructive/10' : st === 'low' ? 'text-warning bg-warning/10' : 'text-success bg-success/10';
                    const margem = p.cost > 0 ? ((p.price - p.cost) / p.price) * 100 : 100;
                    return (
                      <tr key={p.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                        <td className="py-3">{isEd ? <input className="bg-brand-bg border border-brand-border rounded px-2 py-1 w-32 outline-none" value={editForm.name} onChange={e=>setEditForm({...editForm,name:e.target.value})} /> : <span className="font-medium">{p.name}</span>}</td>
                        <td className="py-3">{isEd ? <input className="bg-brand-bg border border-brand-border rounded px-2 py-1 w-24 outline-none" value={editForm.category} onChange={e=>setEditForm({...editForm,category:e.target.value})} /> : <span className="text-muted-foreground">{p.category}</span>}</td>
                        <td className="py-3">{isEd ? <input type="number" className="bg-brand-bg border border-brand-border rounded px-2 py-1 w-20 outline-none" value={editForm.price} onChange={e=>setEditForm({...editForm,price:e.target.value})} /> : brl(p.price)}</td>
                        <td className="py-3">{isEd ? <input type="number" className="bg-brand-bg border border-brand-border rounded px-2 py-1 w-20 outline-none" value={editForm.cost} onChange={e=>setEditForm({...editForm,cost:e.target.value})} /> : brl(p.cost)}</td>
                        <td className="py-3 text-muted-foreground">{Math.round(margem)}%</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap ${stClass}`}>
                            {p.stock} {isEd ? <> / <input type="number" className="bg-brand-bg border border-brand-border rounded px-1 py-0.5 w-12 outline-none inline text-foreground ml-1" value={editForm.minStock} onChange={e=>setEditForm({...editForm,minStock:e.target.value})} /></> : <span className="opacity-70 font-normal">/ min {p.minStock}</span>}
                          </span>
                        </td>
                        <td className="py-3">
                          {!isEd && (
                            <div className="flex items-center gap-1">
                              <input type="number" min="1" placeholder="+Qtd" value={restockQs[p.id]||''} onChange={e=>setRestockQs({...restockQs, [p.id]: e.target.value})} className="bg-brand-bg border border-brand-border rounded px-2 py-1 w-16 text-xs outline-none" />
                              <button aria-label="Repor estoque" onClick={()=>handleRestock(p.id)} className="p-1 bg-brand-gold/10 text-brand-gold rounded hover:bg-brand-gold hover:text-brand-bg transition-all hover:scale-105"><ArrowUp className="w-3.5 h-3.5"/></button>
                            </div>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {isEd ? (
                            <div className="flex justify-end gap-1">
                              <button aria-label="Confirmar edição" onClick={saveEdit} className="p-1.5 text-success hover:bg-success/10 rounded transition-all hover:scale-105"><Check className="w-4 h-4"/></button>
                              <button aria-label="Cancelar edição" onClick={cancelEdit} className="p-1.5 text-muted-foreground hover:bg-brand-bg rounded transition-all hover:scale-105"><X className="w-4 h-4"/></button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <button aria-label={`Editar ${p.name}`} onClick={()=>startEdit(p)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-brand-bg rounded transition-all hover:scale-105"><Edit2 className="w-4 h-4"/></button>
                              <AlertDialog><AlertDialogTrigger asChild><button aria-label={`Excluir ${p.name}`} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-all hover:scale-105"><Trash2 className="w-4 h-4"/></button></AlertDialogTrigger><AlertDialogContent className="bg-brand-surface border-brand-border text-foreground"><AlertDialogHeader><AlertDialogTitle>Excluir produto?</AlertDialogTitle><AlertDialogDescription>Deseja excluir este produto?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border text-foreground">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={()=>{removeProduct(p.id);toast.success('Excluído');}}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {products.map(p => {
                const st = productStatus(p);
                const stClass = st === 'critical' ? 'text-destructive bg-destructive/10' : st === 'low' ? 'text-warning bg-warning/10' : 'text-success bg-success/10';
                const margem = p.cost > 0 ? ((p.price - p.cost) / p.price) * 100 : 100;
                const stockColor = st === 'critical' ? 'bg-destructive' : st === 'low' ? 'bg-warning' : 'bg-success';
                const stockRatio = Math.min(p.stock / (Math.max(p.stock, p.minStock) * 1.5 || 5), 1) * 100;
                return (
                  <div key={p.id} className={`p-4 bg-brand-bg border border-brand-border rounded-xl border-l-[3px] ${st === 'critical' ? 'border-l-destructive' : st === 'low' ? 'border-l-warning' : 'border-l-success'}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-bold text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.category}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${stClass}`}>{p.stock} un.</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div><p className="text-muted-foreground">Venda</p><p className="font-bold">{brl(p.price)}</p></div>
                      <div><p className="text-muted-foreground">Custo</p><p className="font-bold">{brl(p.cost)}</p></div>
                      <div><p className="text-muted-foreground">Margem</p><p className="font-bold">{Math.round(margem)}%</p></div>
                    </div>
                    <div className="mb-3">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Nível de estoque</span>
                        <span>{p.stock} / {p.minStock} mín.</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-brand-surface">
                        <div className={`h-full rounded-full ${stockColor}`} style={{ width: `${stockRatio}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-brand-border/50">
                      <div className="flex items-center gap-1">
                        <input type="number" min="1" placeholder="+Qtd" value={restockQs[p.id]||''} onChange={e=>setRestockQs({...restockQs, [p.id]: e.target.value})} className="bg-brand-surface border border-brand-border rounded px-2 py-1 w-16 text-xs outline-none" />
                        <button aria-label="Repor estoque" onClick={()=>handleRestock(p.id)} className="p-1.5 bg-brand-gold/10 text-brand-gold rounded hover:bg-brand-gold hover:text-brand-bg transition-all"><ArrowUp className="w-3.5 h-3.5"/></button>
                      </div>
                      <div className="flex gap-1">
                        <button aria-label={`Editar ${p.name}`} onClick={()=>startEdit(p)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-brand-surface rounded transition-all hover:scale-105"><Edit2 className="w-4 h-4"/></button>
                        <AlertDialog><AlertDialogTrigger asChild><button aria-label={`Excluir ${p.name}`} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-all hover:scale-105"><Trash2 className="w-4 h-4"/></button></AlertDialogTrigger><AlertDialogContent className="bg-brand-surface border-brand-border text-foreground"><AlertDialogHeader><AlertDialogTitle>Excluir produto?</AlertDialogTitle><AlertDialogDescription>Deseja excluir?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="bg-brand-bg border-brand-border text-foreground">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={()=>{removeProduct(p.id);toast.success('Excluído');}}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
