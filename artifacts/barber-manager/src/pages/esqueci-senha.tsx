import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/auth/auth';
import CaptchaChallenge, { captchaRequired } from '@/auth/captcha';
import { isAuthRateLimitError, useAuthRateLimit } from '@/auth/rate-limit';
import { Scissors } from 'lucide-react';
import { toast } from 'sonner';

export default function EsqueciSenha() {
  const [, setLocation] = useLocation();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { isCoolingDown, remainingSeconds, startCooldown } = useAuthRateLimit();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email) {
      toast.error('Informe seu e-mail.');
      return;
    }
    if (captchaRequired && !captchaToken) {
      toast.error('Conclua a verificação antiabuso.');
      return;
    }
    if (isCoolingDown) {
      toast.error(`Aguarde ${remainingSeconds}s antes de tentar novamente.`);
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset(email, captchaToken);
      setSent(true);
      toast.success('Se o e-mail estiver cadastrado, você receberá as instruções.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o e-mail.');
      if (isAuthRateLimitError(error)) startCooldown();
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
          <h1 className="text-2xl font-bold text-foreground">Recuperar acesso</h1>
          <p className="text-sm text-muted-foreground mt-2">Enviaremos um link para criar uma nova senha</p>
        </div>

        <div className="p-6">
          {sent ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 p-4 text-sm text-foreground">
                Se o endereço informado estiver cadastrado, enviaremos um link de recuperação. Confira também a pasta de spam.
              </div>
              <button
                type="button"
                onClick={() => setLocation('/login')}
                className="w-full bg-brand-gold text-brand-bg font-bold py-3 px-4 rounded-lg hover:bg-brand-gold/90 transition-all"
              >
                Voltar para o login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="recovery-email" className="text-sm font-medium text-foreground">E-mail da conta</label>
                <input
                  id="recovery-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold text-foreground placeholder:text-muted-foreground transition-all"
                  placeholder="seu@email.com"
                />
              </div>
              <CaptchaChallenge onTokenChange={setCaptchaToken} />
              <button
                type="submit"
                disabled={loading || isCoolingDown}
                className="w-full bg-brand-gold text-brand-bg font-bold py-3 px-4 rounded-lg hover:bg-brand-gold/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Enviando...' : isCoolingDown ? `Aguarde ${remainingSeconds}s` : 'Enviar link de recuperação'}
              </button>
            </form>
          )}
          <p className="text-center text-sm text-muted-foreground mt-6">
            <Link href="/login" className="text-brand-gold hover:underline">Voltar para o login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}