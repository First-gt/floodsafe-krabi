'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Layers, ListChecks, Map as MapIcon, Waves } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { DepthLegend } from '@/components/DepthLegend';
import { EQUIPMENT_ICONS, FALLBACK_ICON } from '@/components/equipment-icons';
import { IncidentCard } from '@/components/IncidentCard';
import { FloodMap } from '@/components/MapView';
import { EQUIPMENT_CATALOG } from '@/lib/ai-engine';
import type { LngLat } from '@/lib/geo';
import { KRABI_CENTER } from '@/lib/mock-data';
import { useFloodStore } from '@/lib/store';
import type { IncidentStatus } from '@/lib/types';
import { PRIORITY_ORDER, cn } from '@/lib/utils';

type Filter = 'all' | IncidentStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'pending', label: 'รอดำเนินการ' },
  { id: 'dispatched', label: 'ส่งทีมแล้ว' },
  { id: 'rescued', label: 'ช่วยแล้ว' },
];

export default function DashboardPage() {
  const { incidents, checkpoints, zones, teams, equipment } = useFloodStore();
  const [filter, setFilter] = useState<Filter>('pending');
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [heat, setHeat] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [flyTo, setFlyTo] = useState<{ center: LngLat; zoom?: number; key: number } | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const counts = useMemo(() => {
    const c = { all: incidents.length, pending: 0, dispatched: 0, rescued: 0 };
    incidents.forEach((i) => c[i.status]++);
    return c;
  }, [incidents]);
  const critical = incidents.filter((i) => i.status === 'pending' && i.recommendation.priority === 'critical').length;

  const list = useMemo(
    () =>
      incidents
        .filter((i) => filter === 'all' || i.status === filter)
        .sort((a, b) => PRIORITY_ORDER[a.recommendation.priority] - PRIORITY_ORDER[b.recommendation.priority] || b.createdAt - a.createdAt),
    [incidents, filter],
  );

  const select = (id: string, fly = true) => {
    setSelected(id);
    const inc = incidents.find((i) => i.id === id);
    if (inc && fly) setFlyTo({ center: [inc.lng, inc.lat], zoom: 13.5, key: Date.now() });
  };

  // selecting on the map → show the matching list item
  const onMapSelect = (id: string) => {
    const inc = incidents.find((i) => i.id === id);
    if (inc && filter !== 'all' && inc.status !== filter) setFilter(inc.status);
    select(id, false);
    setTimeout(() => cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  };

  useEffect(() => {
    if (selected && !list.some((i) => i.id === selected)) setSelected(null);
  }, [list, selected]);

  const stats = [
    { label: 'รอดำเนินการ', value: counts.pending, cls: 'text-yellow-300' },
    { label: 'วิกฤต', value: critical, cls: 'text-red-300' },
    { label: 'ส่งทีมแล้ว', value: counts.dispatched, cls: 'text-sky-300' },
    { label: 'ช่วยแล้ว', value: counts.rescued, cls: 'text-green-300' },
  ];

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />

      {/* stats + resources */}
      <div className="glass flex shrink-0 items-center gap-3 overflow-x-auto border-x-0 border-t-0 px-3 py-2 sm:px-5">
        <div className="flex items-center gap-4 pr-2">
          {stats.map((s) => (
            <div key={s.label} className="leading-tight">
              <p className={cn('text-xl font-bold', s.cls)}>{s.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="mx-1 h-9 w-px shrink-0 bg-white/10" />
        <div className="flex items-center gap-2" aria-label="สต็อกอุปกรณ์">
          {equipment
            .filter((e) => ['boat', 'truck6', 'swift_kit', 'medic_kit', 'life_jacket'].includes(e.id))
            .map((e) => {
              const Icon = EQUIPMENT_ICONS[e.id] ?? FALLBACK_ICON;
              const low = e.available / e.total < 0.3;
              return (
                <span
                  key={e.id}
                  title={EQUIPMENT_CATALOG[e.id].label}
                  className={cn('flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs', low ? 'bg-danger/15 text-red-300' : 'bg-white/5 text-slate-300')}
                >
                  <Icon size={14} />
                  <b>{e.available}</b>
                  <span className="text-slate-500">/{e.total}</span>
                </span>
              );
            })}
          <span className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-300">
            ทีมว่าง <b>{teams.filter((t) => t.status === 'available').length}</b>
            <span className="text-slate-500">/{teams.length}</span>
          </span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* list */}
        <aside className={cn('min-h-0 w-full flex-col border-white/10 bg-navy-950 lg:flex lg:w-[440px] lg:shrink-0 lg:border-r', view === 'list' ? 'flex flex-1' : 'hidden')}>
          <div className="flex shrink-0 gap-1 overflow-x-auto p-3" role="tablist" aria-label="กรองตามสถานะ">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm transition',
                  filter === f.id ? 'bg-ocean-500 font-semibold text-navy-950' : 'bg-white/5 text-slate-300 hover:bg-white/10',
                )}
              >
                {f.label}
                <span className={cn('rounded-full px-1.5 text-[11px]', filter === f.id ? 'bg-navy-950/20' : 'bg-white/10')}>{counts[f.id]}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-24 lg:pb-4">
            {list.length === 0 && (
              <div className="grid place-items-center gap-2 py-16 text-center text-sm text-slate-500">
                <Waves size={32} />
                ไม่มีเหตุการณ์ในสถานะนี้
              </div>
            )}
            {list.map((i) => (
              <div key={i.id} ref={(el) => { cardRefs.current[i.id] = el; }}>
                <IncidentCard
                  incident={i}
                  selected={selected === i.id}
                  onSelect={() => (selected === i.id ? setSelected(null) : select(i.id))}
                  onViewMap={() => {
                    select(i.id);
                    setView('map');
                  }}
                />
              </div>
            ))}
          </div>
        </aside>

        {/* map */}
        <section className={cn('relative min-h-0 flex-1 lg:block', view === 'map' ? 'block' : 'hidden')} aria-label="แผนที่เหตุการณ์">
          <FloodMap
            checkpoints={checkpoints}
            zones={zones}
            incidents={incidents}
            compactCheckpoints
            showZones={showZones}
            showHeatmap={heat}
            selectedIncidentId={selected}
            onSelectIncident={onMapSelect}
            flyTo={flyTo}
            initialCenter={KRABI_CENTER}
            initialZoom={8.9}
          />
          <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
            <div className="glass flex flex-col overflow-hidden rounded-2xl">
              <button
                onClick={() => setHeat((h) => !h)}
                aria-pressed={heat}
                aria-label="Heatmap ระดับน้ำ"
                title="Heatmap ระดับน้ำ"
                className={cn('flex h-12 items-center gap-2 px-3 text-xs transition hover:bg-white/10', heat ? 'text-orange-300' : 'text-slate-300')}
              >
                <Flame size={18} /> <span className="hidden sm:inline">Heatmap ระดับน้ำ</span>
              </button>
              <button
                onClick={() => setShowZones((z) => !z)}
                aria-pressed={showZones}
                aria-label="พื้นที่น้ำท่วมจากดาวเทียม"
                title="พื้นที่น้ำท่วมจากดาวเทียม"
                className={cn('flex h-12 items-center gap-2 border-t border-white/10 px-3 text-xs transition hover:bg-white/10', showZones ? 'text-ocean-300' : 'text-slate-300')}
              >
                <Layers size={18} /> <span className="hidden sm:inline">พื้นที่น้ำท่วม</span>
              </button>
            </div>
          </div>
          <DepthLegend compact className="absolute bottom-24 left-3 z-10 hidden w-56 sm:block lg:bottom-6" />
        </section>

        {/* mobile list/map switch */}
        <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center lg:hidden">
          <div className="glass flex rounded-full p-1">
            {(
              [
                { id: 'list', label: 'เหตุการณ์', icon: ListChecks },
                { id: 'map', label: 'แผนที่', icon: MapIcon },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                aria-pressed={view === t.id}
                className={cn('flex min-h-[48px] items-center gap-2 rounded-full px-5 text-sm', view === t.id ? 'bg-ocean-500 font-semibold text-navy-950' : 'text-slate-300')}
              >
                <t.icon size={16} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
