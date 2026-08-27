import { useState, useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useStore, ServiceItem, RoleItem, PayMethod, PAY_LABELS } from '@/data/store';
import { Settings, Building, Users, Shield, Link as LinkIcon, Plus, Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_ROUTES } from '@/auth/roles';
import { Link } from 'wouter';
import { useLocation } from 'wouter';

export default function Configuracoes() {
  const [location] = useLocation();
  const section = location.startsWith('/configuracoes/') ? location.split('/')[2] : '';
  const showSection = (name: string) => !section || section === name;
  const { config, updateConfig, professionals, updateProfessional, products, updateProduct, addProduct, isLoading } = useStore();
  const [formData, setFormData] = useState({ name: '', address: '', cnpj: '', logo: '' });
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [expandedProfId, setExpandedProfId] = useState<string|null>(null);
  const [serviceDrafts, setServiceDrafts] = useState<ServiceItem[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<RoleItem[]>([]);
  const [newService, setNewService] = useState({ name: '', category: 'Barbearia', price: '', duration: '30' });
  const [newRole, setNewRole] = useState({ label: '', description: '' });
  const [newPayment, setNewPayment] = useState('');

  useEffect(() => {
    setFormData({
      name: config.name || '',
      address: config.address || '',
      cnpj: config.cnpj || '',
      logo: config.logo || ''
    });
    setServiceDrafts(config.services);
    setRoleDrafts(config.roles);
  }, [config]);

  const saveServices = () => { updateConfig({ services: serviceDrafts }); toast.success('Catálogo de serviços salvo.'); };
  const addService = () => {
    if (!newService.name.trim()) { toast.error('Informe o nome do serviço'); return; }
    const item: ServiceItem = {
      id: `service-${crypto.randomUUID()}`, name: newService.name.trim(), category: newService.category,
      price: Number(newService.price) || 0, duration: Number(newService.duration) || config.defaultServiceDuration,
      commissionKey: newService.category.toLowerCase().includes('prótese') ? 'protese' : 'barbearia',
      isActive: true, sortOrder: serviceDrafts.length + 1,
    };
    setServiceDrafts(items => [...items, item]);
    setNewService({ name: '', category: 'Barbearia', price: '', duration: '30' });
  };
  const addRole = () => {
    if (!newRole.label.trim()) { toast.error('Informe o nome do cargo'); return; }
    setRoleDrafts(items => [...items, { id: `role-${crypto.randomUUID()}`, key: newRole.label.toLowerCase().replace(/\s+/g, '-'), label: newRole.label.trim(), description: newRole.description.trim(), isActive: true }]);
    setNewRole({ label: '', description: '' });
  };
  const saveRoles = () => { updateConfig({ roles: roleDrafts }); toast.success('Cargos salvos.'); };
  const removeRole = (role: RoleItem) => {
    if (!window.confirm(`Excluir o cargo "${role.label}"?`)) return;
    setRoleDrafts(items => items.filter(item => item.id !== role.id));
  };
  const addPayment = () => {
    const key = newPayment.trim().toLowerCase().replace(/\s+/g, '-') as PayMethod;
    if (!key) return;
    if (config.paymentMethods.some(p => p.key === key)) { toast.error('Essa forma já existe'); return; }
    updateConfig({ paymentMethods: [...config.paymentMethods, { key, label: newPayment.trim(), isActive: true }] });
    setNewPayment('');
  };
  const removePayment = (key: string, label: string) => {
    if (!window.confirm(`Excluir a forma de pagamento "${label}"?`)) return;
    updateConfig({ paymentMethods: config.paymentMethods.filter(item => item.key !== key) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig(formData);
    toast.success('Configurações salvas com sucesso.');
  };

  const handleLogoChange = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem válida.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFormData(current => ({ ...current, logo: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const activeProfs = professionals.filter(p => p.isActive);

  if (isLoading) return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-8">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-8">
      <div className="sticky top-0 z-10 -mx-5 md:-mx-8 px-5 md:px-8 border-b border-brand-border pb-5 bg-brand-bg/95 backdrop-blur-md">
        <div className="flex items-center gap-4">
        <div className="p-3 bg-brand-surface border border-brand-border rounded-xl text-brand-gold shadow-sm">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">Configurações</h2>
          <p className="text-sm text-muted-foreground mt-1">Gerencie os dados base da sua barbearia</p>
        </div>
        </div>
        <nav className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pb-1" aria-label="Seções de configurações">
          {[
            ['estabelecimento', 'Dados do Estabelecimento'],
            ['equipe', 'Equipe e Comissões'],
            ['servicos', 'Catálogo de Serviços'],
            ['produtos', 'Produtos'],
            ['cargos-pagamentos', 'Cargos e Pagamentos'],
            ['acesso', 'Papéis e Acesso'],
          ].map(([id, label]) => (
            <Link key={id} href={`/configuracoes/${id}`} className={`min-w-0 min-h-11 flex items-center justify-center text-center whitespace-normal leading-tight rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${section === id ? 'border-brand-gold/50 text-brand-gold bg-brand-gold/10' : 'border-brand-border bg-brand-surface text-muted-foreground hover:border-brand-gold/50 hover:text-brand-gold'}`}>
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Estabelecimento */}
      {showSection('estabelecimento') && <form id="estabelecimento" onSubmit={handleSubmit} className="scroll-mt-24 bg-brand-surface border border-brand-border rounded-2xl p-6 md:p-8 space-y-8 shadow-sm">
        <div className="flex items-center gap-3 border-b border-brand-border/50 pb-4">
          <Building className="w-5 h-5 text-brand-gold" />
          <h3 className="text-lg font-bold text-foreground">Dados do Estabelecimento</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="md:col-span-2 flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-brand-border bg-brand-bg p-4">
             <div className="w-24 h-24 shrink-0 rounded-xl border border-brand-border bg-brand-surface flex items-center justify-center overflow-hidden text-muted-foreground">
               {formData.logo ? <img src={formData.logo} alt="Logo do estabelecimento" className="w-full h-full object-contain" /> : <ImageIcon className="w-8 h-8" />}
             </div>
             <div className="text-center sm:text-left">
               <label className="text-sm font-semibold text-foreground">Foto do Estabelecimento</label>
               <p className="text-xs text-muted-foreground mt-1">Essa imagem será usada como identificação da sua barbearia.</p>
               <button type="button" onClick={() => logoInputRef.current?.click()} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-border text-sm font-semibold hover:border-brand-gold hover:text-brand-gold transition-colors">
                 <Upload className="w-4 h-4" /> Escolher foto
               </button>
               <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => handleLogoChange(event.target.files?.[0])} />
               <p className="text-xs text-muted-foreground mt-2">PNG, JPG ou WEBP · máximo de 2 MB · clique em Salvar Alterações para confirmar</p>
             </div>
           </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground uppercase tracking-wide text-xs">Nome do Estabelecimento</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
              className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold text-foreground placeholder:text-muted-foreground transition-all"
              placeholder="Ex: Barber Manager"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground uppercase tracking-wide text-xs">CNPJ</label>
            <input 
              type="text" 
              value={formData.cnpj}
              onChange={(e) => setFormData(p => ({ ...p, cnpj: e.target.value }))}
              className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold text-foreground placeholder:text-muted-foreground transition-all"
              placeholder="00.000.000/0001-00"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-foreground uppercase tracking-wide text-xs">Endereço Completo</label>
            <input 
              type="text" 
              value={formData.address}
              onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))}
              className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold text-foreground placeholder:text-muted-foreground transition-all"
              placeholder="Rua, Número, Bairro, Cidade - Estado"
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button 
            type="submit"
            className="bg-brand-gold text-brand-bg font-bold py-2.5 px-8 rounded-lg hover:bg-brand-gold/90 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-[0_0_15px_rgba(201,168,76,0.15)]"
          >
            Salvar Alterações
          </button>
        </div>
      </form>}

      {/* Equipe e Comissões */}
      {showSection('equipe') && <div id="equipe" className="scroll-mt-24 bg-brand-surface border border-brand-border rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-brand-border/50 pb-4">
          <Users className="w-5 h-5 text-brand-gold" />
          <h3 className="text-lg font-bold text-foreground">Equipe e Comissões Rápida</h3>
        </div>
        <p className="text-sm text-muted-foreground">Clique num profissional para ajustar as comissões. As edições são salvas automaticamente ao fechar.</p>
        
        <div className="space-y-3">
          {activeProfs.map(p => (
            <div key={p.id} className="border border-brand-border rounded-xl bg-brand-bg overflow-hidden">
              <button
                type="button"
                aria-expanded={expandedProfId === p.id}
                aria-controls={`commissions-${p.id}`}
                aria-label={`${expandedProfId === p.id ? 'Fechar comissões de' : 'Editar comissões de'} ${p.name}`}
                className="w-full p-4 flex justify-between items-center hover:bg-brand-border/20 transition-colors text-left"
                onClick={() => setExpandedProfId(expandedProfId === p.id ? null : p.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{backgroundColor: p.color}}>{p.initials}</div>
                  <span className="font-bold">{p.name}</span>
                  <span className="text-xs bg-brand-surface border border-brand-border px-2 py-0.5 rounded capitalize text-muted-foreground">{p.role}</span>
                </div>
                <span className="text-xs text-brand-gold font-medium">{expandedProfId === p.id ? 'Fechar' : 'Editar Comissões'}</span>
              </button>
              
              {expandedProfId === p.id && (
                <div className="p-4 pt-0 border-t border-brand-border/50 bg-brand-bg">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                    {Object.entries(p.commissions).map(([key, val]) => (
                      <div key={key}>
                        <label className="text-[10px] text-muted-foreground uppercase">{key}</label>
                        <div className="flex items-center mt-1 bg-brand-surface border border-brand-border rounded px-2">
                          <input 
                            type="number" min="0" max="100" 
                            value={Math.round(val * 100)} 
                            onChange={e => updateProfessional(p.id, { commissions: {...p.commissions, [key]: Number(e.target.value)/100} })} 
                            className="w-full bg-transparent py-1 text-sm outline-none" 
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>}

      {/* Catálogo de serviços */}
      {showSection('servicos') && <div id="servicos" className="scroll-mt-24 bg-brand-surface border border-brand-border rounded-2xl p-6 md:p-8 space-y-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-brand-border/50 pb-4">
          <div>
            <h3 className="text-lg font-bold text-foreground">Catálogo de Serviços</h3>
            <p className="text-sm text-muted-foreground mt-1">Preços e durações usados na agenda e no controle diário.</p>
          </div>
          <button type="button" onClick={saveServices} className="bg-brand-gold text-brand-bg px-4 py-2 rounded-lg text-sm font-bold">Salvar catálogo</button>
        </div>
        <div className="space-y-2">
          {serviceDrafts.map((service, index) => (
            <div key={service.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_110px_100px_auto] gap-2 items-center bg-brand-bg border border-brand-border rounded-lg p-3">
              <input value={service.name} onChange={e => setServiceDrafts(items => items.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} className="bg-transparent border-b border-brand-border px-2 py-1 text-sm" aria-label="Nome do serviço" />
              <input value={service.category} onChange={e => setServiceDrafts(items => items.map((item, i) => i === index ? { ...item, category: e.target.value } : item))} className="bg-transparent border-b border-brand-border px-2 py-1 text-sm" aria-label="Categoria do serviço" />
              <input type="number" min="0" step="0.01" value={service.price} onChange={e => setServiceDrafts(items => items.map((item, i) => i === index ? { ...item, price: Number(e.target.value) } : item))} className="bg-transparent border-b border-brand-border px-2 py-1 text-sm" aria-label="Preço do serviço" />
              <input type="number" min="5" value={service.duration} onChange={e => setServiceDrafts(items => items.map((item, i) => i === index ? { ...item, duration: Number(e.target.value) } : item))} className="bg-transparent border-b border-brand-border px-2 py-1 text-sm" aria-label="Duração do serviço" />
              <button type="button" onClick={() => setServiceDrafts(items => items.map((item, i) => i === index ? { ...item, isActive: !item.isActive } : item))} className={`text-xs font-semibold px-2 py-1 rounded ${service.isActive ? 'text-success bg-success/10' : 'text-muted-foreground bg-muted'}`}>{service.isActive ? 'Ativo' : 'Inativo'}</button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input value={newService.name} onChange={e => setNewService(s => ({ ...s, name: e.target.value }))} placeholder="Novo serviço" className="bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm" />
          <input value={newService.category} onChange={e => setNewService(s => ({ ...s, category: e.target.value }))} placeholder="Categoria" className="bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm" />
          <input type="number" value={newService.price} onChange={e => setNewService(s => ({ ...s, price: e.target.value }))} placeholder="Preço" className="bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2"><input type="number" value={newService.duration} onChange={e => setNewService(s => ({ ...s, duration: e.target.value }))} placeholder="Minutos" className="min-w-0 flex-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm" /><button type="button" onClick={addService} className="px-3 rounded-lg bg-brand-surface border border-brand-gold text-brand-gold" aria-label="Adicionar serviço"><Plus className="w-4 h-4" /></button></div>
        </div>
      </div>}

      {/* Produtos */}
      {showSection('produtos') && <div id="produtos" className="scroll-mt-24 bg-brand-surface border border-brand-border rounded-2xl p-6 md:p-8 space-y-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-brand-border/50 pb-4">
          <div><h3 className="text-lg font-bold">Produtos e Categorias</h3><p className="text-sm text-muted-foreground mt-1">Edite preço, custo, estoque mínimo e status sem sair das configurações.</p></div>
          <Link href="/produtos" className="text-sm text-brand-gold hover:underline">Abrir estoque</Link>
        </div>
        <div className="space-y-2">
          {products.slice(0, 8).map(product => (
            <div key={product.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_100px_100px_100px_auto] gap-2 items-center bg-brand-bg border border-brand-border rounded-lg p-3">
              <input value={product.name} onChange={e => updateProduct(product.id, { name: e.target.value })} className="bg-transparent border-b border-brand-border px-2 py-1 text-sm" aria-label="Nome do produto" />
              <input value={product.category} onChange={e => updateProduct(product.id, { category: e.target.value })} className="bg-transparent border-b border-brand-border px-2 py-1 text-sm" aria-label="Categoria do produto" />
              <input type="number" value={product.price} onChange={e => updateProduct(product.id, { price: Number(e.target.value) })} className="bg-transparent border-b border-brand-border px-2 py-1 text-sm" aria-label="Preço do produto" />
              <input type="number" value={product.cost} onChange={e => updateProduct(product.id, { cost: Number(e.target.value) })} className="bg-transparent border-b border-brand-border px-2 py-1 text-sm" aria-label="Custo do produto" />
              <input type="number" value={product.minStock} onChange={e => updateProduct(product.id, { minStock: Number(e.target.value) })} className="bg-transparent border-b border-brand-border px-2 py-1 text-sm" aria-label="Estoque mínimo" />
              <button type="button" onClick={() => updateProduct(product.id, { isActive: !product.isActive })} className={`text-xs font-semibold px-2 py-1 rounded ${product.isActive ? 'text-success bg-success/10' : 'text-muted-foreground bg-muted'}`}>{product.isActive ? 'Ativo' : 'Inativo'}</button>
            </div>
          ))}
        </div>
      </div>}

      {/* Cargos e pagamentos */}
      {showSection('cargos-pagamentos') && <div id="cargos-pagamentos" className="scroll-mt-24 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center"><div><h3 className="text-lg font-bold">Cargos disponíveis</h3><p className="text-xs text-muted-foreground">Desative cargos em uso em vez de apagar o histórico.</p></div><button type="button" onClick={saveRoles} className="text-sm text-brand-gold font-bold">Salvar</button></div>
          {roleDrafts.map((role, index) => <div key={role.id} className="flex items-center gap-2"><input value={role.label} onChange={e => setRoleDrafts(items => items.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} className="min-w-0 flex-1 bg-brand-bg border border-brand-border rounded px-2 py-2 text-sm" /><button type="button" onClick={() => setRoleDrafts(items => items.map((item, i) => i === index ? { ...item, isActive: !item.isActive } : item))} className="text-xs text-brand-gold">{role.isActive ? 'Desativar' : 'Ativar'}</button><button type="button" onClick={() => removeRole(role)} aria-label={`Excluir cargo ${role.label}`} title="Excluir cargo" className="p-1.5 rounded text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button></div>)}
          <div className="flex gap-2"><input value={newRole.label} onChange={e => setNewRole(r => ({ ...r, label: e.target.value }))} placeholder="Novo cargo" className="min-w-0 flex-1 bg-brand-bg border border-brand-border rounded px-2 py-2 text-sm" /><button type="button" onClick={addRole} className="px-3 rounded bg-brand-gold text-brand-bg"><Plus className="w-4 h-4" /></button></div>
        </div>
        <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 space-y-4">
          <div><h3 className="text-lg font-bold">Formas de pagamento</h3><p className="text-xs text-muted-foreground">A lista aparece no atendimento e aceita divisão.</p></div>
          {config.paymentMethods.map(payment => <div key={payment.key} className="flex items-center justify-between bg-brand-bg border border-brand-border rounded px-3 py-2"><span className="text-sm">{payment.label}</span><div className="flex items-center gap-3"><button type="button" onClick={() => updateConfig({ paymentMethods: config.paymentMethods.map(item => item.key === payment.key ? { ...item, isActive: !item.isActive } : item) })} className="text-xs text-brand-gold">{payment.isActive ? 'Desativar' : 'Ativar'}</button><button type="button" onClick={() => removePayment(payment.key, payment.label)} aria-label={`Excluir forma de pagamento ${payment.label}`} title="Excluir forma de pagamento" className="p-1.5 rounded text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button></div></div>)}
          <div className="flex gap-2"><input value={newPayment} onChange={e => setNewPayment(e.target.value)} placeholder="Outra forma" className="min-w-0 flex-1 bg-brand-bg border border-brand-border rounded px-2 py-2 text-sm" /><button type="button" onClick={addPayment} className="px-3 rounded bg-brand-gold text-brand-bg"><Plus className="w-4 h-4" /></button></div>
        </div>
      </div>}

      {/* Papéis e Acesso */}
      {showSection('acesso') && <div id="acesso" className="scroll-mt-24 bg-brand-surface border border-brand-border rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-brand-border/50 pb-4">
          <Shield className="w-5 h-5 text-brand-gold" />
          <h3 className="text-lg font-bold text-foreground">Papéis e Acesso</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Os papéis são definidos no perfil de cada usuário durante o login. Abaixo a tabela de acesso por papel:</p>
        
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-brand-border text-muted-foreground">
                <th className="pb-3 capitalize">Papel</th>
                <th className="pb-3">Telas Permitidas</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(ROLE_ROUTES).map(([role, routes]) => (
                <tr key={role} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                  <td className="py-3 font-bold capitalize text-brand-gold">{role}</td>
                  <td className="py-3 text-muted-foreground text-xs leading-relaxed">
                    {routes.map(r => r === '/' ? '/dashboard' : r).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {Object.entries(ROLE_ROUTES).map(([role, routes]) => (
            <div key={role} className="p-4 bg-brand-bg border border-brand-border rounded-xl">
              <p className="font-bold capitalize text-brand-gold mb-1">{role}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {routes.map(r => r === '/' ? '/dashboard' : r).join(', ')}
              </p>
            </div>
          ))}
        </div>
      </div>}

      {/* Atalhos */}
      {!section && <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 md:p-8 space-y-6 shadow-sm mb-12">
        <div className="flex items-center gap-3 border-b border-brand-border/50 pb-4">
          <LinkIcon className="w-5 h-5 text-brand-gold" />
          <h3 className="text-lg font-bold text-foreground">Atalhos</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/profissionais" className="p-4 border border-brand-border bg-brand-bg rounded-xl hover:border-brand-gold hover:bg-brand-gold/5 transition-colors flex items-center justify-between group">
            <span className="font-medium text-sm">Gerenciar Equipe</span>
            <LinkIcon className="w-4 h-4 text-muted-foreground group-hover:text-brand-gold transition-colors" />
          </Link>
          <Link href="/planos" className="p-4 border border-brand-border bg-brand-bg rounded-xl hover:border-brand-gold hover:bg-brand-gold/5 transition-colors flex items-center justify-between group">
            <span className="font-medium text-sm">Gerenciar Planos</span>
            <LinkIcon className="w-4 h-4 text-muted-foreground group-hover:text-brand-gold transition-colors" />
          </Link>
          <Link href="/financeiro" className="p-4 border border-brand-border bg-brand-bg rounded-xl hover:border-brand-gold hover:bg-brand-gold/5 transition-colors flex items-center justify-between group">
            <span className="font-medium text-sm">Ver Financeiro</span>
            <LinkIcon className="w-4 h-4 text-muted-foreground group-hover:text-brand-gold transition-colors" />
          </Link>
        </div>
      </div>}
    </div>
  );
}
