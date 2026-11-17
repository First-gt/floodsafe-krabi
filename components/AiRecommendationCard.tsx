import { Bot, Lightbulb } from 'lucide-react';
import { EQUIPMENT_CATALOG } from '@/lib/ai-engine';
import type { AiRecommendation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { EQUIPMENT_ICONS, FALLBACK_ICON } from './equipment-icons';
import { PriorityBadge } from './PriorityBadge';

export function AiRecommendationCard({ rec, className }: { rec: AiRecommendation; className?: string }) {
  return (
    <section
      className={cn('rounded-2xl border border-white/10 bg-navy-950/60 p-4', className)}
      aria-label="AI แนะนำทรัพยากรกู้ภัย"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-ocean-500/15 text-ocean-300">
          <Bot size={18} />
        </span>
        <div className="mr-auto leading-tight">
          <h3 className="text-sm font-semibold text-white">AI แนะนำทรัพยากรกู้ภัย</h3>
          <p className="text-[11px] text-slate-400">วิเคราะห์จากระดับน้ำและสภาพเหตุการณ์</p>
        </div>
        <PriorityBadge priority={rec.priority} />
      </div>

      <p className="mb-3 text-sm font-medium text-slate-200">
        {rec.headline}
      </p>

      <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
        <span>คะแนนความเสี่ยง</span>
        <span className="font-semibold text-slate-200">{rec.score}/100</span>
      </div>

      {rec.equipment.length > 0 && (
        <ul className="space-y-2">
          {rec.equipment.map((r) => {
            const cat = EQUIPMENT_CATALOG[r.id];
            const Icon = EQUIPMENT_ICONS[r.id] ?? FALLBACK_ICON;
            return (
              <li key={r.id} className="flex items-start gap-3 rounded-xl bg-white/[0.04] p-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ocean-500/15 text-ocean-300">
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-100">{cat?.label ?? r.id}</p>
                  <p className="text-xs text-slate-400">{r.reason}</p>
                </div>
                <span className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-white">
                  ×{r.qty}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {rec.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {rec.notes.map((n) => (
            <li key={n} className="flex gap-2 text-xs text-slate-300">
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-slate-400" />
              {n}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {rec.tags.map((t) => (
          <span key={t} className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">
            #{t}
          </span>
        ))}
      </div>
    </section>
  );
}
