import { useCallback, useEffect, useState } from 'react';

const COOLDOWN_SECONDS = 60;

export function useAuthRateLimit() {
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds(current => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remainingSeconds]);

  const startCooldown = useCallback(() => {
    setRemainingSeconds(COOLDOWN_SECONDS);
  }, []);

  return {
    isCoolingDown: remainingSeconds > 0,
    remainingSeconds,
    startCooldown,
  };
}

export function isAuthRateLimitError(error: unknown) {
  return error instanceof Error && /muitas tentativas|rate limit/i.test(error.message);
}