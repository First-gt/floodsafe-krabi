'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Bike,
  Brain,
  Car,
  CarFront,
  CheckCircle2,
  ChevronDown,
  Container,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Hospital,
  Home,
  Loader2,
  LocateFixed,
  MapPin,
  MapPinned,
  Mountain,
  Navigation,
  Pencil,
  RotateCw,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  Square,
  Truck,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { formatDistance } from '@/lib/geo';
import { DISTRICT_TH } from '@/lib/labels';
import { PLACES } from '@/lib/mock-data';
import type { RouteResult, RouteStep } from '@/lib/routing';
import type { GeoStatus } from '@/lib/use-geolocation';
import type { Place } from '@/lib/types';
import { VEHICLE_PRESETS, defaultProfile, type VehicleProfile, type VehicleType } from '@/lib/vehicle';
import { cn } from '@/lib/utils';

const QUICK_VEHICLES: { type: VehicleType; short: string }[] = [
  { type: 'motorcycle', short: 'มอเตอร์ไซค์' },
  { type: 'sedan', short: 'รถเก๋ง' },
  { type: 'suv', short: 'SUV' },
  { type: 'pickup', short: 'รถกระบะ' },
];

export interface Destination {
  name: string;
  coord: [number, number];
}

const MANEUVER_ICON: Record<RouteStep['maneuver'], LucideIcon> = {
  depart: Navigation,
  straight: ArrowUp,
  left: CornerUpLeft,
  'slight-left': CornerUpLeft,
  'sharp-left': CornerUpLeft,
  right: CornerUpRight,
  'slight-right': CornerUpRight,
  'sharp-right': CornerUpRight,
  uturn: Undo2,
  roundabout: RotateCw,
  arrive: Flag,
};

const KIND_ICON: Record<Place['kind'], LucideIcon> = {
  hospital: Hospital,
  shelter: Home,
  town: MapPinned,
  transport: Navigation,
  market: MapPinned,
};

const VEHICLE_ICON: Record<VehicleType, LucideIcon> = {
  motorcycle: Bike,
  sedan: Car,
  suv: CarFront,
  pickup: Truck,
  pickup4x4: Mountain,
  truck6: Container,
};

interface Props {
  vehicle: VehicleProfile | null;
  onQuickSelectVehicle: (v: VehicleProfile) => void;
  onEditVehicle: () => void;
  geoStatus: GeoStatus;
  /** พร้อมใช้ต้นทางแล้ว (GPS หรือตำแหน่งสาธิต) */
  locationReady: boolean;
  onEnableLocation: () => void;
  onUseDemo: () => void;
  originName: string;
  originIsGps: boolean;
  destination: Destination | null;
  onSelectDestination: (d: Destination) => void;
  onClear: () => void;
  route: RouteResult | null;
  planning: boolean;
  onNearestShelter: () => void;
  onRequestHelp: () => void;
  notice?: string | null;
  navigating: boolean;
  onStartNav: () => void;
  onStopNav: () => void;
  navStep: RouteStep | null;
  navDistToNext: number | null;
  onBack?: () => void;
}

export function RoutePlanner(p: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [nominatimResults, setNominatimResults] = useState<Place[]>([]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      setNominatimResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
        const res = await fetch(`${basePath}/api/places?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.results) {
          setNominatimResults(data.results);
        }
      } catch (err) {
        console.error('Place search failed:', err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local = PLACES.filter(
      (pl) => !q || pl.name.toLowerCase().includes(q) || pl.alias.toLowerCase().includes(q) || DISTRICT_TH[pl.district].includes(q),
    ).slice(0, 5);
    
    if (!q) return local;

    const combined = [...local];
    for (const nom of nominatimResults) {
      if (!combined.some(c => c.name === nom.name || (Math.abs(c.lng - nom.lng) < 0.0001 && Math.abs(c.lat - nom.lat) < 0.0001))) {
        combined.push(nom);
      }
    }
    return combined.slice(0, 6);
  }, [query, nominatimResults]);

  const select = (pl: Place) => {
    p.onSelectDestination({ name: pl.name, coord: [pl.lng, pl.lat] });
    setQuery('');
    setFocused(false);
  };

  const r = p.route;
  const VIcon = p.vehicle ? VEHICLE_ICON[p.vehicle.type] : Car;

  const stepDone1 = !!p.vehicle;
  const stepDone2 = p.locationReady;
  const stepDone3 = !!p.destination;

  return (
    <section
      className="glass flex min-h-0 max-h-full flex-col rounded-3xl sm:h-full sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:backdrop-blur-none"
      aria-label="วางแผนเส้นทางปลอดภัย"
    >
      <header className="border-b border-white/10">
        {p.onBack && (
          <div className="flex items-center border-b border-white/5 px-3 py-1.5 sm:px-4">
            <button
              type="button"
              onClick={p.onBack}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-ocean-300 transition hover:bg-white/10 hover:text-white"
            >
              ← กลับไปหน้าเลือก
            </button>
          </div>
        )}
        <button
          type="button"
          className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left sm:cursor-default"
          onClick={() => { if (window.innerWidth < 640) setCollapsed((c) => !c); }}
          aria-expanded={!collapsed}
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ocean-500/15 text-ocean-300">
            <ShieldCheck size={18} />
          </span>
          <span className="mr-auto leading-tight">
            <span className="block text-base font-bold text-white">เช็กเส้นทางหนีน้ำ</span>
            <span className="block text-xs text-slate-400">
              {p.destination ? `ปลายทาง: ${p.destination.name}` : 'ทำตาม 3 ขั้นตอนง่ายๆ เพื่อหาทางรอด'}
            </span>
          </span>
          <ChevronDown size={18} className={cn('text-slate-400 transition sm:hidden', collapsed && '-rotate-90')} />
        </button>
      </header>

      {!collapsed && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* แถบสรุป 3 ขั้นตอนให้เห็นภาพรวมทันที */}
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-navy-950/60 p-1.5 text-[11px] font-medium">
            <div className={cn('flex items-center justify-center gap-1 rounded-xl py-1.5', stepDone1 ? 'bg-safe/15 text-green-300' : 'bg-ocean-500/20 text-ocean-300')}>
              <span>{stepDone1 ? '✓' : '1.'}</span> เลือกรถ
            </div>
            <div className={cn('flex items-center justify-center gap-1 rounded-xl py-1.5', stepDone2 ? 'bg-safe/15 text-green-300' : stepDone1 ? 'bg-ocean-500/20 text-ocean-300' : 'text-slate-500')}>
              <span>{stepDone2 ? '✓' : '2.'}</span> จุดเริ่ม
            </div>
            <div className={cn('flex items-center justify-center gap-1 rounded-xl py-1.5', stepDone3 ? 'bg-safe/15 text-green-300' : stepDone2 ? 'bg-ocean-500/20 text-ocean-300' : 'text-slate-500')}>
              <span>{stepDone3 ? '✓' : '3.'}</span> ปลายทาง
            </div>
          </div>
          {/* ขั้นที่ 1: ข้อมูลรถ (แตะเลือก 1 ครั้งได้ทันที) */}
          {!p.vehicle ? (
            <div className="rounded-2xl border border-ocean-400/40 bg-ocean-500/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ocean-300">1. คุณใช้รถอะไร?</p>
                <button className="text-[11px] text-slate-400 underline-offset-2 hover:text-white hover:underline" onClick={p.onEditVehicle}>
                  รุ่นอื่น / ตั้งค่าเอง
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {QUICK_VEHICLES.map(({ type, short }) => {
                  const Icon = VEHICLE_ICON[type];
                  const depth = VEHICLE_PRESETS[type].maxDepthCm;
                  return (
                    <button
                      key={type}
                      onClick={() => p.onQuickSelectVehicle(defaultProfile(type, short))}
                      className="flex min-h-[48px] items-center gap-2.5 rounded-xl border border-white/10 bg-navy-950/60 px-3 text-left transition hover:border-ocean-400/60 hover:bg-ocean-500/15"
                    >
                      <Icon size={18} className="shrink-0 text-ocean-300" />
                      <span className="min-w-0 leading-tight">
                        <span className="block text-xs font-semibold text-white">{short}</span>
                        <span className="block text-[10px] text-slate-400">ลุยน้ำ ~{depth} ซม.</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <button
              onClick={p.onEditVehicle}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-left hover:bg-white/10"
              aria-label="เปลี่ยนข้อมูลรถ"
            >
              <VIcon size={18} className="shrink-0 text-ocean-300" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold text-white">{p.vehicle.model || VEHICLE_PRESETS[p.vehicle.type].label}</span>
                <span className="block text-[11px] text-slate-400">
                  ลุยน้ำได้สูงสุด {p.vehicle.maxDepthCm} ซม.
                </span>
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-ocean-300">
                <Pencil size={12} /> เปลี่ยน
              </span>
            </button>
          )}

          {/* ขั้นที่ 2: เปิดตำแหน่ง */}
          {p.vehicle && !p.locationReady && (
            <div className="rounded-2xl border border-ocean-400/40 bg-ocean-500/10 p-3">
              <p className="text-xs font-semibold text-ocean-300">2. จุดเริ่มต้นของคุณ</p>
              <p className="mt-0.5 text-xs text-slate-300">เปิด GPS เพื่อเริ่มนำทางจากจุดที่คุณอยู่</p>
              {p.geoStatus === 'denied' && (
                <p className="mt-2 rounded-lg bg-danger/10 p-2 text-xs text-red-300" role="alert">
                  ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง – กรุณาอนุญาตในเบราว์เซอร์ แล้วกดลองอีกครั้ง
                </p>
              )}
              {p.geoStatus === 'unsupported' && (
                <p className="mt-2 rounded-lg bg-danger/10 p-2 text-xs text-red-300" role="alert">
                  อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง
                </p>
              )}
              <button className="btn-primary mt-2.5 w-full" onClick={p.onEnableLocation} disabled={p.geoStatus === 'locating'}>
                {p.geoStatus === 'locating' ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
                {p.geoStatus === 'locating' ? 'กำลังหาตำแหน่ง…' : 'ใช้ตำแหน่งปัจจุบัน'}
              </button>
              <button className="mt-1.5 min-h-[40px] w-full rounded-xl border border-white/10 bg-white/[0.03] text-xs text-slate-300 hover:bg-white/10" onClick={p.onUseDemo}>
                หรือทดลองใช้พิกัด อ.หาดใหญ่ (สงขลา)
              </button>
            </div>
          )}

          {/* ขั้นที่ 3: ปลายทาง */}
          {p.vehicle && p.locationReady && (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
                <LocateFixed size={16} className={p.originIsGps ? 'text-sky-400' : 'text-slate-500'} />
                <span className="truncate text-slate-200">{p.originName}</span>
              </div>

              {!p.destination && (
                <p className="flex items-center gap-2 rounded-xl bg-safety/10 px-3 py-2 text-xs text-safety">
                  <MapPin size={14} className="shrink-0" />
                  <span>พิมพ์ชื่อสถานที่ด้านล่าง หรือ<b>แตะบนแผนที่</b>เพื่อเลือกจุดหมาย</span>
                </p>
              )}

              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="field pl-9 pr-10"
                  placeholder={p.destination ? p.destination.name : 'ค้นหาปลายทาง หรือแตะบนแผนที่'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setTimeout(() => setFocused(false), 150)}
                  aria-label="ปลายทาง"
                  aria-expanded={focused}
                />
                {(p.destination || query) && (
                  <button
                    className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-white/10"
                    onClick={() => {
                      setQuery('');
                      p.onClear();
                    }}
                    aria-label="ล้างปลายทาง"
                  >
                    <X size={16} />
                  </button>
                )}
                {focused && (
                  <ul className="glass absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-2xl p-1.5" role="listbox">
                    {matches.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">ไม่พบสถานที่ – ลองแตะบนแผนที่แทน</li>}
                    {matches.map((pl) => {
                      const Icon = KIND_ICON[pl.kind];
                      return (
                        <li key={pl.id}>
                          <button
                            role="option"
                            aria-selected={false}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => select(pl)}
                            className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-2.5 text-left hover:bg-white/10"
                          >
                            <Icon size={16} className="shrink-0 text-ocean-300" />
                            <span className="min-w-0 leading-tight">
                              <span className="block truncate text-sm text-slate-100">{pl.name}</span>
                              <span className="block truncate text-[11px] text-slate-500">อ.{DISTRICT_TH[pl.district]}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <button className="btn-ghost !min-h-[40px] w-full text-xs" onClick={p.onNearestShelter} disabled={p.planning}>
                <Home size={14} /> หาศูนย์พักพิงที่ใกล้และปลอดภัยที่สุด
              </button>
            </>
          )}

          {p.notice && (
            <p className="flex items-start gap-2 rounded-xl bg-sky-400/10 p-2.5 text-xs text-sky-200" role="status">
              <RouteIcon size={14} className="mt-0.5 shrink-0" /> {p.notice}
            </p>
          )}

          {/* กำลังวิเคราะห์ */}
          {p.destination && p.planning && !r && (
            <div className="flex items-center gap-3 rounded-2xl border border-ocean-400/30 bg-ocean-500/10 p-3 text-sm text-ocean-200" role="status">
              <Loader2 size={18} className="animate-spin" />
              <span>กำลังหาเส้นทางที่รถคุณผ่านได้…</span>
            </div>
          )}

          {/* ผลลัพธ์ */}
          {p.destination && r && r.status === 'none' && (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-red-200">ไม่พบเส้นทางไปยังปลายทางนี้</div>
          )}

          {p.destination && r && r.status !== 'none' && (
            <div
              className={cn(
                'rounded-2xl border p-3 transition-opacity',
                r.status === 'safe' ? 'border-safe/40 bg-safe/10' : 'border-danger/50 bg-danger/10',
                p.planning && 'opacity-60',
              )}
            >
              <div className="flex items-center gap-2">
                {r.status === 'safe' ? <CheckCircle2 size={20} className="shrink-0 text-safe" /> : <AlertTriangle size={20} className="shrink-0 text-red-300" />}
                <p className={cn('text-sm font-semibold leading-snug', r.status === 'safe' ? 'text-green-300' : 'text-red-300')}>
                  {r.status === 'safe' ? 'รถของคุณผ่านเส้นทางนี้ได้' : 'น้ำท่วมสูงเกินรถของคุณ'}
                </p>
                <p className="ml-auto shrink-0 text-right">
                  <span className="text-lg font-bold text-white">{Math.round(r.durationMin)} นาที</span>
                  <span className="ml-1.5 text-xs text-slate-400">{formatDistance(r.distance)}</span>
                </p>
              </div>

              {r.status === 'unsafe' && (
                <button className="btn-danger mt-2.5 !min-h-[44px] w-full text-sm" onClick={p.onRequestHelp}>
                  ขอความช่วยเหลือ
                </button>
              )}

              {/* เริ่มนำทาง (Primary CTA) */}
              {!p.navigating ? (
                r.status === 'safe' && (
                  <button className="btn-primary mt-2.5 w-full" onClick={p.onStartNav} disabled={p.planning}>
                    <Navigation size={18} /> เริ่มนำทาง
                  </button>
                )
              ) : (
                <div className="mt-2.5 space-y-2">
                  {p.navStep && (
                    <div className="flex items-center gap-3 rounded-xl bg-ocean-500/20 p-3" role="status" aria-live="polite">
                      {(() => {
                        const I = MANEUVER_ICON[p.navStep.maneuver];
                        return <I size={28} className="shrink-0 text-ocean-300" />;
                      })()}
                      <div className="min-w-0 leading-tight">
                        <p className="text-sm font-semibold text-white">{p.navStep.instruction}</p>
                        {p.navDistToNext != null && <p className="text-xs text-slate-300">อีก {formatDistance(p.navDistToNext)}</p>}
                        {p.navStep.warning && <p className="mt-0.5 text-xs text-amber-300">{p.navStep.warning}</p>}
                      </div>
                    </div>
                  )}
                  <button className="btn-ghost w-full" onClick={p.onStopNav}>
                    <Square size={16} /> หยุดนำทาง
                  </button>
                </div>
              )}

              {/* รายละเอียดเพิ่มเติม (ซ่อนไว้เป็นค่าเริ่มต้น ลดความรก) */}
              <button
                className="mt-2 flex min-h-[40px] w-full items-center gap-2 rounded-lg px-1 text-xs font-medium text-ocean-300 hover:bg-white/5"
                onClick={() => setShowWhy((s) => !s)}
                aria-expanded={showWhy}
              >
                <Brain size={14} /> ทำไมถึงเลือกเส้นทางนี้? {r.hazards.length > 0 ? `(มีจุดน้ำท่วม ${r.hazards.length} จุด)` : ''}
                <ChevronDown size={16} className={cn('ml-auto transition', showWhy && 'rotate-180')} />
              </button>
              {showWhy && (
                <div className="space-y-2 pb-1">
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {r.reasoning.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ocean-400" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                  {r.hazards.length > 0 && (
                    <div>
                      <p className="mb-1 text-[11px] font-semibold tracking-wider text-slate-400">จุดน้ำท่วมบนเส้นทางนี้</p>
                      <ul className="space-y-1">
                        {r.hazards.slice(0, 6).map((h) => (
                          <li key={h.id} className="flex items-center gap-2 rounded-lg bg-navy-950/50 px-2 py-1.5 text-xs">
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-bold text-navy-950"
                              style={{ background: !h.passable ? '#ef4444' : h.depthCm >= 20 ? '#f59e0b' : '#22c55e' }}
                            >
                              {Math.round(h.depthCm)} ซม.
                            </span>
                            <span className="truncate text-slate-200">{h.name}</span>
                            <span className={cn('ml-auto shrink-0', h.passable ? 'text-green-300' : 'text-red-300')}>
                              {h.passable ? 'ผ่านได้' : 'ผ่านไม่ได้'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.avoided.length > 0 && (
                    <p className="text-[11px] text-slate-400">
                      เส้นประสีแดง = ทางลัดที่น้ำท่วมสูงเกินรถคุณ (หลบให้แล้ว {r.avoided.length} จุด)
                    </p>
                  )}
                </div>
              )}

              <button
                className="mt-1 flex min-h-[40px] w-full items-center justify-between rounded-lg px-1 text-xs font-medium text-ocean-300 hover:bg-white/5"
                onClick={() => setShowSteps((s) => !s)}
                aria-expanded={showSteps}
              >
                ดูวิธีเลี้ยวทีละจุด ({r.steps.length} ขั้นตอน)
                <ChevronDown size={16} className={cn('transition', showSteps && 'rotate-180')} />
              </button>
              {showSteps && (
                <ol className="mt-1 space-y-1">
                  {r.steps.map((s, i) => {
                    const Icon = MANEUVER_ICON[s.maneuver];
                    return (
                      <li key={i} className="flex gap-2.5 rounded-lg bg-navy-950/50 p-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-ocean-300">
                          <Icon size={14} />
                        </span>
                        <div className="min-w-0 text-xs">
                          <p className="text-slate-100">{s.instruction}</p>
                          {s.distance > 0 && <p className="text-slate-500">{formatDistance(s.distance)}</p>}
                          {s.warning && (
                            <p
                              className={cn(
                                'mt-0.5 flex items-center gap-1',
                                p.vehicle && s.maxDepthCm > p.vehicle.maxDepthCm ? 'text-red-300' : 'text-amber-300',
                              )}
                            >
                              <AlertTriangle size={11} /> {s.warning}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
