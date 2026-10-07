'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

/** SSR-safe wrapper (MapLibre needs `window`). */
export const FloodMap = dynamic(() => import('./FloodMap'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-navy-950 text-slate-400">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="animate-spin" size={18} /> กำลังโหลดแผนที่…
      </div>
    </div>
  ),
});
