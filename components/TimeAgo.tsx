'use client';

import { useEffect, useState } from 'react';
import { timeAgo } from '@/lib/utils';

/** Renders relative time only after mount (avoids SSR/CSR hydration mismatch). */
export function TimeAgo({ ts }: { ts: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{now === null ? '…' : timeAgo(ts, now)}</span>;
}
