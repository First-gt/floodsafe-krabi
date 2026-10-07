import { bearing, haversine, offsetPoint, type LngLat } from './geo';
import { computeRoute, type RouteResult, type RouteStep } from './routing';
import { distToLine, hazardsAlong, type RouteHazard } from './route-eval';
import type { Checkpoint } from './types';
import type { VehicleProfile } from './vehicle';

/**
 * ตัวนำทางอัจฉริยะ
 *  1) ขอเส้นทางถนนจริงจาก OSRM (หลายตัวเลือก)
 *  2) ให้ AI ตรวจแต่ละเส้นทางกับรายงานระดับน้ำที่ประชาชนแจ้ง เทียบกับความสูงน้ำที่รถคันนี้ลุยได้
 *  3) ถ้าเส้นหลักผ่านไม่ได้ ลองเส้นทางอ้อมผ่านจุดแวะด้านข้าง
 *  4) ถ้าออนไลน์ไม่ได้ ใช้กราฟถนนสำรองในเครื่อง
 */

const OSRM_URL = (process.env.NEXT_PUBLIC_OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');

interface RawStep {
  maneuver: { type: string; modifier?: string; location: LngLat; exit?: number };
  name: string;
  ref?: string;
  distance: number;
  duration: number;
  geometry: { coordinates: LngLat[] };
}
interface Candidate {
  coords: LngLat[];
  distance: number;
  duration: number;
  steps: RawStep[];
  detour: boolean;
}

// ---------- OSRM fetch + cache ----------
const cache = new Map<string, Promise<Candidate[]>>();
const r4 = (n: number) => n.toFixed(4);

function fetchCandidates(points: LngLat[], alternatives: boolean, signal?: AbortSignal): Promise<Candidate[]> {
  const key = points.map((p) => `${r4(p[0])},${r4(p[1])}`).join(';') + (alternatives ? '|alt' : '');
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 80) cache.clear();
  const url =
    `${OSRM_URL}/route/v1/driving/${points.map((p) => `${p[0]},${p[1]}`).join(';')}` +
    `?alternatives=${alternatives ? 'true' : 'false'}&overview=full&geometries=geojson&steps=true`;
  // ไม่ผูก signal กับ cache เพื่อไม่ให้ผลที่ถูกยกเลิกค้างอยู่ใน cache
  const p = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const data = await res.json();
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error(data.code || 'NO_ROUTE');
      return (data.routes as any[]).map(
        (r): Candidate => ({
          coords: r.geometry.coordinates,
          distance: r.distance,
          duration: r.duration,
          steps: (r.legs as any[]).flatMap((l) => l.steps as RawStep[]),
          detour: points.length > 2,
        }),
      );
    } finally {
      clearTimeout(timer);
    }
  })();
  p.catch(() => cache.delete(key));
  return signal
    ? new Promise<Candidate[]>((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        p.then(resolve, reject);
      }).finally(() => undefined)
    : p;
}

// ---------- ประเมินเส้นทาง ----------
interface Scored {
  c: Candidate;
  hazards: RouteHazard[];
  blocked: RouteHazard[];
  caution: RouteHazard[];
  maxDepth: number;
  score: number;
}

const WET_PENALTY_S = 90;

function score(c: Candidate, checkpoints: Checkpoint[], limitCm: number): Scored {
  const hazards = hazardsAlong(c.coords, checkpoints, limitCm);
  const blocked = hazards.filter((h) => !h.passable);
  const caution = hazards.filter((h) => h.passable && h.depthCm >= 20);
  const maxDepth = hazards.reduce((m, h) => Math.max(m, h.depthCm), 0);
  return { c, hazards, blocked, caution, maxDepth, score: c.duration + WET_PENALTY_S * caution.length };
}

/** ลำดับตำแหน่งของจุดบนเส้นทาง (ใช้หาจุดอันตรายแรกที่เจอ) */
function indexAlong(coords: LngLat[], p: LngLat): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = (coords[i][0] - p[0]) ** 2 + (coords[i][1] - p[1]) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// ---------- แปลงคำสั่ง OSRM → ภาษาไทย ----------
const MOD_TH: Record<string, string> = {
  left: 'ซ้าย',
  right: 'ขวา',
  'slight left': 'เฉียงซ้าย',
  'slight right': 'เฉียงขวา',
  'sharp left': 'หักศอกซ้าย',
  'sharp right': 'หักศอกขวา',
};

function roadName(s: RawStep): string {
  const ref = s.ref ? (/^\d+$/.test(s.ref) ? `ทล.${s.ref}` : s.ref) : '';
  const name = s.name?.trim();
  if (name && ref && !name.includes(s.ref!)) return `${name} (${ref})`;
  return name || ref || 'ถนนไม่มีชื่อ';
}

function maneuverOf(s: RawStep): { m: RouteStep['maneuver']; text: (road: string) => string } {
  const { type, modifier } = s.maneuver;
  const mod = modifier ?? 'straight';
  if (type === 'depart') return { m: 'depart', text: (r) => `ออกเดินทางไปตาม ${r}` };
  if (type === 'arrive') return { m: 'arrive', text: () => 'ถึงจุดหมายปลายทาง' };
  if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn')
    return { m: 'roundabout', text: (r) => `เข้าวงเวียน ออกทางที่ ${s.maneuver.exit ?? 1} ไป ${r}` };
  if (mod === 'uturn') return { m: 'uturn', text: (r) => `ยูเทิร์นแล้วไปตาม ${r}` };
  const dir = MOD_TH[mod];
  const m = (mod === 'straight' || mod === 'uncertain' ? 'straight' : mod.replace(' ', '-')) as RouteStep['maneuver'];
  if (type === 'off ramp' || type === 'fork') return { m, text: (r) => `${dir ? `ชิด${dir}` : 'ตรงไป'} เข้า ${r}` };
  if (type === 'merge') return { m, text: (r) => `เข้าสู่ ${r}` };
  if (dir) return { m, text: (r) => `เลี้ยว${dir} เข้า ${r}` };
  return { m: 'straight', text: (r) => `ตรงไปตาม ${r}` };
}

function buildSteps(c: Candidate, hazards: RouteHazard[]): RouteStep[] {
  const out: RouteStep[] = [];
  for (const s of c.steps) {
    const isEnds = s.maneuver.type === 'depart' || s.maneuver.type === 'arrive';
    if (!isEnds && s.distance < 15) continue;
    const road = roadName(s);
    const { m, text } = maneuverOf(s);
    // รายงานน้ำท่วมที่อยู่บนช่วงนี้
    const local = s.geometry?.coordinates?.length
      ? hazards.filter((h) => distToLine([h.lng, h.lat], s.geometry.coordinates, 120) <= 120)
      : [];
    const maxDepth = local.reduce((mx, h) => Math.max(mx, h.depthCm), 0);
    const worst = local[0];
    out.push({
      maneuver: m,
      instruction: text(road),
      road,
      distance: s.distance,
      maxDepthCm: maxDepth,
      warning: worst ? `น้ำท่วมขัง ~${Math.round(worst.depthCm)} ซม. ที่ ${worst.name}` : undefined,
      location: s.maneuver.location,
    });
  }
  return out;
}

const fmtMin = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1 ? 'เมื่อสักครู่' : m < 60 ? `${m} นาทีที่แล้ว` : `${Math.round(m / 60)} ชม.ที่แล้ว`;
};

// ---------- ตัวหลัก ----------
export async function planRoute(
  origin: LngLat,
  dest: LngLat,
  vehicle: VehicleProfile,
  checkpoints: Checkpoint[],
  destName: string | undefined,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const limit = vehicle.maxDepthCm;
  try {
    const base = await fetchCandidates([origin, dest], true, signal);
    const baseDist = base[0].distance;
    let pool: Candidate[] = [...base];
    let scored = pool.map((c) => score(c, checkpoints, limit));
    const fastest = scored.reduce((a, b) => (b.c.duration < a.c.duration ? b : a));
    const initialCount = scored.length;
    let detourTried = 0;

    const safeOnes = () => scored.filter((s) => s.blocked.length === 0);

    // ไม่มีเส้นปลอดภัย → ลองอ้อมผ่านจุดแวะ
    for (let round = 0; round < 2 && safeOnes().length === 0; round++) {
      // เส้นที่ "ดีที่สุดตอนนี้" = จุดน้ำสูงเกินน้อยที่สุด
      const cur = scored.reduce((a, b) => (b.blocked.length < a.blocked.length || (b.blocked.length === a.blocked.length && b.maxDepth < a.maxDepth) ? b : a));
      const firstBlocked = [...cur.blocked].sort((a, b) => indexAlong(cur.c.coords, [a.lng, a.lat]) - indexAlong(cur.c.coords, [b.lng, b.lat]))[0];
      const hp: LngLat = [firstBlocked.lng, firstBlocked.lat];
      const dir = bearing(origin, dest);
      const vias: LngLat[] = [];
      for (const dm of [1500, 3500, 6000]) for (const side of [90, -90]) vias.push(offsetPoint(hp, dir + side, dm));
      const results = await Promise.allSettled(vias.map((v) => fetchCandidates([origin, v, dest], false, signal)));
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      detourTried += vias.length;
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const c of r.value) {
          if (c.distance > baseDist * 2.2 + 3000) continue;
          pool.push(c);
          scored.push(score(c, checkpoints, limit));
        }
      }
    }

    // เลือกเส้นทาง
    const safe = safeOnes();
    let status: RouteResult['status'] = 'safe';
    let best: Scored;
    if (safe.length) {
      best = safe.reduce((a, b) => (b.score < a.score ? b : a));
    } else {
      status = 'unsafe';
      best = scored.reduce((a, b) =>
        b.maxDepth < a.maxDepth || (b.maxDepth === a.maxDepth && b.blocked.length < a.blocked.length) ? b : a,
      );
    }

    // สร้างคำอธิบาย
    const reasoning: string[] = [];
    const reportsNear = checkpoints.length;
    const newest = checkpoints.reduce((m, c) => Math.max(m, c.updatedAt), 0);
    reasoning.push(
      `วิเคราะห์เส้นทางถนนจริง ${scored.length} ตัวเลือก${detourTried ? ` (รวมเส้นทางอ้อม ${scored.length - initialCount} เส้น)` : ''} เทียบกับรายงานน้ำท่วม ${reportsNear} จุดจากประชาชน (ล่าสุด ${newest ? fmtMin(Date.now() - newest) : '-'})`,
    );
    reasoning.push(
      `รถของคุณ${vehicle.model ? ` (${vehicle.model})` : ''} ลุยน้ำได้ไม่เกิน ${limit} ซม. จุดที่น้ำสูงกว่านี้ถือว่าผ่านไม่ได้`,
    );
    const avoided = fastest.blocked.filter((h) => !best.blocked.some((b) => b.id === h.id));
    if (status === 'safe') {
      if (best.c === fastest.c && fastest.hazards.length === 0) {
        reasoning.push('เส้นทางที่เร็วที่สุดไม่พบรายงานน้ำท่วมบนเส้นทาง จึงแนะนำเส้นนี้');
      } else if (best.c === fastest.c) {
        reasoning.push('เส้นทางที่เร็วที่สุดมีน้ำขัง แต่ทุกจุดอยู่ในระดับที่รถของคุณผ่านได้');
      } else if (avoided.length) {
        reasoning.push(
          `เส้นทางที่เร็วที่สุดถูกปฏิเสธ เพราะมีน้ำสูงเกินที่รถผ่านได้ ${avoided.length} จุด: ` +
            avoided.slice(0, 3).map((h) => `${h.name} (${Math.round(h.depthCm)} ซม.)`).join(', '),
        );
        const extra = best.c.distance - fastest.c.distance;
        reasoning.push(`เลือกเส้นทางที่ปลอดภัยแทน${extra > 0 ? ` (อ้อมเพิ่ม ${(extra / 1000).toFixed(1)} กม.)` : ''}`);
      } else {
        reasoning.push('เลือกเส้นทางที่มีจุดน้ำขังน้อยกว่าและปลอดภัยกว่า');
      }
      if (best.caution.length) {
        reasoning.push(`ระวัง: มีน้ำขัง 20 ซม.ขึ้นไป ${best.caution.length} จุดที่ยังผ่านได้ โปรดขับช้า ๆ ตามที่ระบุ`);
      }
    } else {
      reasoning.push(
        `ไม่พบเส้นทางที่รถของคุณผ่านได้ทั้งเส้น ทุกเส้นมีน้ำสูงเกิน ${limit} ซม. อย่างน้อย ${best.blocked.length} จุด: ` +
          best.blocked.slice(0, 3).map((h) => `${h.name} (${Math.round(h.depthCm)} ซม.)`).join(', '),
      );
      reasoning.push('แสดงเส้นที่น้ำสูงสุดต่ำที่สุดเพื่อประกอบการตัดสินใจ — ไม่แนะนำให้ฝ่าน้ำ โปรดรอหรือหาที่พักพิงใกล้ที่สุด');
    }

    const hazardsOnRoute = best.hazards;
    const wet = best.caution.length + best.blocked.length;
    const baselineDiff = best.c !== fastest.c;
    return {
      status,
      source: 'osrm',
      coords: best.c.coords,
      distance: best.c.distance,
      durationMin: Math.max(1, Math.round((best.c.duration + WET_PENALTY_S * wet) / 60)),
      maxDepthCm: best.maxDepth,
      steps: buildSteps(best.c, hazardsOnRoute),
      baseline: baselineDiff ? { coords: fastest.c.coords, distance: fastest.c.distance } : null,
      avoidedSegments: avoided.length,
      detourM: Math.max(0, best.c.distance - fastest.c.distance),
      hazards: hazardsOnRoute,
      avoided,
      reasoning,
      candidatesChecked: scored.length,
      limitCm: limit,
    };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    // ออฟไลน์/บริการเส้นทางไม่พร้อม → ใช้กราฟถนนสำรอง
    const r = computeRoute(origin, dest, limit, checkpoints, [], destName);
    r.reasoning = ['ไม่สามารถเชื่อมต่อบริการเส้นทางออนไลน์ได้ ใช้แผนที่ถนนสำรองในเครื่อง (ความแม่นยำต่ำกว่า)', ...r.reasoning];
    return r;
  }
}

/** ระยะเส้นตรง (ม.) – ใช้ตรวจว่าปลายทางห่างจากต้นทางเกินไปหรือไม่ */
export const straightDistance = (a: LngLat, b: LngLat) => haversine(a, b);
