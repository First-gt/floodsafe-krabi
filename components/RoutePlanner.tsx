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
import { VEHICLE_PRESETS, type VehicleProfile, type VehicleType } from '@/lib/vehicle';
import { cn } from '@/lib/utils';

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
}

export function RoutePlanner(p: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [showWhy, setShowWhy] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 640);
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

  return (
    <section className="glass flex min-h-0 max-h-full flex-col rounded-3xl" aria-label="วางแผนเส้นทางปลอดภัย">
      <button className="flex min-h-[52px] items-center gap-3 px-4 text-left" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-ocean-500/15 text-ocean-300">
          <ShieldCheck size={18} />
        </span>
        <span className="mr-auto leading-tight">
          <span className="block text-sm font-semibold text-white">AI นำทางหลบน้ำท่วม</span>
          <span className="block text-[11px] text-slate-400">
            {p.destination ? `ไป ${p.destination.name}` : 'เลือกเส้นทางที่รถของคุณลุยผ่านได้'}
          </span>
        </span>
        <ChevronDown size={18} className={cn('text-slate-400 transition', collapsed && '-rotate-90')} />
      </button>

      {!collapsed && (
        <div className="min-h-0 space-y-3 overflow-y-auto px-4 pb-4">
          {/* ขั้นที่ 1: ข้อมูลรถ */}
          {!p.vehicle ? (
            <div className="rounded-2xl border border-ocean-400/40 bg-ocean-500/10 p-3">
              <p className="text-[11px] font-semibold tracking-wider text-ocean-300">ขั้นที่ 1 จาก 3</p>
              <p className="mt-0.5 text-sm font-semibold text-white">ระบุข้อมูลรถของคุณ</p>
              <p className="mt-1 text-xs text-slate-400">AI ต้องรู้ประเภทและความสูงน้ำที่รถลุยได้ เพื่อเลือกถนนที่ผ่านได้จริง</p>
              <button className="btn-primary mt-3 w-full" onClick={p.onEditVehicle}>
                <Car size={18} /> ระบุข้อมูลรถ
              </button>
            </div>
          ) : (
            <button
              onClick={p.onEditVehicle}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-left hover:bg-white/10"
              aria-label="แก้ไขข้อมูลรถ"
            >
              <VIcon size={20} className="shrink-0 text-ocean-300" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold text-white">{p.vehicle.model || VEHICLE_PRESETS[p.vehicle.type].label}</span>
                <span className="block text-[11px] text-slate-400">
                  {VEHICLE_PRESETS[p.vehicle.type].label} · ลุยน้ำได้ไม่เกิน {p.vehicle.maxDepthCm} ซม.
                </span>
              </span>
              <Pencil size={14} className="ml-auto shrink-0 text-slate-500" />
            </button>
          )}

          {/* ขั้นที่ 2: เปิดตำแหน่ง */}
          {p.vehicle && !p.locationReady && (
            <div className="rounded-2xl border border-ocean-400/40 bg-ocean-500/10 p-3">
              <p className="text-[11px] font-semibold tracking-wider text-ocean-300">ขั้นที่ 2 จาก 3</p>
              <p className="mt-0.5 text-sm font-semibold text-white">เปิดตำแหน่งของคุณ</p>
              <p className="mt-1 text-xs text-slate-400">ใช้เป็นจุดเริ่มต้นนำทาง และตรวจหาน้ำท่วมรอบตัวคุณ</p>
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
              <button className="btn-primary mt-3 w-full" onClick={p.onEnableLocation} disabled={p.geoStatus === 'locating'}>
                {p.geoStatus === 'locating' ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
                {p.geoStatus === 'locating' ? 'กำลังหาตำแหน่ง…' : 'เปิดตำแหน่ง'}
              </button>
              <button className="mt-1 min-h-[40px] w-full text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline" onClick={p.onUseDemo}>
                ทดลองใช้ตำแหน่งสาธิต (อ.อ่าวลึก)
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
                <p className="flex items-start gap-2 rounded-xl bg-safety/10 p-2.5 text-xs text-safety">
                  <MapPin size={14} className="mt-0.5 shrink-0" />
                  <span>
                    <b>ขั้นที่ 3:</b> แตะบนแผนที่เพื่อปักหมุดปลายทาง หรือค้นหาสถานที่ด้านล่าง
                  </span>
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
              <span>AI กำลังวิเคราะห์เส้นทางกับรายงานน้ำท่วมจากประชาชน…</span>
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
                {r.status === 'safe' ? <CheckCircle2 size={20} className="text-safe" /> : <AlertTriangle size={20} className="text-red-300" />}
                <p className={cn('text-sm font-semibold', r.status === 'safe' ? 'text-green-300' : 'text-red-300')}>
                  {r.status === 'safe' ? 'พบเส้นทางที่รถของคุณผ่านได้' : 'ไม่มีเส้นทางที่รถของคุณผ่านได้'}
                </p>
                <p className="ml-auto text-right">
                  <span className="text-lg font-bold text-white">{Math.round(r.durationMin)} นาที</span>
                  <span className="ml-1.5 text-xs text-slate-400">{formatDistance(r.distance)}</span>
                </p>
              </div>

              {r.status === 'unsafe' && (
                <button className="btn-danger mt-2 !min-h-[40px] w-full text-xs" onClick={p.onRequestHelp}>
                  ขอความช่วยเหลือ
                </button>
              )}

              {/* AI เหตุผล */}
              <button
                className="mt-2 flex min-h-[40px] w-full items-center gap-2 rounded-lg px-1 text-xs font-medium text-ocean-300"
                onClick={() => setShowWhy((s) => !s)}
                aria-expanded={showWhy}
              >
                <Brain size={14} /> AI อธิบายการตัดสินใจ
                <ChevronDown size={16} className={cn('ml-auto transition', showWhy && 'rotate-180')} />
              </button>
              {showWhy && (
                <div className="space-y-2">
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
                      <p className="mb-1 text-[11px] font-semibold tracking-wider text-slate-400">รายงานน้ำท่วมบนเส้นทางนี้</p>
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
                      เส้นประสีแดงบนแผนที่ = เส้นทางที่เร็วที่สุดซึ่ง AI ปฏิเสธ (หลบ {r.avoided.length} จุด)
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    แหล่งเส้นทาง: {r.source === 'osrm' ? 'ถนนจริง (OSRM / OpenStreetMap)' : 'แผนที่ถนนสำรองในเครื่อง (ออฟไลน์)'}
                  </p>
                </div>
              )}

              {/* เริ่มนำทาง */}
              {!p.navigating ? (
                <button className="btn-primary mt-2 w-full" onClick={p.onStartNav} disabled={p.planning || r.status !== 'safe'}>
                  <Navigation size={18} /> เริ่มนำทาง
                </button>
              ) : (
                <div className="mt-2 space-y-2">
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

              <button
                className="mt-1 flex min-h-[40px] w-full items-center justify-between rounded-lg px-1 text-xs font-medium text-ocean-300"
                onClick={() => setShowSteps((s) => !s)}
                aria-expanded={showSteps}
              >
                นำทางทีละจุด · {r.steps.length} ขั้นตอน
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
