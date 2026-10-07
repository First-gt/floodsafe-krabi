import { distToSegment, type LngLat } from './geo';
import type { Checkpoint } from './types';

export interface RouteHazard {
  id: string;
  name: string;
  depthCm: number;
  lng: number;
  lat: number;
  updatedAt: number;
  source: Checkpoint['source'];
  /** รถของผู้ใช้ผ่านได้หรือไม่ */
  passable: boolean;
  /** ระยะห่างจากเส้นทาง (ม.) */
  distM: number;
}

/** รัศมี (ม.) ที่ถือว่าจุดรายงานน้ำท่วม "อยู่บนเส้นทาง" */
export const ON_ROUTE_RADIUS_M = 120;

/** ระยะจากจุดถึง polyline (เร็วขึ้นด้วย bounding-box กรองก่อน) */
export function distToLine(p: LngLat, line: LngLat[], cutoffM = Infinity): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    // ข้ามช่วงที่อยู่ไกลเกินไปอย่างชัดเจน (~0.05° ≈ 5 กม.)
    if (cutoffM !== Infinity) {
      const lim = cutoffM / 100000 + 0.002;
      if (p[0] < Math.min(a[0], b[0]) - lim || p[0] > Math.max(a[0], b[0]) + lim || p[1] < Math.min(a[1], b[1]) - lim || p[1] > Math.max(a[1], b[1]) + lim) continue;
    }
    const d = distToSegment(p, a, b);
    if (d < best) best = d;
  }
  return best;
}

/** รายงานระดับน้ำทั้งหมดที่อยู่บนเส้นทางนี้ */
export function hazardsAlong(coords: LngLat[], checkpoints: Checkpoint[], limitCm: number, radius = ON_ROUTE_RADIUS_M): RouteHazard[] {
  const out: RouteHazard[] = [];
  for (const c of checkpoints) {
    if (c.depthCm < 5) continue;
    const d = distToLine([c.lng, c.lat], coords, radius);
    if (d <= radius) {
      out.push({
        id: c.id,
        name: c.name,
        depthCm: c.depthCm,
        lng: c.lng,
        lat: c.lat,
        updatedAt: c.updatedAt,
        source: c.source,
        passable: c.depthCm <= limitCm,
        distM: d,
      });
    }
  }
  return out.sort((a, b) => b.depthCm - a.depthCm);
}
