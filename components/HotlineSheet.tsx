'use client';

import { useEffect } from 'react';
import { Phone, X } from 'lucide-react';
import { HOTLINES } from '@/lib/agencies';

/** รายชื่อสายด่วนจริงระดับประเทศ — กดโทรได้ทันทีจากมือถือ */
export function HotlineSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="สายด่วนช่วยเหลือ">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="ปิด" />
      <div className="glass relative w-full max-w-md animate-sheet-up overflow-hidden rounded-t-3xl sm:rounded-3xl">
        <header className="flex items-center gap-3 p-4">
          <div className="mr-auto leading-tight">
            <h2 className="text-base font-semibold text-white">สายด่วนช่วยเหลือน้ำท่วม</h2>
            <p className="text-xs text-slate-400">เบอร์จริงระดับประเทศ · รับเรื่องตลอด 24 ชม.</p>
          </div>
          <button onClick={onClose} className="btn-ghost !min-h-[44px] !min-w-[44px] !px-0" aria-label="ปิด">
            <X size={20} />
          </button>
        </header>
        <ul className="space-y-2 px-4 pb-5">
          {HOTLINES.map((a) => (
            <li key={a.id}>
              <a
                href={`tel:${a.phone}`}
                className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/10"
              >
                <span className="grid h-12 min-w-[64px] place-items-center rounded-xl bg-danger px-2 text-lg font-bold text-white">{a.phone}</span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-sm font-semibold text-white">{a.name}</span>
                  <span className="block text-xs text-slate-400">{a.desc}</span>
                </span>
                <Phone size={18} className="shrink-0 text-ocean-300" />
              </a>
            </li>
          ))}
          <li className="pt-1 text-[11px] leading-relaxed text-slate-500">
            กรณีฉุกเฉินจริงให้โทรสายด่วนก่อน แล้วค่อยกด “แจ้งน้ำท่วม / ขอความช่วยเหลือ” เพื่อให้ศูนย์ประสานงานและอาสาสมัครรับรู้พิกัดของคุณ
          </li>
        </ul>
      </div>
    </div>
  );
}
