import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Building2, CheckCircle2, CircleAlert, Loader2, Scissors } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth';

function invitationToken(): string {
  return decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop() || '');
}

export default function Convite() {
  const [, setLocation] = useLocation();
  const { session, profile, acceptInvitation } = useAuth();
  const [status, setStatus] = useState<'waiting' | 'accepting' | 'error'>('waiting');
  const [error, setError] = useState('');
  const attempted = useRef(false);
  const token = invitationToken();

  useEffect(() => {
    if (!session || !profile || attempted.current) return;
    attempted.current = true;
    setStatus('accepting');
    acceptInvitation(token)
      .then(() => {
        toast.success('Convite aceito. Bem-vindo à equipe!');
        setLocation('/');
      })
      .catch((acceptError) => {
        setError(acceptError instanceof Error ? acceptError.message : 'Não foi possível aceitar o convite.');
        setStatus('error');
      });
  }, [acceptInvitation, profile, session, setLocation, token]);

  if (status === 'accepting') {
    return (
      <div className="min-h-[100dvh] bg-brand-bg flex items-center justify-center p-6 text-center">
        <div className="space-y-4">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand-gold" />
          <h1 className="text-xl font-bold text-foreground">Vinculando sua conta</h1>
          <p className="text-sm text-muted-foreground">Validando convite e permissões...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-[100dvh] bg-brand-bg flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-brand-border bg-brand-surface p-8 text-center space-y-5">
          <CircleAlert className="mx-auto h-12 w-12 text-destructive" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Convite não disponível</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
          <Link href="/login" className="inline-flex rounded-lg bg-brand-gold px-5 py-3 text-sm font-bold text-brand-bg">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  const query = `?convite=${encodeURIComponent(token)}`;
  return (
    <div className="min-h-[100dvh] bg-brand-bg flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,hsl(var(--brand-gold)/0.08),transparent_55%)]" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-brand-border bg-brand-surface shadow-2xl overflow-hidden">
        <div className="border-b border-brand-border bg-brand-bg/30 p-8 text-center">
          <div className="mx-auto mb-5 inline-flex rounded-xl border border-brand-gold/20 bg-brand-gold/10 p-4 text-brand-gold">
            <Scissors className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Convite para a equipe</h1>
          <p className="mt-2 text-sm text-muted-foreground">Você recebeu acesso a um estabelecimento no Barber Manager.</p>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex gap-3 rounded-xl border border-brand-border bg-brand-bg/60 p-4">
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Entre ou crie sua conta usando o mesmo e-mail que recebeu o convite.
            </p>
          </div>
          <Link href={`/login${query}`} className="flex w-full items-center justify-center rounded-lg bg-brand-gold px-4 py-3 text-sm font-bold text-brand-bg hover:bg-brand-gold/90">
            Já tenho uma conta
          </Link>
          <Link href={`/cadastro${query}`} className="flex w-full items-center justify-center rounded-lg border border-brand-border bg-brand-bg px-4 py-3 text-sm font-bold text-foreground hover:border-brand-gold hover:text-brand-gold">
            Criar minha conta
          </Link>
          <p className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" /> O convite define seu papel com segurança.
          </p>
        </div>
      </div>
    </div>
  );
}