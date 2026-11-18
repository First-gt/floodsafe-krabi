'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Compass, Globe, GraduationCap, Info, Layers, LocateFixed, Phone, Plus, ShieldCheck, X } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { TOUR_STEPS } from '@/components/CommitteeTour';
import { DepthLegend } from '@/components/DepthLegend';
import { HotlineSheet } from '@/components/HotlineSheet';
import { FloodMap } from '@/components/MapView';
import { ReportSheet } from '@/components/ReportSheet';
import { RoutePlanner, type Destination } from '@/components/RoutePlanner';
import { VehicleSetup } from '@/components/VehicleSetup';
import { bearing, haversine, type LngLat } from '@/lib/geo';
import { DEMO_ORIGIN, PLACES, SONGKLA_CENTER } from '@/lib/mock-data';
import type { RouteResult } from '@/lib/routing';
import { distToLine } from '@/lib/route-eval';
import { planRoute } from '@/lib/smart-route';
import { useFloodStore } from '@/lib/store';
import { useGeolocation } from '@/lib/use-geolocation';
import { defaultProfile, loadVehicle, saveVehicle, type VehicleProfile } from '@/lib/vehicle';
import { cn } from '@/lib/utils';

/** ระยะ (ม.) ที่ถือว่าออกนอกเส้นทาง */
const OFF_ROUTE_M = 150;

export default function CitizenPage() {
  const { checkpoints, zones, tourActive, tourStepIdx, startTour } = useFloodStore();
  const gps = useGeolocation();

  const tourStep = TOUR_STEPS[tourStepIdx]?.id ?? 'intro';
  const [mode, setMode] = useState<'choose' | 'route'>('choose');
  const [vehicle, setVehicle] = useState<VehicleProfile | null>(null);
  const [vehicleReady, setVehicleReady] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [useDemo, setUseDemo] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [planning, setPlanning] = useState(false);
  const [routeOrigin, setRouteOrigin] = useState<LngLat | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [driveView3D, setDriveView3D] = useState(false);
  const [navFollow, setNavFollow] = useState(true);
  const [followTrigger, setFollowTrigger] = useState(0);
  const [showZones, setShowZones] = useState(true);
  const [satellite, setSatellite] = useState(true);
  const [showLegend, setShowLegend] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [hotlineOpen, setHotlineOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<{ center: LngLat; zoom?: number; key: number } | null>(null);
  const [fitTo, setFitTo] = useState<{ coords: LngLat[]; key: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [padding, setPadding] = useState({ top: 80, bottom: 120, left: 60, right: 60 });

  // ซิงก์สถานะหน้าแผนที่ตามขั้นของโหมดสาธิต
  useEffect(() => {
    if (!tourActive) {
      setMode('choose');
      setDestination(null);
      return;
    }
    const step = TOUR_STEPS[tourStepIdx]?.id;
    if (step === 'intro') {
      setMode('choose');
      setDestination(null);
      setFlyTo({ center: SONGKLA_CENTER, zoom: 9.4, key: Date.now() });
    } else if (step === 'report') {
      setMode('choose');
      setDestination(null);
      setFlyTo({ center: [100.485, 7.022], zoom: 12.6, key: Date.now() });
    } else if (step === 'route') {
      setMode('route');
      setVehicle(defaultProfile('sedan', 'รถเก๋ง (สาธิต)'));
      setUseDemo(true);
      setDestination({ name: 'โรงพยาบาลสงขลานครินทร์ (ม.อ.)', coord: [100.4942, 7.0072] });
    } else if (step === 'ready') {
      setMode('choose');
      setDestination(null);
    }
  }, [tourActive, tourStepIdx]);

  // โหลดข้อมูลรถที่เคยบันทึกไว้ (ไม่บังคับเปิด modal ทับหน้าจอ ให้เลือกแบบแตะครั้งเดียวในแผงหลักได้)
  useEffect(() => {
    const v = loadVehicle();
    setVehicle(v);
    setVehicleReady(true);
  }, []);

  useEffect(() => {
    const update = () =>
      setPadding(
        window.innerWidth >= 640
          ? { top: 72, bottom: 72, left: 60, right: 60 }
          : { top: Math.round(window.innerHeight * 0.52), bottom: 110, left: 40, right: 40 },
      );
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const hasGps = gps.status === 'ready' && !!gps.position;
  const locationReady = hasGps || useDemo;
  const usingGps = hasGps && gps.insideSongkhla;
  const origin: LngLat = usingGps ? gps.position! : DEMO_ORIGIN.coord;
  const originName = usingGps
    ? 'ตำแหน่งของฉัน (GPS)'
    : hasGps
      ? `${DEMO_ORIGIN.name} – GPS ของคุณอยู่นอกจังหวัดสงขลา`
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
    planRoute(routeOrigin, destination.coord, vehicle, checkpointsRef.current, destination.name, ctrl.signal)
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
  }, [destination, vehicle, routeOrigin, checkpoints.length]);

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
    if (!navigating || !route || route.steps.length === 0) return { step: null, dist: null, heading: 0 };
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
    const ahead = route.coords[Math.min(route.coords.length - 1, uIdx + 3)] ?? s.location;
    const heading = ahead[0] !== livePos[0] || ahead[1] !== livePos[1] ? bearing(livePos, ahead) : 0;
    return { step: s, dist: haversine(livePos, s.location), heading };
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
      if (mode !== 'route') return;
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
    [mode, vehicle, locationReady],
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
    if (navigating) {
      setNavFollow(true);
      setFollowTrigger((n) => n + 1);
      return;
    }
    if (!hasGps) {
      gps.request();
      return;
    }
    setFlyTo({ center: origin, zoom: 13.5, key: Date.now() });
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
      <main className="relative flex min-h-0 flex-1 flex-col sm:flex-row">
        {/* แถบซ้ายบนเดสก์ท็อป / การ์ดด้านบนบนมือถือ */}
        <aside
          className={cn(
            'pointer-events-none absolute inset-x-2 bottom-24 top-2 z-10 flex flex-col sm:pointer-events-auto sm:static sm:z-20 sm:w-[400px] sm:shrink-0 sm:border-r sm:border-white/10 sm:bg-navy-900/95',
            tourActive && 'sm:pointer-events-none sm:opacity-90',
          )}
        >
          {tourActive && (
            <div className="hidden items-center justify-between border-b border-ocean-400/30 bg-ocean-500/15 px-4 py-2 text-[11px] font-medium text-ocean-200 sm:flex">
              <span>กำลังสาธิตระบบ ({tourStep === 'ready' ? '5/5' : 'ดูจบเพื่อปลดล็อก'})</span>
            </div>
          )}
          <div className={cn('flex max-h-[54dvh] min-h-0 flex-1 flex-col sm:max-h-full', tourActive ? 'pointer-events-none' : 'pointer-events-auto')}>
            {mode === 'choose' ? (
              <section
                className="glass flex min-h-0 max-h-full flex-col rounded-3xl sm:h-full sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:backdrop-blur-none"
                aria-label="เลือกบริการ"
              >
                <div className="flex min-h-[56px] items-center border-b border-white/10 px-4">
                  <h2 className="text-base font-bold text-white">ต้องการทำอะไร?</h2>
                </div>
                <div className="flex min-h-0 flex-1 flex-col justify-start gap-3 overflow-y-auto p-4">
                  {/* การ์ดสีแดง/danger: แจ้งน้ำท่วม / ขอความช่วยเหลือ */}
                  <button
                    type="button"
                    onClick={() => setReportOpen(true)}
                    className="group flex min-h-[96px] w-full items-center gap-3.5 rounded-2xl border-2 border-danger/60 bg-danger/15 p-4 text-left transition hover:border-danger hover:bg-danger/25 active:scale-[0.99]"
                  >
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-danger/25 text-red-300 transition group-hover:bg-danger/35 group-hover:text-red-200">
                      <AlertTriangle size={24} className="stroke-[2.5]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-base font-bold text-red-200 leading-tight">
                        แจ้งน้ำท่วม / ขอความช่วยเหลือ
                      </span>
                      <span className="mt-1 block text-xs text-slate-300 leading-relaxed">
                        กดตรงนี้ ถ้าคุณอยู่ในพื้นที่น้ำท่วม หรือติดอยู่และต้องการคนช่วย
                      </span>
                    </div>
                  </button>

                  {/* การ์ดสี ocean/cyan: เช็กเส้นทางหนีน้ำ */}
                  <button
                    type="button"
                    onClick={() => setMode('route')}
                    className="group flex min-h-[96px] w-full items-center gap-3.5 rounded-2xl border-2 border-ocean-400/50 bg-ocean-500/15 p-4 text-left transition hover:border-ocean-300 hover:bg-ocean-500/25 active:scale-[0.99]"
                  >
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ocean-500/25 text-ocean-300 transition group-hover:bg-ocean-500/35 group-hover:text-ocean-200">
                      <ShieldCheck size={24} className="stroke-[2.5]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-base font-bold text-ocean-200 leading-tight">
                        เช็กเส้นทางหนีน้ำ
                      </span>
                      <span className="mt-1 block text-xs text-slate-300 leading-relaxed">
                        กดตรงนี้ ถ้าคุณกำลังจะขับรถผ่านพื้นที่น้ำท่วม ระบบจะหาทางที่รถคุณผ่านได้
                      </span>
                    </div>
                  </button>

                  {/* หมายเหตุใต้การ์ด */}
                  <p className="mt-1 text-center text-xs text-slate-400 sm:text-left">
                    เส้นทางคำนวณจากรายงานน้ำท่วมที่ประชาชนแจ้งเข้ามา
                  </p>
                </div>
              </section>
            ) : (
              vehicleReady && (
                <RoutePlanner
                  vehicle={vehicle}
                  onQuickSelectVehicle={(v) => {
                    saveVehicle(v);
                    setVehicle(v);
                  }}
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
                  onStartNav={() => {
                    setNavigating(true);
                    setNavFollow(true);
                    setFollowTrigger((n) => n + 1);
                  }}
                  onStopNav={() => setNavigating(false)}
                  navStep={nav.step}
                  navDistToNext={nav.dist}
                  onBack={() => setMode('choose')}
                />
              )
            )}
          </div>
          {/* ปุ่มแจ้งเหตุติดด้านล่างของแถบซ้ายบนเดสก์ท็อป (เฉพาะในโหมดเส้นทาง เป็นปุ่มรองขนาดเล็กลง) */}
          {mode === 'route' && (
            <div className="hidden border-t border-white/10 p-3 sm:block">
              <button
                onClick={() => setReportOpen(true)}
                className="btn-ghost w-full min-h-[44px] gap-2 rounded-xl border border-danger/40 text-xs font-medium text-red-300 hover:bg-danger/10 hover:border-danger/60"
              >
                <Plus size={16} strokeWidth={2.5} />
                แจ้งน้ำท่วม / ขอความช่วยเหลือ
              </button>
            </div>
          )}
        </aside>

        {/* พื้นที่แผนที่เต็มจอฝั่งขวา */}
        <div className="relative min-h-[280px] flex-1">
          <FloodMap
            checkpoints={checkpoints}
            zones={zones}
            route={route}
            origin={destination && routeOrigin ? routeOrigin : null}
            destination={destination?.coord ?? null}
            userLocation={usingGps ? gps.position : locationReady ? origin : null}
            showZones={showZones}
            satellite={satellite}
            pickMode={mode === 'route' && ready}
            onMapClick={dropPin}
            places={PLACES}
            onPlaceClick={(pl) => {
              if (mode === 'route') dropPin([pl.lng, pl.lat]);
            }}
            showDistrictLabels
            flyTo={flyTo}
            fitTo={fitTo}
            padding={padding}
            initialCenter={SONGKLA_CENTER}
            initialZoom={9.4}
            navigating={(navigating || driveView3D) && navFollow}
            navBearing={nav.heading}
            followTrigger={followTrigger}
            onUserDrag={() => {
              if (navigating || driveView3D) setNavFollow(false);
            }}
          />

          {/* ปุ่มปรับมุมกล้องขับรถ 3 มิติ (แสดงเมื่อเลื่อนแผนที่ออกขณะนำทาง) */}
          {(navigating || driveView3D) && !navFollow && (
            <div className="absolute bottom-28 left-1/2 z-20 -translate-x-1/2 sm:bottom-8">
              <button
                type="button"
                onClick={() => {
                  setNavFollow(true);
                  setFollowTrigger((n) => n + 1);
                }}
                className="btn-primary rounded-full px-5 shadow-2xl shadow-ocean-500/40"
              >
                <LocateFixed size={18} /> ปรับมุมขับรถ 3 มิติ
              </button>
            </div>
          )}

          {/* แถบเครื่องมือแผนที่แบบแนวนอนด้านบนขวา (เดสก์ท็อป) / ด้านล่างขวา (มือถือ) */}
          <div className="absolute bottom-24 right-3 z-10 flex flex-col items-end gap-2 sm:bottom-auto sm:top-3">
            <div className="glass flex flex-col gap-0.5 rounded-2xl p-1 sm:flex-row sm:items-center">
              <ToolBtn label="ตำแหน่งฉัน" onClick={locateMe}>
                <LocateFixed size={16} />
              </ToolBtn>
              <ToolBtn
                label="มุมมอง 3D"
                active={driveView3D || navigating}
                onClick={() => {
                  const next = !driveView3D;
                  setDriveView3D(next);
                  if (next) {
                    setNavFollow(true);
                    setFollowTrigger((n) => n + 1);
                  }
                }}
              >
                <Compass size={16} />
              </ToolBtn>
              <ToolBtn label="สายด่วน 1784" onClick={() => setHotlineOpen(true)}>
                <Phone size={16} className="text-red-400" />
              </ToolBtn>
              <ToolBtn label="สัญลักษณ์" active={showLegend} onClick={() => setShowLegend((s) => !s)}>
                <Info size={16} />
              </ToolBtn>
              <ToolBtn label="ดาวเทียม" active={satellite} onClick={() => setSatellite((s) => !s)}>
                <Globe size={16} />
              </ToolBtn>
              <ToolBtn label="เขตน้ำท่วม" active={showZones} onClick={() => setShowZones((s) => !s)}>
                <Layers size={16} />
              </ToolBtn>
              {!tourActive && (
                <ToolBtn label="สาธิตวิธีใช้" onClick={startTour}>
                  <GraduationCap size={16} className="text-ocean-300" />
                </ToolBtn>
              )}
            </div>
            {showLegend && (
              <div className="relative max-h-[50dvh] w-72 animate-fade overflow-y-auto rounded-2xl">
                <DepthLegend full />
                <button className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-white/10" onClick={() => setShowLegend(false)} aria-label="ปิดคำอธิบาย">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {/* คำแนะนำแตะแผนที่ (แสดงตรงกลางด้านบนของแผนที่ฝั่งขวา) */}
          {mode === 'route' && ready && !destination && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 hidden justify-center sm:flex">
              <p className="glass animate-fade rounded-full px-4 py-2 text-xs text-slate-200">
                แตะบนแผนที่เพื่อเลือกปลายทาง
              </p>
            </div>
          )}

          {/* ปุ่มแจ้งเหตุบนมือถือ (เฉพาะในโหมดเส้นทาง เป็นปุ่มรองขนาดกะทัดรัด) */}
          {mode === 'route' && (
            <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4 sm:hidden">
              <button
                onClick={() => setReportOpen(true)}
                className="btn-ghost glass pointer-events-auto min-h-[44px] gap-2 rounded-full border border-danger/40 px-5 text-xs font-medium text-red-300 shadow-xl shadow-black/40 hover:bg-danger/10"
              >
                <Plus size={16} strokeWidth={2.5} />
                แจ้งน้ำท่วม / ขอความช่วยเหลือ
              </button>
            </div>
          )}
        </div>
      </main>

      <VehicleSetup
        open={vehicleOpen}
        required={false}
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
      aria-pressed={active}
      className={cn(
        'flex min-h-[40px] items-center gap-2 rounded-xl px-2.5 text-xs font-medium transition hover:bg-white/10',
        active ? 'bg-ocean-500/15 text-ocean-300' : 'text-slate-200',
      )}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
