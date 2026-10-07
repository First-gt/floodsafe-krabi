'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Car, Info, Layers, LocateFixed, Phone, Plus, X } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { DepthLegend } from '@/components/DepthLegend';
import { HotlineSheet } from '@/components/HotlineSheet';
import { FloodMap } from '@/components/MapView';
import { ReportSheet } from '@/components/ReportSheet';
import { RoutePlanner, type Destination } from '@/components/RoutePlanner';
import { VehicleSetup } from '@/components/VehicleSetup';
import { haversine, type LngLat } from '@/lib/geo';
import { DEMO_ORIGIN, KRABI_CENTER, PLACES } from '@/lib/mock-data';
import type { RouteResult } from '@/lib/routing';
import { distToLine } from '@/lib/route-eval';
import { planRoute } from '@/lib/smart-route';
import { useFloodStore } from '@/lib/store';
import { useGeolocation } from '@/lib/use-geolocation';
import { loadVehicle, saveVehicle, type VehicleProfile } from '@/lib/vehicle';
import { cn } from '@/lib/utils';

/** ระยะ (ม.) ที่ถือว่าออกนอกเส้นทาง */
const OFF_ROUTE_M = 150;

export default function CitizenPage() {
  const { checkpoints } = useFloodStore();
  const gps = useGeolocation();

  const [vehicle, setVehicle] = useState<VehicleProfile | null>(null);
  const [vehicleReady, setVehicleReady] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [useDemo, setUseDemo] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [planning, setPlanning] = useState(false);
  const [routeOrigin, setRouteOrigin] = useState<LngLat | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [showLegend, setShowLegend] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [hotlineOpen, setHotlineOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<{ center: LngLat; zoom?: number; key: number } | null>(null);
  const [fitTo, setFitTo] = useState<{ coords: LngLat[]; key: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [padding, setPadding] = useState({ top: 80, bottom: 120, left: 60, right: 60 });
  const { zones } = useFloodStore();

  // โหลดข้อมูลรถที่เคยบันทึกไว้ – ถ้ายังไม่มีให้บังคับกรอก
  useEffect(() => {
    const v = loadVehicle();
    setVehicle(v);
    setVehicleReady(true);
    if (!v) setVehicleOpen(true);
    // ผู้ใช้ใหม่: เปิดคำอธิบายสัญลักษณ์ให้ดูครั้งแรก (เฉพาะจอใหญ่ เพื่อไม่บังแผนที่บนมือถือ)
    try {
      if (!localStorage.getItem('floodsafe.legend.seen') && window.innerWidth >= 640) {
        setShowLegend(true);
        localStorage.setItem('floodsafe.legend.seen', '1');
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const update = () =>
      setPadding(
        window.innerWidth >= 640
          ? { top: 80, bottom: 120, left: 460, right: 80 }
          : { top: Math.round(window.innerHeight * 0.55), bottom: 110, left: 40, right: 40 },
      );
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const hasGps = gps.status === 'ready' && !!gps.position;
  const locationReady = hasGps || useDemo;
  const usingGps = hasGps && gps.insideKrabi;
  const origin: LngLat = usingGps ? gps.position! : DEMO_ORIGIN.coord;
  const originName = usingGps
    ? 'ตำแหน่งของฉัน (GPS)'
    : hasGps
      ? `${DEMO_ORIGIN.name} – GPS ของคุณอยู่นอกจังหวัดกระบี่`
      : DEMO_ORIGIN.name;

  const originRef = useRef(origin);
  originRef.current = origin;

  // กำหนดต้นทางของการคำนวณ (ล็อกไว้ เพื่อไม่ให้ขอเส้นทางใหม่ทุกครั้งที่ GPS ขยับ)
  useEffect(() => {
    if (!destination || !vehicle || !locationReady) {
      setRouteOrigin(null);
      return;
    }
    setRouteOrigin(originRef.current);
  }, [destination, vehicle, locationReady]);

  // คำนวณเส้นทางด้วย AI (ถนนจริง + รายงานน้ำท่วม)
  const checkpointsRef = useRef(checkpoints);
  checkpointsRef.current = checkpoints;
  useEffect(() => {
    if (!destination || !vehicle || !routeOrigin) {
      setRoute(null);
      setPlanning(false);
      return;
    }
    const ctrl = new AbortController();
    setPlanning(true);
    planRoute(routeOrigin, destination.coord, vehicle, checkpoints, destination.name, ctrl.signal)
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setRoute(r);
        setPlanning(false);
      })
      .catch((e) => {
        if ((e as Error)?.name === 'AbortError') return;
        setPlanning(false);
      });
    return () => ctrl.abort();
  }, [destination, vehicle, routeOrigin, checkpoints]);

  // ล้างเส้นทางเก่าเมื่อเปลี่ยนปลายทาง/รถ
  useEffect(() => {
    setRoute(null);
    setNavigating(false);
  }, [destination, vehicle]);

  // ปรับกล้องให้เห็นทั้งเส้นทางเมื่อได้เส้นใหม่
  const fitSig = useRef('');
  useEffect(() => {
    if (!route || route.coords.length < 2 || !destination) return;
    const sig = `${destination.coord.join(',')}|${vehicle?.maxDepthCm}|${routeOrigin?.join(',')}`;
    if (fitSig.current === sig) return;
    fitSig.current = sig;
    setFitTo({ coords: [...route.coords, ...(route.baseline?.coords ?? [])], key: Date.now() });
  }, [route, destination, vehicle, routeOrigin]);

  // แจ้งเตือนเมื่อระดับน้ำเปลี่ยนแล้วเส้นทางเปลี่ยน
  const prev = useRef<{ key: string; sig: string } | null>(null);
  useEffect(() => {
    if (!route || !destination) {
      prev.current = null;
      return;
    }
    const key = `${destination.coord.join(',')}|${vehicle?.maxDepthCm}`;
    const sig = `${route.status}|${route.coords.length}|${Math.round(route.distance / 50)}`;
    if (prev.current && prev.current.key === key && prev.current.sig !== sig) {
      setNotice(
        route.status === 'safe'
          ? 'ระดับน้ำที่ประชาชนรายงานเปลี่ยน – AI คำนวณเส้นทางใหม่แล้ว'
          : 'ระดับน้ำเปลี่ยน – ขณะนี้ไม่มีเส้นทางที่รถของคุณผ่านได้',
      );
      const t = setTimeout(() => setNotice(null), 9000);
      prev.current = { key, sig };
      return () => clearTimeout(t);
    }
    prev.current = { key, sig };
  }, [route, destination, vehicle]);

  // ---------- โหมดนำทาง ----------
  const stepIdx = useMemo(() => {
    if (!route) return [];
    return route.steps.map((s) => {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < route.coords.length; i++) {
        const d = (route.coords[i][0] - s.location[0]) ** 2 + (route.coords[i][1] - s.location[1]) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    });
  }, [route]);

  const livePos: LngLat = usingGps ? gps.position! : (routeOrigin ?? origin);
  const nav = useMemo(() => {
    if (!navigating || !route || route.steps.length === 0) return { step: null, dist: null };
    let uIdx = 0;
    let bd = Infinity;
    for (let i = 0; i < route.coords.length; i++) {
      const d = (route.coords[i][0] - livePos[0]) ** 2 + (route.coords[i][1] - livePos[1]) ** 2;
      if (d < bd) {
        bd = d;
        uIdx = i;
      }
    }
    let k = route.steps.findIndex((_, i) => i > 0 && stepIdx[i] > uIdx);
    if (k < 0) k = route.steps.length - 1;
    const s = route.steps[k];
    return { step: s, dist: haversine(livePos, s.location) };
  }, [navigating, route, stepIdx, livePos]);

  // ออกนอกเส้นทาง → คำนวณใหม่จากตำแหน่งปัจจุบัน
  useEffect(() => {
    if (!navigating || !usingGps || !route || planning) return;
    if (distToLine(livePos, route.coords, OFF_ROUTE_M * 2) > OFF_ROUTE_M) {
      setRouteOrigin(livePos);
      setNotice('ออกนอกเส้นทาง – AI กำลังคำนวณเส้นทางใหม่จากตำแหน่งปัจจุบัน');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePos[0], livePos[1], navigating]);

  // ---------- ปลายทาง ----------
  const ready = !!vehicle && locationReady;

  const dropPin = useCallback(
    (p: LngLat) => {
      if (!vehicle) {
        setVehicleOpen(true);
        return;
      }
      if (!locationReady) {
        setNotice('กรุณาเปิดตำแหน่งของคุณก่อน แล้วจึงปักหมุดปลายทางได้');
        return;
      }
      const near = PLACES.map((pl) => ({ pl, d: haversine(p, [pl.lng, pl.lat]) })).sort((a, b) => a.d - b.d)[0];
      setDestination(near && near.d < 350 ? { name: near.pl.name, coord: [near.pl.lng, near.pl.lat] } : { name: 'หมุดปลายทางที่ปักไว้', coord: p });
    },
    [vehicle, locationReady],
  );

  const nearestShelter = useCallback(async () => {
    if (!vehicle) return;
    setPlanning(true);
    setNotice('AI กำลังเปรียบเทียบศูนย์พักพิงทุกแห่ง…');
    try {
      const shelters = PLACES.filter((p) => p.kind === 'shelter');
      const results = await Promise.all(
        shelters.map(async (p) => ({ p, r: await planRoute(originRef.current, [p.lng, p.lat], vehicle, checkpointsRef.current, p.name) })),
      );
      const ok = results.filter((s) => s.r.status === 'safe').sort((a, b) => a.r.durationMin - b.r.durationMin);
      const best = ok[0] ?? results.filter((s) => s.r.status !== 'none').sort((a, b) => a.r.maxDepthCm - b.r.maxDepthCm)[0];
      if (best) {
        setDestination({ name: best.p.name, coord: [best.p.lng, best.p.lat] });
        setNotice(ok[0] ? `เลือก ${best.p.name} – เส้นทางที่รถของคุณผ่านได้และเร็วที่สุด` : 'ไม่มีศูนย์พักพิงที่ไปถึงได้อย่างปลอดภัย แสดงเส้นที่น้ำน้อยที่สุด');
      }
    } finally {
      setPlanning(false);
    }
  }, [vehicle]);

  const locateMe = () => {
    if (!hasGps) {
      gps.request();
      return;
    }
    setFlyTo({ center: origin, zoom: 13, key: Date.now() });
  };

  // เมื่อเริ่มได้ตำแหน่งแล้ว ให้บินไปยังตำแหน่งนั้น
  const flewRef = useRef(false);
  useEffect(() => {
    if (locationReady && !flewRef.current) {
      flewRef.current = true;
      setFlyTo({ center: originRef.current, zoom: 12.5, key: Date.now() });
    }
  }, [locationReady]);

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="relative min-h-0 flex-1">
        <FloodMap
          checkpoints={checkpoints}
          zones={zones}
          route={route}
          origin={destination && routeOrigin ? routeOrigin : null}
          destination={destination?.coord ?? null}
          userLocation={usingGps ? gps.position : locationReady ? origin : null}
          showZones={showZones}
          pickMode={ready}
          onMapClick={dropPin}
          places={PLACES}
          onPlaceClick={(pl) => dropPin([pl.lng, pl.lat])}
          showDistrictLabels
          flyTo={flyTo}
          fitTo={fitTo}
          padding={padding}
          initialCenter={[98.93, 8.17]}
          initialZoom={9.6}
        />

        {/* planner */}
        <div className="pointer-events-none absolute inset-x-2 bottom-24 top-2 z-10 flex flex-col sm:inset-x-auto sm:left-4 sm:top-4 sm:w-[420px]">
          <div className="pointer-events-auto flex max-h-[54dvh] min-h-0 flex-col sm:max-h-full">
            {vehicleReady && (
              <RoutePlanner
                vehicle={vehicle}
                onEditVehicle={() => setVehicleOpen(true)}
                geoStatus={gps.status}
                locationReady={locationReady}
                onEnableLocation={() => gps.request()}
                onUseDemo={() => setUseDemo(true)}
                originName={originName}
                originIsGps={usingGps}
                destination={destination}
                onSelectDestination={setDestination}
                onClear={() => setDestination(null)}
                route={route}
                planning={planning}
                onNearestShelter={nearestShelter}
                onRequestHelp={() => setReportOpen(true)}
                notice={notice}
                navigating={navigating}
                onStartNav={() => setNavigating(true)}
                onStopNav={() => setNavigating(false)}
                navStep={nav.step}
                navDistToNext={nav.dist}
              />
            )}
          </div>
        </div>

        {/* map tools */}
        <div className="absolute bottom-28 right-3 z-10 flex flex-col items-end gap-2 sm:bottom-24">
          {showLegend && (
            <div className="relative max-h-[50dvh] w-72 animate-fade overflow-y-auto rounded-2xl">
              <DepthLegend full />
              <button className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-white/10" onClick={() => setShowLegend(false)} aria-label="ปิดคำอธิบาย">
                <X size={14} />
              </button>
            </div>
          )}
          <div className="glass flex flex-col overflow-hidden rounded-2xl">
            <ToolBtn label="คำอธิบายสัญลักษณ์" active={showLegend} onClick={() => setShowLegend((s) => !s)}>
              <Info size={20} />
            </ToolBtn>
            <ToolBtn label="พื้นที่น้ำท่วมจากดาวเทียม" active={showZones} onClick={() => setShowZones((s) => !s)}>
              <Layers size={20} />
            </ToolBtn>
            <ToolBtn label="สายด่วนช่วยเหลือ (ปภ. 1784 / แพทย์ฉุกเฉิน 1669)" onClick={() => setHotlineOpen(true)}>
              <Phone size={20} className="text-red-400" />
            </ToolBtn>
            <ToolBtn label="ข้อมูลรถของฉัน" onClick={() => setVehicleOpen(true)}>
              <Car size={20} />
            </ToolBtn>
            <ToolBtn label="ตำแหน่งของฉัน" onClick={locateMe}>
              <LocateFixed size={20} />
            </ToolBtn>
          </div>
        </div>

        {/* report FAB */}
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
          <button
            onClick={() => setReportOpen(true)}
            className="btn-danger pointer-events-auto !min-h-[56px] gap-2 rounded-full px-6 text-base shadow-2xl shadow-danger/40"
          >
            <Plus size={20} strokeWidth={3} />
            แจ้งน้ำท่วม / ขอความช่วยเหลือ
          </button>
        </div>

        {ready && !destination && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 hidden justify-center sm:flex">
            <p className={cn('glass animate-fade rounded-full px-4 py-2 text-xs text-slate-200')} style={{ marginLeft: 440 }}>
              แตะบนแผนที่เพื่อปักหมุดปลายทาง
            </p>
          </div>
        )}

        {/* สถานะตำแหน่ง + แหล่งข้อมูล */}
        <div className="pointer-events-none absolute right-3 top-3 z-10 hidden max-w-[60%] flex-col items-end gap-1.5 sm:flex">
          <p className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] text-slate-200">
            <span className={cn('h-2 w-2 rounded-full', usingGps ? 'bg-safe' : hasGps ? 'bg-safety' : useDemo ? 'bg-safety' : 'bg-slate-500')} />
            {usingGps
              ? `ตำแหน่งจริงจาก GPS${gps.accuracy ? ` (±${Math.round(gps.accuracy)} ม.)` : ''}`
              : hasGps
                ? 'GPS อยู่นอกกระบี่ – ใช้ตำแหน่งสาธิต'
                : useDemo
                  ? 'ตำแหน่งสาธิต (ไม่ใช่ GPS จริง)'
                  : gps.status === 'locating'
                    ? 'กำลังหาตำแหน่ง…'
                    : 'ยังไม่ได้เปิดตำแหน่ง'}
          </p>
          <p className="glass rounded-full px-3 py-1.5 text-[11px] text-yellow-200">ระดับน้ำ/พื้นที่น้ำท่วม: ข้อมูลจำลอง</p>
        </div>
      </main>

      <VehicleSetup
        open={vehicleOpen}
        required={!vehicle}
        initial={vehicle}
        onSave={(v) => {
          saveVehicle(v);
          setVehicle(v);
          setVehicleOpen(false);
        }}
        onClose={() => setVehicleOpen(false)}
      />
      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} gps={gps} />
      {hotlineOpen && <HotlineSheet onClose={() => setHotlineOpen(false)} />}
    </div>
  );
}

function ToolBtn({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn('grid h-12 w-12 place-items-center transition hover:bg-white/10', active ? 'text-ocean-300' : 'text-slate-300')}
    >
      {children}
    </button>
  );
}
