'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  Droplet,
  Footprints,
  Home,
  Loader2,
  LocateFixed,
  Minus,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Waves,
  X,
  Zap,
  Wind,
  MapPin,
  type LucideIcon,
} from 'lucide-react';
import { analyzeIncident } from '@/lib/ai-engine';
import { haversine } from '@/lib/geo';
import { DISTRICT_TH } from '@/lib/labels';
import { DISTRICTS } from '@/lib/mock-data';
import { loadHashes, rememberHashes, verifyPhoto, type PhotoVerification } from '@/lib/photo-verify';
import { useFloodStore } from '@/lib/store';
import type { useGeolocation } from '@/lib/use-geolocation';
import type { District, Hazard, Incident, Passability, RescueNeed } from '@/lib/types';
import { DEPTH_COLORS, DEPTH_META, cn, depthLevel, passabilityFromDepth } from '@/lib/utils';
import { AiRecommendationCard } from './AiRecommendationCard';
import { DepthGauge } from './DepthGauge';
import { PriorityBadge } from './PriorityBadge';
import { ReferralPanel } from './ReferralPanel';
import { Handshake, Phone } from 'lucide-react';

const PRESETS: { label: string; cm: number; icon: LucideIcon }[] = [
  { label: 'ข้อเท้า', cm: 10, icon: Footprints },
  { label: 'เข่า', cm: 40, icon: Droplet },
  { label: 'เอว', cm: 90, icon: Waves },
  { label: 'หลังคา', cm: 200, icon: Home },
];

const PASSABILITY: { id: Passability; label: string; sub: string; color: string }[] = [
  { id: 'passable', label: 'ผ่านได้', sub: 'รถเก๋งผ่านได้', color: DEPTH_COLORS.safe },
  { id: 'pickup_only', label: 'กระบะเท่านั้น', sub: 'รถยกสูง / 4x4', color: DEPTH_COLORS.caution },
  { id: 'blocked', label: 'ผ่านไม่ได้เลย', sub: 'ถนนขาด', color: DEPTH_COLORS.danger },
];

const NEEDS: RescueNeed[] = ['boat', 'life_jackets', 'medical', 'elderly', 'food_water'];
const NEED_FULL: Record<RescueNeed, string> = {
  boat: 'เรือยาง / เรือท้องแบน',
  life_jackets: 'เสื้อชูชีพ',
  medical: 'ความช่วยเหลือทางการแพทย์',
  elderly: 'มีผู้สูงอายุ / ผู้ป่วยติดเตียง',
  food_water: 'อาหาร / น้ำดื่ม',
};

const HAZARDS: { id: Hazard; label: string; icon: LucideIcon }[] = [
  { id: 'strong_current', label: 'กระแสน้ำเชี่ยว', icon: Wind },
  { id: 'power_outage', label: 'ไฟฟ้าดับ', icon: Zap },
];

const MAX_PHOTOS = 4;

type Geo = ReturnType<typeof useGeolocation>;

interface PhotoItem {
  id: string;
  url: string;
  name: string;
  v: PhotoVerification | null;
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/** เบอร์โทรไทย: 9–10 หลัก ขึ้นต้นด้วย 0 (รับ +66 ด้วย) */
function normalizePhone(s: string): string {
  let d = s.replace(/\D/g, '');
  if (d.startsWith('66') && d.length >= 11) d = '0' + d.slice(2);
  return d;
}

const STATUS_STYLE = {
  verified: { label: 'ตรวจสอบแล้ว', cls: 'bg-safe text-navy-950' },
  review: { label: 'รอเจ้าหน้าที่ยืนยัน', cls: 'bg-safety text-navy-950' },
  rejected: { label: 'ไม่ผ่าน', cls: 'bg-danger text-white' },
} as const;

function Field({ id, title, hint, error, show, children }: { id: string; title: React.ReactNode; hint?: string; error?: string; show: boolean; children: React.ReactNode }) {
  const bad = show && !!error;
  return (
    <section id={`f-${id}`} aria-labelledby={`t-${id}`} className={cn('-m-2 rounded-2xl p-2 transition', bad && 'ring-1 ring-danger/60')}>
      <h3 id={`t-${id}`} className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-white">
        {title}
        <span className="text-danger" aria-hidden>
          *
        </span>
        {hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}
      </h3>
      {children}
      {bad && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-300" role="alert">
          <AlertTriangle size={13} /> {error}
        </p>
      )}
    </section>
  );
}

export function ReportSheet({ open, onClose, gps }: { open: boolean; onClose: () => void; gps: Geo }) {
  const { addReport } = useFloodStore();

  const [depth, setDepth] = useState<number | null>(null);
  const [passability, setPassability] = useState<Passability | null>(null);
  const [passTouched, setPassTouched] = useState(false);
  const [people, setPeople] = useState<number | null>(null);
  const [needs, setNeeds] = useState<RescueNeed[]>([]);
  const [noNeeds, setNoNeeds] = useState(false);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [noHazards, setNoHazards] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [note, setNote] = useState('');
  const [place, setPlace] = useState('');
  const [reporter, setReporter] = useState('');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState<District | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<{ incident: Incident | null } | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // จับ GPS อัตโนมัติเมื่อเปิดฟอร์ม
  useEffect(() => {
    if (open && gps.status === 'idle') gps.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!passTouched && depth !== null) setPassability(passabilityFromDepth(depth));
  }, [depth, passTouched]);

  const useGps = !!gps.position && gps.insideKrabi;
  const coord = useGps ? gps.position! : area ? DISTRICTS[area].center : null;

  const photosRef = useRef(photos);
  photosRef.current = photos;
  const coordRef = useRef(coord);
  coordRef.current = coord;
  const useGpsRef = useRef(useGps);
  useGpsRef.current = useGps;

  const accepted = photos.filter((p) => p.v && p.v.status !== 'rejected');
  const checking = photos.some((p) => !p.v);

  // ---------- ตรวจความครบถ้วน (ทุกช่องบังคับ) ----------
  const errors = useMemo(() => {
    const e: Record<string, string | undefined> = {};
    if (!coord) e.location = 'กรุณาเปิด GPS หรือเลือกพื้นที่ของคุณ';
    if (place.trim().length < 3) e.place = 'กรุณาระบุจุดสังเกต / ชื่อถนน อย่างน้อย 3 ตัวอักษร';
    if (depth === null) e.depth = 'กรุณาระบุระดับน้ำ (เลื่อนแถบ กรอกตัวเลข หรือเลือกระดับด้านล่าง)';
    if (!passability) e.pass = 'กรุณาเลือกว่ารถผ่านได้หรือไม่';
    if (people === null) e.people = 'กรุณาระบุจำนวนผู้ประสบภัย / ผู้ได้รับผลกระทบ';
    if (!needs.length && !noNeeds) e.needs = 'กรุณาเลือกสิ่งที่ต้องการ หรือเลือก “ไม่ต้องการความช่วยเหลือ”';
    if (!hazards.length && !noHazards) e.hazards = 'กรุณาเลือกอันตรายในพื้นที่ หรือเลือก “ไม่มีอันตรายเพิ่มเติม”';
    if (!photos.length) e.photo = 'กรุณาแนบรูปถ่ายสถานที่จริงอย่างน้อย 1 รูป';
    else if (checking) e.photo = 'กำลังตรวจสอบรูปภาพ กรุณารอสักครู่';
    else if (!accepted.length) e.photo = 'รูปทั้งหมดไม่ผ่านการตรวจสอบ กรุณาลบแล้วถ่ายรูปน้ำท่วมจริงใหม่';
    if (reporter.trim().length < 2) e.reporter = 'กรุณากรอกชื่อผู้แจ้ง';
    if (!/^0\d{8,9}$/.test(normalizePhone(phone))) e.phone = 'กรุณากรอกเบอร์โทรให้ถูกต้อง (9–10 หลัก เช่น 0812345678)';
    if (note.trim().length < 5) e.note = 'กรุณาเล่ารายละเอียดสถานการณ์อย่างน้อย 5 ตัวอักษร';
    return e;
  }, [coord, place, depth, passability, people, needs, noNeeds, hazards, noHazards, photos, checking, accepted.length, reporter, phone, note]);

  const FIELD_ORDER = ['location', 'place', 'depth', 'pass', 'people', 'needs', 'hazards', 'photo', 'reporter', 'phone', 'note'];
  const total = FIELD_ORDER.length;
  const missing = FIELD_ORDER.filter((k) => errors[k]);
  const done = total - missing.length;

  const rec = useMemo(
    () => (depth !== null && passability ? analyzeIncident({ depthCm: depth, passability, needs, hazards, people: people ?? 1 }) : null),
    [depth, passability, needs, hazards, people],
  );

  const reset = () => {
    setDepth(null);
    setPassability(null);
    setPassTouched(false);
    setPeople(null);
    setNeeds([]);
    setNoNeeds(false);
    setHazards([]);
    setNoHazards(false);
    setPhotos([]);
    setNote('');
    setPlace('');
    setReporter('');
    setPhone('');
    setArea(null);
    setShowErrors(false);
    setResult(null);
  };

  const close = () => {
    onClose();
    setTimeout(reset, 250);
  };

  const submit = () => {
    setShowErrors(true);
    const first = FIELD_ORDER.find((k) => errors[k]);
    if (first) {
      document.getElementById(`f-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const c = coord!;
    const { incident } = addReport({
      lng: c[0],
      lat: c[1],
      locationName: place.trim(),
      depthCm: depth!,
      passability: passability!,
      needs,
      hazards,
      people: people!,
      note: note.trim(),
      photos: accepted.map((p) => p.v!.image),
      photoReviews: accepted.map((p) => ({ status: p.v!.status as 'verified' | 'review', score: p.v!.score, summary: p.v!.summary, method: p.v!.method })),
      reporter: reporter.trim(),
      phone: normalizePhone(phone),
    });
    rememberHashes(accepted.map((p) => p.v!.hash));
    setResult({ incident });
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photosRef.current.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    for (const f of picked) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item: PhotoItem = { id, url: URL.createObjectURL(f), name: f.name, v: null };
      setPhotos((cur) => [...cur, item]);
      const known = [...loadHashes(), ...photosRef.current.filter((p) => p.v && p.v.status !== 'rejected').map((p) => p.v!.hash)];
      const c = useGpsRef.current ? coordRef.current : null;
      verifyPhoto(f, { lat: c ? c[1] : null, lng: c ? c[0] : null, knownHashes: known })
        .then((v) => setPhotos((cur) => cur.map((p) => (p.id === id ? { ...p, v } : p))))
        .catch(() =>
          setPhotos((cur) =>
            cur.map((p) =>
              p.id === id
                ? { ...p, v: { status: 'rejected', score: 0, summary: 'ตรวจสอบรูปไม่สำเร็จ ลองใหม่อีกครั้ง', checks: [], hash: '', image: '', method: 'heuristic' } }
                : p,
            ),
          ),
        );
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!open) return null;
  const d = depth ?? 0;
  const lvl = depthLevel(d);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="แจ้งระดับน้ำท่วม">
      <button className="absolute inset-0 animate-fade bg-black/60 backdrop-blur-sm" onClick={close} aria-label="ปิดฟอร์มแจ้งเหตุ" />

      <div className="glass relative z-10 flex max-h-[94dvh] w-full animate-sheet-up flex-col rounded-t-3xl sm:max-h-[90dvh] sm:max-w-xl sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" />
        <header className="flex items-center gap-3 px-5 pb-3 pt-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-danger/15 text-red-300">
            <Waves size={20} />
          </span>
          <div className="mr-auto leading-tight">
            <h2 className="text-base font-semibold text-white">แจ้งน้ำท่วม / ขอความช่วยเหลือ</h2>
            <p className="text-xs text-slate-400">ทุกช่องที่มีเครื่องหมาย <span className="text-danger">*</span> จำเป็นต้องกรอก</p>
          </div>
          <button onClick={close} className="btn-ghost !min-h-[44px] !min-w-[44px] !px-0" aria-label="ปิด">
            <X size={20} />
          </button>
        </header>

        {result ? (
          <div className="space-y-4 overflow-y-auto px-5 pb-6">
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 size={48} className="text-safe" />
              <h3 className="text-lg font-semibold text-white">{result.incident ? 'ส่งคำขอความช่วยเหลือแล้ว' : 'เผยแพร่รายงานระดับน้ำแล้ว'}</h3>
              <p className="max-w-sm text-sm text-slate-400">
                {result.incident
                  ? 'คำขอของคุณเข้าคิวที่ศูนย์ประสานงานแล้ว และจุดตรวจระดับน้ำนี้จะแสดงให้ผู้ขับขี่ทุกคนเห็น'
                  : 'ขอบคุณครับ/ค่ะ! จุดตรวจนี้จะช่วยปรับเส้นทางปลอดภัยให้ทุกคนในพื้นที่'}
              </p>
              {result.incident && <PriorityBadge priority={result.incident.recommendation.priority} className="mt-1" />}
            </div>
            {result.incident && <AiRecommendationCard rec={result.incident.recommendation} />}
            {result.incident && (
              <div className="space-y-2 rounded-2xl border border-danger/30 bg-danger/[0.06] p-3">
                <p className="text-sm font-semibold text-white">เร่งด่วน? ติดต่อหน่วยงานโดยตรงด้วย</p>
                <p className="text-xs text-slate-400">ศูนย์ประสานงานของเว็บอาจใช้เวลา — สถานการณ์วิกฤตให้โทรสายด่วนก่อน แล้วส่งข้อมูลเคสให้หน่วยงานได้ทันที</p>
                <div className="flex gap-2">
                  <a className="btn-danger flex-1" href="tel:1784">
                    <Phone size={16} /> โทร 1784 (ปภ.)
                  </a>
                  <a className="btn-danger flex-1" href="tel:1669">
                    <Phone size={16} /> โทร 1669 (แพทย์)
                  </a>
                </div>
                <button className="btn-ghost w-full" onClick={() => setRefOpen(true)}>
                  <Handshake size={16} /> ส่งต่อเคสให้หน่วยงาน / มูลนิธิ / อาสา
                </button>
              </div>
            )}
            {refOpen && result.incident && <ReferralPanel incidentId={result.incident.id} onClose={() => setRefOpen(false)} />}
            <button className="btn-primary w-full" onClick={close}>
              กลับไปที่แผนที่
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 pb-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  กรอกแล้ว <b className="text-white">{done}</b>/{total} ช่อง
                </span>
                {missing.length > 0 && showErrors && <span className="text-red-300">ยังขาด {missing.length} ช่อง</span>}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                <div className={cn('h-full rounded-full transition-all', done === total ? 'bg-safe' : 'bg-ocean-400')} style={{ width: `${(done / total) * 100}%` }} />
              </div>
            </div>

            <div ref={bodyRef} className="space-y-6 overflow-y-auto px-5 pb-4">
              {/* 1. ตำแหน่ง */}
              <Field id="location" title={<span className="flex items-center gap-2"><MapPin size={16} className="text-ocean-400" /> ตำแหน่งของคุณ</span>} error={errors.location} show={showErrors}>
                <div className="glass-soft flex items-center gap-3 rounded-2xl p-3">
                  <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', useGps ? 'bg-safe/15 text-safe' : 'bg-white/10 text-slate-300')}>
                    {gps.status === 'locating' ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-mono text-slate-100">
                      {gps.position
                        ? `${gps.position[1].toFixed(5)}, ${gps.position[0].toFixed(5)}`
                        : coord
                          ? `${coord[1].toFixed(5)}, ${coord[0].toFixed(5)}`
                          : '— ยังไม่มีพิกัด —'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {useGps
                        ? `ล็อกพิกัด GPS แล้ว${gps.accuracy ? ` · คลาดเคลื่อน ±${Math.round(gps.accuracy)} ม.` : ''}`
                        : gps.status === 'locating'
                          ? 'กำลังหาตำแหน่ง…'
                          : gps.position
                            ? `จับ GPS ได้แล้ว${gps.accuracy ? ` (±${Math.round(gps.accuracy)} ม.)` : ''} แต่อยู่ห่างจากกระบี่ ~${Math.round(haversine(gps.position, DISTRICTS['Mueang Krabi'].center) / 1000).toLocaleString('th-TH')} กม. (นอกพื้นที่ให้บริการ) – กรุณาเลือกพื้นที่ด้านล่างเพื่อใช้เป็นพิกัดสาธิต`
                            : gps.status === 'denied'
                              ? 'ไม่อนุญาตใช้ GPS – กรุณาเลือกพื้นที่'
                              : 'ไม่มีสัญญาณ GPS – กรุณาเลือกพื้นที่'}
                    </p>
                    {!useGps && gps.position && coord && (
                      <p className="mt-1 text-xs text-yellow-300">พิกัดที่ใช้แจ้งเหตุ (สาธิต): <span className="font-mono">{coord[1].toFixed(5)}, {coord[0].toFixed(5)}</span></p>
                    )}
                    {gps.position && (gps.accuracy ?? 0) > 2000 && (
                      <p className="mt-1 text-xs text-orange-300">
                        ตำแหน่งไม่แม่น (±{((gps.accuracy ?? 0) / 1000).toFixed(1)} กม.) มักเกิดจากคอมพิวเตอร์/เบราว์เซอร์ประมาณตำแหน่งจาก IP หรือ Wi-Fi — ลองเปิดจากมือถือที่เปิด GPS (ต้องใช้ https หรือ localhost)
                      </p>
                    )}
                    {!useGps && gps.position && !coord && (
                      <p className="mt-1 text-xs text-yellow-300">ยังไม่ได้เลือกพื้นที่สาธิต จึงยังไม่มีพิกัดสำหรับแจ้งเหตุ</p>
                    )}
                  </div>
                  <button className="btn-ghost !px-3" onClick={gps.request} aria-label="ค้นหา GPS ใหม่">
                    <Crosshair size={16} />
                  </button>
                </div>
                {!useGps && (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(DISTRICTS) as District[]).map((k) => (
                      <button key={k} onClick={() => setArea(k)} aria-pressed={area === k} className={cn('btn !px-2 text-xs', area === k ? 'bg-ocean-500 text-navy-950' : 'btn-ghost')}>
                        {DISTRICT_TH[k]}
                      </button>
                    ))}
                  </div>
                )}
              </Field>

              <Field id="place" title="จุดสังเกต / ชื่อถนน" error={errors.place} show={showErrors}>
                <input className="field" placeholder="เช่น หน้าตลาดอ่าวลึก ถนนเพชรเกษม ใกล้ปั๊ม PT" value={place} onChange={(e) => setPlace(e.target.value)} />
              </Field>

              {/* 2. ระดับน้ำ */}
              <Field id="depth" title="ระดับน้ำ" error={errors.depth} show={showErrors}>
                <div className="grid grid-cols-[130px_1fr] gap-4 sm:grid-cols-[150px_1fr]">
                  <div className="h-44 rounded-2xl border border-white/10 bg-navy-950/60 p-1 sm:h-48">
                    <DepthGauge depth={d} />
                  </div>
                  <div className="flex flex-col justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={250}
                        placeholder="—"
                        value={depth ?? ''}
                        onChange={(e) => setDepth(e.target.value === '' ? null : Math.max(0, Math.min(250, Math.round(Number(e.target.value) || 0))))}
                        className="field !w-24 text-center text-lg font-bold"
                        aria-label="ระดับน้ำเป็นเซนติเมตร"
                      />
                      <span className="text-sm text-slate-400">ซม.</span>
                      {depth !== null && (
                        <span className="ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold text-navy-950" style={{ background: DEPTH_COLORS[lvl] }}>
                          {DEPTH_META[lvl].label}
                        </span>
                      )}
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={250}
                      value={d}
                      onChange={(e) => setDepth(Number(e.target.value))}
                      aria-label="แถบเลื่อนระดับน้ำ"
                      className="w-full"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {PRESETS.map((p) => (
                        <button
                          key={p.label}
                          onClick={() => setDepth(p.cm)}
                          className={cn(
                            'flex min-h-[48px] items-center gap-2 rounded-xl border px-2.5 text-left text-xs transition',
                            depth === p.cm ? 'border-ocean-400 bg-ocean-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                          )}
                        >
                          <p.icon size={16} className="shrink-0 text-ocean-300" />
                          <span className="leading-tight">
                            <span className="block font-semibold">ระดับ{p.label}</span>
                            <span className="text-[10px] text-slate-400">~{p.cm} ซม.</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Field>

              {/* 3. รถผ่านได้ไหม */}
              <Field id="pass" title="รถผ่านได้หรือไม่" error={errors.pass} show={showErrors}>
                <div className="grid grid-cols-3 gap-2" role="radiogroup">
                  {PASSABILITY.map((p) => (
                    <button
                      key={p.id}
                      role="radio"
                      aria-checked={passability === p.id}
                      onClick={() => {
                        setPassability(p.id);
                        setPassTouched(true);
                      }}
                      className={cn(
                        'flex min-h-[72px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-2 text-center transition',
                        passability === p.id ? 'bg-white/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/10',
                      )}
                      style={passability === p.id ? { borderColor: p.color } : undefined}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                      <span className="text-xs font-semibold text-white">{p.label}</span>
                      <span className="text-[10px] text-slate-400">{p.sub}</span>
                    </button>
                  ))}
                </div>
              </Field>

              {/* 4. จำนวนคน + ความช่วยเหลือ */}
              <Field id="people" title="จำนวนผู้ประสบภัย / ผู้ได้รับผลกระทบ (คน)" error={errors.people} show={showErrors}>
                <div className="flex items-center justify-between rounded-xl bg-white/[0.04] p-2.5">
                  <span className="text-sm text-slate-400">{people === null ? 'กดปุ่ม + เพื่อระบุ' : 'จำนวนคน'}</span>
                  <div className="flex items-center gap-2">
                    <button className="btn-ghost !min-h-[44px] !min-w-[44px] !px-0" onClick={() => setPeople(Math.max(1, (people ?? 1) - 1))} aria-label="ลดจำนวนคน">
                      <Minus size={16} />
                    </button>
                    <span className="w-8 text-center text-lg font-bold text-white" aria-live="polite">
                      {people ?? '–'}
                    </span>
                    <button className="btn-ghost !min-h-[44px] !min-w-[44px] !px-0" onClick={() => setPeople(Math.min(50, (people ?? 0) + 1))} aria-label="เพิ่มจำนวนคน">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </Field>

              <Field id="needs" title="สิ่งที่ต้องการความช่วยเหลือ" error={errors.needs} show={showErrors}>
                <div className="space-y-2">
                  {NEEDS.map((n) => {
                    const on = needs.includes(n);
                    return (
                      <label
                        key={n}
                        className={cn(
                          'flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border px-3 transition',
                          on ? 'border-ocean-400 bg-ocean-500/15' : 'border-white/10 bg-white/[0.03] hover:bg-white/10',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-cyan-400"
                          checked={on}
                          onChange={() => {
                            setNeeds(toggle(needs, n));
                            setNoNeeds(false);
                          }}
                        />
                        <span className="text-sm text-slate-100">{NEED_FULL[n]}</span>
                      </label>
                    );
                  })}
                  <label
                    className={cn(
                      'flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border px-3 transition',
                      noNeeds ? 'border-safe bg-safe/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/10',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-green-500"
                      checked={noNeeds}
                      onChange={() => {
                        setNoNeeds(!noNeeds);
                        setNeeds([]);
                      }}
                    />
                    <span className="text-sm text-slate-100">ไม่ต้องการความช่วยเหลือ (แจ้งระดับน้ำเท่านั้น)</span>
                  </label>
                </div>
              </Field>

              <Field id="hazards" title="อันตรายในพื้นที่" error={errors.hazards} show={showErrors}>
                <div className="grid grid-cols-2 gap-2">
                  {HAZARDS.map((h) => {
                    const on = hazards.includes(h.id);
                    return (
                      <button
                        key={h.id}
                        aria-pressed={on}
                        onClick={() => {
                          setHazards(toggle(hazards, h.id));
                          setNoHazards(false);
                        }}
                        className={cn(
                          'flex min-h-[52px] items-center gap-2 rounded-xl border px-3 text-left text-sm transition',
                          on ? 'border-safety bg-safety/15 text-yellow-200' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10',
                        )}
                      >
                        <h.icon size={18} />
                        {h.label}
                      </button>
                    );
                  })}
                  <button
                    aria-pressed={noHazards}
                    onClick={() => {
                      setNoHazards(!noHazards);
                      setHazards([]);
                    }}
                    className={cn(
                      'col-span-2 flex min-h-[52px] items-center gap-2 rounded-xl border px-3 text-left text-sm transition',
                      noHazards ? 'border-safe bg-safe/10 text-green-200' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10',
                    )}
                  >
                    <CheckCircle2 size={18} />
                    ไม่มีอันตรายเพิ่มเติม
                  </button>
                </div>
              </Field>

              {/* 5. รูปภาพ */}
              <Field id="photo" title="ภาพถ่ายสถานที่จริง" hint="(AI ตรวจว่าเป็นน้ำท่วมจริง)" error={errors.photo} show={showErrors}>
                <p className="mb-2 text-xs text-slate-400">
                  ถ่ายให้เห็นระดับน้ำและสิ่งที่ใช้เทียบ เช่น ล้อรถ ขา ประตู ระบบจะปฏิเสธรูปที่ไม่ใช่น้ำท่วม รูปซ้ำ รูปเบลอ หรือรูปเก่า
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((p, i) => {
                    const st = p.v ? STATUS_STYLE[p.v.status] : null;
                    return (
                      <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={p.name} className={cn('h-full w-full object-cover', p.v?.status === 'rejected' && 'opacity-40')} />
                        <span className={cn('absolute inset-x-0 bottom-0 truncate px-1 py-0.5 text-center text-[10px] font-semibold', st ? st.cls : 'bg-navy-900/90 text-slate-200')}>
                          {st ? st.label : 'กำลังตรวจ…'}
                        </span>
                        {!p.v && (
                          <span className="absolute inset-0 grid place-items-center">
                            <Loader2 size={22} className="animate-spin text-ocean-300" />
                          </span>
                        )}
                        <button
                          onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))}
                          className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white"
                          aria-label={`ลบรูปที่ ${i + 1}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {photos.length < MAX_PHOTOS && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="grid aspect-square place-items-center rounded-xl border border-dashed border-white/20 text-slate-400 transition hover:border-ocean-400 hover:text-ocean-300"
                      aria-label="เพิ่มรูปภาพ"
                    >
                      <span className="flex flex-col items-center gap-1 text-[11px]">
                        <Camera size={20} /> เพิ่มรูป
                      </span>
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => onFiles(e.target.files)} />

                {photos.some((p) => p.v) && (
                  <div className="mt-3 space-y-2">
                    {photos.map((p, i) => {
                      if (!p.v) return null;
                      const st = STATUS_STYLE[p.v.status];
                      const est = p.v.ai?.estimatedDepthCm;
                      const mismatch = est != null && depth !== null && Math.abs(est - depth) > 40 && Math.abs(est - depth) / Math.max(est, depth, 1) > 0.5;
                      return (
                        <details key={p.id} className="group rounded-xl border border-white/10 bg-white/[0.03]" open={p.v.status === 'rejected'}>
                          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 text-xs">
                            {p.v.status === 'rejected' ? <ShieldAlert size={16} className="shrink-0 text-red-300" /> : <ShieldCheck size={16} className={cn('shrink-0', p.v.status === 'verified' ? 'text-safe' : 'text-safety')} />}
                            <span className="min-w-0 flex-1">
                              <b className="text-white">รูปที่ {i + 1}</b> <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', st.cls)}>{st.label}</span>{' '}
                              <span className="text-slate-400">{p.v.summary}</span>
                            </span>
                            <ChevronDown size={14} className="shrink-0 text-slate-500 transition group-open:rotate-180" />
                          </summary>
                          <ul className="space-y-1 border-t border-white/10 px-3 py-2 text-[11px]">
                            {p.v.checks.map((c) => (
                              <li key={c.id} className="flex gap-2">
                                <span className={cn('mt-0.5 shrink-0 font-bold', c.state === 'pass' ? 'text-safe' : c.state === 'fail' ? 'text-red-300' : c.state === 'warn' ? 'text-safety' : 'text-slate-500')}>
                                  {c.state === 'pass' ? '✓' : c.state === 'fail' ? '✗' : c.state === 'warn' ? '!' : '•'}
                                </span>
                                <span className="text-slate-300">
                                  <b className="text-slate-100">{c.label}</b>
                                  {c.detail ? ` – ${c.detail}` : ''}
                                </span>
                              </li>
                            ))}
                            {mismatch && (
                              <li className="flex gap-2 text-safety">
                                <span className="font-bold">!</span>
                                <span>
                                  AI ประเมินระดับน้ำในภาพ ≈ {Math.round(est!)} ซม. ต่างจากที่คุณแจ้ง ({depth} ซม.) มาก กรุณาตรวจสอบตัวเลขอีกครั้ง
                                </span>
                              </li>
                            )}
                            <li className="pt-1 text-slate-500">
                              วิธีตรวจ: {p.v.method === 'ai' ? 'AI วิชัน (Gemini)' : 'ตรวจเบื้องต้นในเครื่อง (สี/พื้นผิว/EXIF/รูปซ้ำ) – เจ้าหน้าที่อาจตรวจซ้ำ'}
                            </li>
                          </ul>
                        </details>
                      );
                    })}
                  </div>
                )}
              </Field>

              {/* 6. ผู้แจ้ง */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="reporter" title="ชื่อผู้แจ้ง" error={errors.reporter} show={showErrors}>
                  <input className="field" placeholder="ชื่อ-นามสกุล" autoComplete="name" value={reporter} onChange={(e) => setReporter(e.target.value)} />
                </Field>
                <Field id="phone" title="เบอร์โทรติดต่อ" error={errors.phone} show={showErrors}>
                  <input className="field" placeholder="0812345678" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
              </div>
              <Field id="note" title="รายละเอียดสถานการณ์" error={errors.note} show={showErrors}>
                <textarea className="field !min-h-[84px] py-2" placeholder="เช่น น้ำเริ่มเข้าบ้านตั้งแต่เช้า มีผู้สูงอายุ 2 คน ติดอยู่ชั้นสอง" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>

              {/* 7. AI */}
              {rec ? (
                <AiRecommendationCard rec={rec} />
              ) : (
                <p className="rounded-2xl border border-dashed border-white/15 p-3 text-center text-xs text-slate-500">
                  ระบุระดับน้ำและสถานะรถ เพื่อดูคำแนะนำทรัพยากรกู้ภัยจาก AI
                </p>
              )}
            </div>

            <footer className="border-t border-white/10 p-4">
              {showErrors && missing.length > 0 && (
                <p className="mb-2 text-center text-xs text-red-300" role="alert">
                  กรุณากรอกให้ครบทุกช่อง (ขาดอีก {missing.length} ช่อง)
                </p>
              )}
              <button className="btn-danger w-full !min-h-[52px] text-base" onClick={submit}>
                <Send size={18} />
                {needs.length || hazards.length ? 'ส่งคำขอความช่วยเหลือ' : 'เผยแพร่รายงานระดับน้ำ'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
