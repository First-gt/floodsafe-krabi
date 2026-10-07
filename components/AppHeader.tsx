'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Navigation, Radio, Waves } from 'lucide-react';
import { useFloodStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { TimeAgo } from './TimeAgo';

const NAV = [
  { href: '/', label: 'ประชาชน', icon: Navigation },
  { href: '/dashboard', label: 'ศูนย์ประสานงาน', icon: LayoutDashboard },
];

export function AppHeader() {
  const path = usePathname();
  const { live, setLive, lastUpdate } = useFloodStore();

  return (
    <header className="glass z-30 flex h-14 shrink-0 items-center gap-2 border-x-0 border-t-0 px-3 sm:gap-4 sm:px-5">
      <Link href="/" className="flex min-w-0 items-center gap-2" aria-label="FloodSafe Krabi หน้าแรก">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-ocean-400 to-blue-600 text-navy-950">
          <Waves size={20} strokeWidth={2.5} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-white">FloodSafe กระบี่</span>
          <span className="hidden truncate text-[11px] text-slate-400 sm:block">นำทางหลบน้ำท่วมด้วย AI และศูนย์สั่งการกู้ภัย</span>
        </span>
      </Link>

      <nav className="ml-auto flex items-center gap-1 rounded-xl bg-white/5 p-1" aria-label="เมนูหลัก">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm transition',
                active ? 'bg-ocean-500 font-semibold text-navy-950' : 'text-slate-300 hover:bg-white/10',
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={() => setLive(!live)}
        className="hidden min-h-[40px] items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-slate-300 hover:bg-white/5 md:flex"
        title={live ? 'หยุดข้อมูลเรียลไทม์จำลอง' : 'เปิดข้อมูลเรียลไทม์จำลอง'}
      >
        <Radio size={14} className={live ? 'text-safe' : 'text-slate-500'} />
        <span className={live ? 'font-semibold text-safe' : ''}>{live ? 'สด' : 'หยุดชั่วคราว'}</span>
        {lastUpdate && (
          <span className="text-slate-500">
            · <TimeAgo ts={lastUpdate} />
          </span>
        )}
      </button>
    </header>
  );
}
