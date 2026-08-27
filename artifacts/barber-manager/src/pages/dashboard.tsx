import { useState } from 'react';
import { useStore, brl, productStatus } from '@/data/store';
import { useAuth } from '@/auth/auth';
import { 
  DollarSign, 
  CalendarCheck, 
  Clock, 
  Trophy, 
  AlertTriangle,
  Briefcase,
  LogIn,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'wouter';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { StatsCard } from '@/components/StatsCard';

export default function Dashboard() {
  const { appointments, professionals, products, prothesisSales, mentoriaSessions, isLoading } = useStore();
  const { profile } = useAuth();
  const ownProfile = profile?.role === 'barbeiro' || profile?.role === 'manicure';
  const [ownPeriod, setOwnPeriod] = useState<'semanal' | 'mensal'>('semanal');

  const today = new Date().toISOString().slice(0, 10);
  const periodStart = new Date();
  periodStart.setHours(0, 0, 0, 0);
  periodStart.setDate(periodStart.getDate() - (ownPeriod === 'semanal' ? 6 : 29));
  const todayAppointments = appointments.filter(a => {
    if (!ownProfile) return a.date === today;
    const date = new Date(`${a.date}T12:00:00`);
    return a.professionalId === profile?.professionalId && date >= periodStart;
  });
  const completed = todayAppointments.filter(a => a.status === 'completed').length;
  const checkedIn = todayAppointments.filter(a => a.status === 'checked_in').length;
  const awaiting = todayAppointments.filter(a => a.status === 'pending' || a.status === 'confirmed').length;
  const revenue = todayAppointments
    .filter(a => a.status === 'completed' || a.status === 'confirmed')
    .reduce((sum, a) => sum + a.value + (a.tip || 0), 0);

  const profRevenue: Record<string, number> = {};
  todayAppointments.filter(a => a.status === 'completed' || a.status === 'confirmed').forEach(a => {
    profRevenue[a.professionalId] = (profRevenue[a.professionalId] || 0) + a.value + (a.tip || 0);
  });
  
  let topProfId = '';
  let maxRev = -1;
  Object.entries(profRevenue).forEach(([id, rev]) => {
    if (rev > maxRev) { maxRev = rev; topProfId = id; }
  });
  
  const topProf = professionals.find(p => p.id === topProfId);

  const chartData = professionals.map(p => ({
    name: p.initials,
    fullName: p.name,
    total: profRevenue[p.id] || 0,
  })).filter(d => d.total > 0).sort((a, b) => b.total - a.total);

  const lowStock = ownProfile ? 0 : products.filter(p => productStatus(p) === 'low').length;
  const critStock = ownProfile ? 0 : products.filter(p => productStatus(p) === 'critical').length;

  const todayDate = new Date();
  const prothesisAlerts = prothesisSales.filter(ps => {
    const lastM = ps.lastMaintenance ? new Date(ps.lastMaintenance) : new Date(ps.date);
    const diffDays = Math.ceil(Math.abs(todayDate.getTime() - lastM.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 10;
  });

  const mentoriaToday = mentoriaSessions.filter(m => m.date === today && m.status === 'scheduled');
  const sortedAppointments = [...todayAppointments].sort((a, b) => a.time.localeCompare(b.time));

  const STATUS_LABEL: Record<string, string> = {
    confirmed: 'Confirmado',
    pending: 'Pendente',
    checked_in: 'Em atendimento',
    completed: 'Concluído',
    no_show: 'Faltou',
    cancelled: 'Cancelado',
  };
  const STATUS_CLASS: Record<string, string> = {
    confirmed: 'bg-success/10 text-success', pending: 'bg-warning/10 text-warning',
    checked_in: 'bg-warning/10 text-warning', completed: 'bg-success/10 text-success',
    no_show: 'bg-destructive/10 text-destructive', cancelled: 'bg-muted/50 text-muted-foreground',
  };

  return (
    <div className="p-5 md:p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Visão geral</h2>
          <p className="mt-1 text-sm text-muted-foreground">{ownProfile ? 'Acompanhe apenas os seus resultados.' : 'Acompanhe a operação de hoje.'}</p>
        </div>
        {ownProfile && (
          <select value={ownPeriod} onChange={e => setOwnPeriod(e.target.value as typeof ownPeriod)} className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm" aria-label="Período do dashboard">
            <option value="semanal">Últimos 7 dias</option>
            <option value="mensal">Últimos 30 dias</option>
          </select>
        )}
        <Link href="/agenda" className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-bold text-brand-bg transition-colors hover:bg-brand-gold/90">
          Agenda <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({length: 4}).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatsCard label="Faturamento (Hoje)" value={revenue} icon={<DollarSign className="w-5 h-5" />} colorClass="text-brand-gold" format={(v: number) => brl(v)} />
          <StatsCard label="Concluídos (Hoje)" value={completed} icon={<CalendarCheck className="w-5 h-5" />} colorClass="text-success" />
          <StatsCard label="Aguardando (Hoje)" value={awaiting} icon={<Clock className="w-5 h-5" />} colorClass="text-warning" />
          <StatsCard label={ownProfile ? "Meu faturamento (Hoje)" : "Destaque (Hoje)"} value={maxRev > 0 ? maxRev : 0} icon={<Trophy className="w-5 h-5" />} colorClass="text-primary" format={(v: number) => v > 0 ? (ownProfile ? brl(v) : (topProf?.name || '-')) : brl(v)} />
        </div>
      )}

      {(lowStock > 0 || critStock > 0) && (
        <Link href="/produtos" className="bg-destructive/10 border border-destructive/20 rounded-2xl p-5 md:p-6 flex items-start gap-4 md:gap-5 transition-colors hover:bg-destructive/15">
          <div className="p-3 bg-destructive/20 text-destructive rounded-xl border border-destructive/30 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-lg font-bold text-destructive-foreground">Atenção ao Estoque</h4>
            <p className="text-destructive-foreground/90 text-sm mt-1.5 leading-relaxed">
              Você tem <strong>{critStock} produto(s)</strong> com estoque crítico e <strong>{lowStock} produto(s)</strong> com estoque baixo.
            </p>
          </div>
          <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-destructive" />
        </Link>
      )}

      <section className="md:hidden rounded-2xl border border-brand-border bg-brand-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-foreground">Operação de hoje</h3>
            <p className="mt-1 text-xs text-muted-foreground">Ações rápidas para o atendimento.</p>
          </div>
          <Link href="/agenda" className="rounded-lg bg-brand-gold px-3 py-2 text-xs font-bold text-brand-bg">
            Abrir agenda
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-brand-border text-center">
          <div className="px-2">
            <LogIn className="mx-auto h-4 w-4 text-warning" />
            <p className="mt-1 text-lg font-bold">{checkedIn}</p>
            <p className="text-[11px] text-muted-foreground">Em atendimento</p>
          </div>
          <div className="px-2">
            <Clock className="mx-auto h-4 w-4 text-brand-gold" />
            <p className="mt-1 text-lg font-bold">{awaiting}</p>
            <p className="text-[11px] text-muted-foreground">Aguardando</p>
          </div>
          <div className="px-2">
            <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
            <p className="mt-1 text-lg font-bold">{completed}</p>
            <p className="text-[11px] text-muted-foreground">Finalizados</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-foreground">Atendimentos de Hoje</h3>
                <Link href="/agenda" className="text-xs font-semibold text-brand-gold md:hidden">Gerenciar</Link>
              </div>
            {isLoading ? (
              <div className="space-y-3">{Array.from({length: 4}).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : sortedAppointments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarCheck className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Nenhum atendimento para hoje</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-brand-border text-muted-foreground">
                        <th className="pb-3 font-medium">Horário</th>
                        <th className="pb-3 font-medium">Cliente</th>
                        <th className="pb-3 font-medium">Profissional</th>
                        <th className="pb-3 font-medium">Serviço</th>
                        <th className="pb-3 font-medium">Valor</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAppointments.map(a => (
                        <tr key={a.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                          <td className="py-3 font-mono">{a.time}</td>
                          <td className="py-3 font-medium">{a.client}</td>
                          <td className="py-3 text-muted-foreground">{professionals.find(p => p.id === a.professionalId)?.name}</td>
                          <td className="py-3">{a.service}</td>
                          <td className="py-3">{brl(a.value + (a.tip || 0))}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_CLASS[a.status] || STATUS_CLASS.cancelled}`}>
                              {STATUS_LABEL[a.status] || a.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {sortedAppointments.map(a => (
                    <div key={a.id} className="p-4 bg-brand-bg border border-brand-border rounded-xl">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-sm">{a.client}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{professionals.find(p => p.id === a.professionalId)?.name} • {a.service}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ml-2 ${STATUS_CLASS[a.status] || STATUS_CLASS.cancelled}`}>
                          {STATUS_LABEL[a.status] || a.status}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span className="font-mono">{a.time}</span>
                        <span className="font-bold text-foreground">{brl(a.value + (a.tip || 0))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {!ownProfile && <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
            <h3 className="text-lg font-bold text-foreground mb-4">Faturamento por Profissional (Hoje)</h3>
            {chartData.length === 0 ? (
               <div className="text-center py-12 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-sm">Nenhum faturamento registrado hoje</p>
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--brand-border))" vertical={false} />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `R$ ${val}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--brand-surface))', borderColor: 'hsl(var(--brand-border))', color: 'hsl(var(--foreground))' }}
                      itemStyle={{ color: 'hsl(var(--brand-gold))' }}
                      formatter={(val: number) => [brl(val), 'Faturamento']}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                    />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>}
        </div>

        <div className="space-y-6">
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-6">
            <h3 className="text-lg font-bold text-foreground mb-4">Agenda de Prótese & Mentoria</h3>
            <div className="space-y-4">
              {mentoriaToday.length === 0 && prothesisAlerts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nada agendado/pendente para hoje</p>
                </div>
              )}
              
              {mentoriaToday.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mentorias (Hoje)</h4>
                  <div className="space-y-2">
                    {mentoriaToday.map(m => (
                      <div key={m.id} className="p-3 bg-brand-bg rounded-xl border border-brand-border/50">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-sm text-foreground">{m.client}</p>
                            <p className="text-xs text-muted-foreground mt-1">Com: {professionals.find(p => p.id === m.sellerId)?.name}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">Mentoria</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {prothesisAlerts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Manutenções Prótese</h4>
                  <div className="space-y-2">
                    {prothesisAlerts.map(p => (
                      <div key={p.id} className="p-3 bg-destructive/5 rounded-xl border border-destructive/20">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-sm text-destructive-foreground">{p.client}</p>
                            <p className="text-xs text-destructive-foreground/70 mt-1">Vendedor: {professionals.find(prof => prof.id === p.sellerId)?.name}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive">Alerta</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
