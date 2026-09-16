import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/auth/auth';
import { Scissors } from 'lucide-react';
import { toast } from 'sonner';

export default function RedefinirSenha() {
  const [, setLocation] = useLocation();
  const { session, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmation) {
      toast.error('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      setUpdated(true);
      toast.success('Senha atualizada com sucesso!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-brand-bg p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-gold/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="w-full max-w-md bg-brand-surface border border-brand-border rounded-2xl shadow-2xl overflow-hidden relative z-10">
        <div className="p-8 text-center border-b border-brand-border bg-brand-bg/30">
          <div className="inline-flex items-center justify-center p-4 rounded-xl bg-brand-gold/10 text-brand-gold mb-5 border border-brand-gold/20">
            <Scissors className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Criar nova senha</h1>
          <p className="text-sm text-muted-foreground mt-2">Escolha uma senha segura para sua conta</p>
        </div>

        <div className="p-6">
          {updated ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 p-4 text-sm text-foreground">
                Sua senha foi alterada. Você já pode continuar usando o sistema.
              </div>
              <button
                type="button"
                onClick={() => setLocation('/')}
                className="w-full bg-brand-gold text-brand-bg font-bold py-3 px-4 rounded-lg hover:bg-brand-gold/90 transition-all"
              >
                Ir para o sistema
              </button>
            </div>
          ) : !session ? (
            <div className="space-y-4">
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                Link inválido ou expirado.
              </p>
              <Link
                href="/esqueci-senha"
                className="block w-full text-center bg-brand-gold text-brand-bg font-bold py-3 px-4 rounded-lg hover:bg-brand-gold/90 transition-all"
              >
                Solicitar novo link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="reset-password" className="text-sm font-medium text-foreground">Nova senha</label>
                <input
                  id="reset-password"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold text-foreground"
                  placeholder="Mínimo de 6 caracteres"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="reset-confirmation" className="text-sm font-medium text-foreground">Confirmar nova senha</label>
                <input
                  id="reset-confirmation"
                  type="password"
                  value={confirmation}
                  onChange={event => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  required
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold text-foreground"
                  placeholder="Repita sua nova senha"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-gold text-brand-bg font-bold py-3 px-4 rounded-lg hover:bg-brand-gold/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </form>
          )}
          {!updated && (
            <p className="text-center text-sm text-muted-foreground mt-6">
              <Link href="/login" className="text-brand-gold hover:underline">Voltar para o login</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}