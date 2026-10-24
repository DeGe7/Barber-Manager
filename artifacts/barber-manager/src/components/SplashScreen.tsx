type SplashScreenProps = {
  message?: string;
  overlay?: boolean;
};

export function SplashScreen({
  message = 'Preparando seu espaço...',
  overlay = false,
}: SplashScreenProps) {
  return (
    <div
      className={`bm-loading-screen fixed inset-0 z-[100] grid place-items-center overflow-hidden px-4 py-8 ${
        overlay ? 'bg-brand-bg/55 backdrop-blur-md' : 'bg-brand-bg'
      }`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
      data-testid="loading-screen"
    >
      <div className="bm-loading-glow bm-loading-glow-gold" aria-hidden="true" />
      <div className="bm-loading-glow bm-loading-glow-green" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-brand-border bg-brand-surface/90 px-6 py-7 text-center shadow-2xl shadow-black/40 backdrop-blur-xl sm:px-9 sm:py-8">
        <div className="mx-auto grid h-40 w-40 place-items-center rounded-[2rem] border border-brand-gold/20 bg-brand-gold/[0.06]">
          <svg
            viewBox="0 0 200 160"
            className="h-36 w-36 overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="bm-hair-gradient" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#f3d47a" />
                <stop offset="0.55" stopColor="#c9a84c" />
                <stop offset="1" stopColor="#8f6d2a" />
              </linearGradient>
            </defs>

            <g className="bm-hair-strands" fill="none" stroke="url(#bm-hair-gradient)" strokeLinecap="round">
              <path d="M91 12 C77 40 85 54 91 77 C97 99 81 119 91 147" strokeWidth="4" />
              <path d="M101 8 C91 31 105 51 99 74 C94 98 109 120 101 150" strokeWidth="5" />
              <path d="M111 14 C123 38 106 52 110 76 C115 99 102 121 112 146" strokeWidth="3" />
              <path d="M82 23 C70 46 87 58 83 79 C78 101 92 122 84 139" strokeWidth="2" opacity=".7" />
              <path d="M120 22 C131 43 116 60 120 79 C125 101 113 117 122 138" strokeWidth="2" opacity=".7" />
            </g>

            <g className="bm-scissor-upper" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M42 130 L100 80" stroke="#d7d1c2" strokeWidth="4" />
              <path d="M100 80 L160 28" stroke="#e5c66c" strokeWidth="4" />
              <circle cx="38" cy="134" r="12" stroke="#e5c66c" strokeWidth="4" />
            </g>
            <g className="bm-scissor-lower" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M42 30 L100 80" stroke="#d7d1c2" strokeWidth="4" />
              <path d="M100 80 L160 132" stroke="#e5c66c" strokeWidth="4" />
              <circle cx="38" cy="26" r="12" stroke="#e5c66c" strokeWidth="4" />
            </g>
            <circle cx="100" cy="80" r="5" fill="#f6d979" />

            <path className="bm-hair-cut" d="M100 72 L100 87" stroke="#fff0bd" strokeWidth="3" strokeLinecap="round" />
            <path className="bm-hair-fragment" d="M112 84 C118 87 120 91 122 96" stroke="#d6b760" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>

        <p className="mt-5 text-lg font-bold tracking-wide text-foreground">Barber Manager</p>
        <p className="mt-2 min-h-5 text-sm text-muted-foreground">{message}</p>
        <div className="mx-auto mt-5 h-1 w-36 overflow-hidden rounded-full bg-brand-border" aria-hidden="true">
          <div className="bm-loading-progress h-full w-1/2 rounded-full bg-brand-gold" />
        </div>
      </div>
    </div>
  );
}
