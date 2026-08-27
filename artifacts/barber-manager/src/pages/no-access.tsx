import { Link } from 'wouter';
import { ShieldAlert } from 'lucide-react';

export default function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-8 text-center min-h-[60vh]">
      <div className="p-5 rounded-full bg-destructive/10 text-destructive mb-6 border border-destructive/20 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
        <ShieldAlert className="w-12 h-12" />
      </div>
      <h1 className="text-3xl font-bold text-foreground mb-3">Acesso Restrito</h1>
      <p className="text-muted-foreground mb-8 max-w-md text-lg">
        O seu perfil atual não tem as permissões necessárias para acessar esta área do sistema.
      </p>
      <Link href="/" className="inline-flex items-center justify-center rounded-lg bg-brand-gold text-brand-bg px-8 py-3 font-bold hover:bg-brand-gold/90 transition-all hover:shadow-[0_0_15px_rgba(201,168,76,0.2)]">
        Voltar ao Painel Principal
      </Link>
    </div>
  );
}
