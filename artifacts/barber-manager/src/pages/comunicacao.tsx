import { useMemo, useState } from 'react';
import { useStore, Client } from '@/data/store';
import { toast } from 'sonner';
import { Megaphone, MessageSquare, Copy, Users, CalendarDays, Clock3 } from 'lucide-react';

type CampaignId = 'anuncios' | 'churn' | 'aniversarios';

const CAMPAIGNS: { id: CampaignId; label: string; description: string; icon: typeof Megaphone }[] = [
  { id: 'anuncios', label: 'Leads de anúncio', description: 'Pessoas que chegaram por anúncio e ainda precisam de contato.', icon: Megaphone },
  { id: 'churn', label: 'Inativos há mais de 21 dias', description: 'Clientes que já vieram e estão sem retornar.', icon: Clock3 },
  { id: 'aniversarios', label: 'Aniversariantes da semana', description: 'Clientes que fazem aniversário entre segunda e domingo.', icon: CalendarDays },
];

const DEFAULT_MESSAGES: Record<CampaignId, string> = {
  anuncios: 'Olá, {nome}! Vi que você veio pelo nosso anúncio. Posso te ajudar a encontrar o melhor horário para conhecer a {empresa}?',
  churn: 'Olá, {nome}! Sentimos sua falta na {empresa}. Já faz um tempinho desde sua última visita. Que tal agendar seu próximo atendimento?',
  aniversarios: 'Olá, {nome}! A equipe da {empresa} deseja um feliz aniversário. Venha comemorar com a gente e aproveite para cuidar do seu visual!',
};

function dateAtMidnight(value: string) {
  return new Date(`${value}T00:00:00`);
}

function daysSinceLastVisit(client: Client, today: Date) {
  const lastVisit = client.visits.length
    ? [...client.visits].sort((a, b) => b.date.localeCompare(a.date))[0].date
    : null;
  return lastVisit ? Math.floor((today.getTime() - dateAtMidnight(lastVisit).getTime()) / 86400000) : null;
}

function isBirthdayThisWeek(birthday: string | undefined, today: Date) {
  if (!birthday) return false;
  const birthdayDate = dateAtMidnight(birthday);
  const start = new Date(today);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const thisYearBirthday = new Date(today.getFullYear(), birthdayDate.getMonth(), birthdayDate.getDate());
  return thisYearBirthday >= start && thisYearBirthday <= end;
}

export default function Comunicacao() {
  const { clients, config, isLoading } = useStore();
  const [activeCampaign, setActiveCampaign] = useState<CampaignId>('anuncios');
  const [messages, setMessages] = useState(DEFAULT_MESSAGES);

  const today = new Date();
  const companyName = config.name || 'nossa barbearia';

  const audiences = useMemo<Record<CampaignId, Client[]>>(() => ({
    anuncios: clients.filter(client => client.source === 'Anúncio' || client.sourceOther?.toLowerCase().includes('anúncio')),
    churn: clients.filter(client => {
      const days = daysSinceLastVisit(client, today);
      return days !== null && days > 21;
    }),
    aniversarios: clients.filter(client => isBirthdayThisWeek(client.birthday, today)),
  }), [clients]);

  const campaign = CAMPAIGNS.find(item => item.id === activeCampaign)!;
  const audience = audiences[activeCampaign];
  const message = messages[activeCampaign];
  const previewMessage = (client: Client) => message.replaceAll('{nome}', client.name).replaceAll('{empresa}', companyName);

  const copyBatch = async () => {
    const payload = {
      campaign: activeCampaign,
      campaignLabel: campaign.label,
      generatedAt: new Date().toISOString(),
      messageTemplate: message,
      recipients: audience.map(client => ({
        id: client.id,
        name: client.name,
        whatsapp: client.whatsapp,
        message: previewMessage(client),
      })),
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success(`${audience.length} destinatário(s) copiado(s) para o n8n`);
  };

  if (isLoading) return <div className="p-5 md:p-8 text-muted-foreground">Carregando comunicação...</div>;

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start gap-4 border-b border-brand-border pb-6">
        <div className="p-3 rounded-xl bg-brand-surface border border-brand-border text-brand-gold"><MessageSquare className="w-6 h-6" /></div>
        <div>
          <h2 className="text-2xl font-bold">Disparos de Mensagens</h2>
          <p className="text-sm text-muted-foreground mt-1">Prepare campanhas segmentadas para automatizar pelo n8n.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CAMPAIGNS.map(item => {
          const Icon = item.icon;
          const selected = item.id === activeCampaign;
          return (
            <button key={item.id} type="button" onClick={() => setActiveCampaign(item.id)} className={`text-left p-4 rounded-xl border transition-colors ${selected ? 'border-brand-gold bg-brand-gold/10' : 'border-brand-border bg-brand-surface hover:border-brand-gold/50'}`}>
              <div className="flex items-start justify-between gap-3">
                <Icon className={`w-5 h-5 ${selected ? 'text-brand-gold' : 'text-muted-foreground'}`} />
                <span className={`text-2xl font-bold ${selected ? 'text-brand-gold' : 'text-foreground'}`}>{audiences[item.id].length}</span>
              </div>
              <p className="font-bold mt-3">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
        <section className="bg-brand-surface border border-brand-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">Mensagem da campanha</h3>
              <p className="text-xs text-muted-foreground mt-1">Use {'{nome}'} e {'{empresa}'} para personalizar.</p>
            </div>
            <Megaphone className="w-5 h-5 text-brand-gold" />
          </div>
          <textarea value={message} onChange={event => setMessages(current => ({ ...current, [activeCampaign]: event.target.value }))} className="w-full min-h-36 resize-y bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-brand-gold" />
          <button type="button" onClick={copyBatch} disabled={!audience.length} className="w-full flex items-center justify-center gap-2 bg-brand-gold text-brand-bg font-bold py-2.5 rounded-lg disabled:opacity-40">
            <Copy className="w-4 h-4" /> Copiar lote para o n8n
          </button>
          <p className="text-xs text-muted-foreground">O lote copiado contém a campanha, os contatos e a mensagem personalizada de cada pessoa.</p>
        </section>

        <section className="bg-brand-surface border border-brand-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-brand-border/50 pb-4">
            <div>
              <h3 className="text-lg font-bold">{campaign.label}</h3>
              <p className="text-xs text-muted-foreground mt-1">{audience.length} contato(s) encontrado(s)</p>
            </div>
            <Users className="w-5 h-5 text-brand-gold" />
          </div>
          {audience.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhum cliente encontrado para esta campanha.</div>
          ) : (
            <div className="max-h-[460px] overflow-y-auto space-y-2">
              {audience.map(client => (
                <div key={client.id} className="flex items-center gap-3 bg-brand-bg border border-brand-border rounded-lg p-3">
                  <div className="w-9 h-9 rounded-full bg-brand-gold/15 text-brand-gold flex items-center justify-center font-bold text-sm">{client.name.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.whatsapp || 'Sem WhatsApp cadastrado'}</p>
                  </div>
                  <button type="button" onClick={() => navigator.clipboard.writeText(previewMessage(client)).then(() => toast.success('Mensagem copiada'))} className="p-2 text-muted-foreground hover:text-brand-gold" title="Copiar mensagem" aria-label={`Copiar mensagem para ${client.name}`}>
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}