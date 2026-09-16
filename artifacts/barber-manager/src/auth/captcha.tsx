import { useEffect, useRef, useState } from 'react';

type TurnstileWidgetId = string | number;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: 'light' | 'dark' | 'auto';
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ) => TurnstileWidgetId;
  remove?: (widgetId: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const siteKey = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
export const captchaRequired = import.meta.env.PROD;

function captchaScript(): HTMLScriptElement {
  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-barber-turnstile]',
  );
  if (existing) return existing;

  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.defer = true;
  script.dataset.barberTurnstile = 'true';
  document.head.appendChild(script);
  return script;
}

export default function CaptchaChallenge({
  onTokenChange,
}: {
  onTokenChange: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | undefined>(undefined);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!siteKey) {
      setStatus('error');
      onTokenChange(null);
      return;
    }

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'dark',
          callback: token => {
            onTokenChange(token);
            setStatus('ready');
          },
          'expired-callback': () => {
            onTokenChange(null);
            setStatus('loading');
          },
          'error-callback': () => {
            onTokenChange(null);
            setStatus('error');
          },
        });
      } catch {
        onTokenChange(null);
        setStatus('error');
      }
    };

    const script = captchaScript();
    if (window.turnstile) {
      renderWidget();
    } else {
      script.addEventListener('load', renderWidget);
      script.addEventListener('error', () => {
        if (!cancelled) {
          onTokenChange(null);
          setStatus('error');
        }
      });
    }

    return () => {
      cancelled = true;
      script.removeEventListener('load', renderWidget);
      if (widgetIdRef.current !== undefined) {
        window.turnstile?.remove?.(widgetIdRef.current);
      }
    };
  }, [onTokenChange]);

  if (!siteKey && !captchaRequired) return null;

  return (
    <div className="space-y-2" aria-live="polite">
      <div ref={containerRef} className="min-h-[65px]" />
      {status === 'error' && (
        <p role="alert" className="text-xs text-destructive">
          A proteção antiabuso não está disponível. Tente novamente mais tarde.
        </p>
      )}
    </div>
  );
}