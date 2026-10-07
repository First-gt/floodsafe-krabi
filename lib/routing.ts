import { bearing, compass, haversine, pointInRing, type LngLat } from './geo';
import { ROAD_EDGES, ROAD_NODES, distToPolyline, nearestNode, nodeCoord, type RoadEdge } from './road-network';
import { hazardsAlong, type RouteHazard } from './route-eval';
import type { Checkpoint, FloodZone } from './types';

const CHECK_RADIUS_M = 250;

export interface RouteStep {
  maneuver: 'depart' | 'straight' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right' | 'uturn' | 'roundabout' | 'arrive';
  instruction: string;
  road: string;
  distance: number;
  maxDepthCm: number;
  warning?: string;
  location: LngLat;
}

export interface RouteResult {
  /** safe: ผ่านได้ทั้งเส้นทาง · unsafe: ไม่มีเส้นทางที่รถคันนี้ผ่านได้ จึงแสดงเส้นที่น้ำน้อยที่สุด · none: ไปไม่ถึง */
  status: 'safe' | 'unsafe' | 'none';
  /** osrm = ถนนจริงจากบริการเส้นทางออนไลน์ · offline = กราฟถนนสำรองในเครื่อง */
  source: 'osrm' | 'offline';
  coords: LngLat[];
  distance: number;
  durationMin: number;
  maxDepthCm: number;
  steps: RouteStep[];
  /** เส้นทางสั้นสุดที่ไม่คำนึงถึงน้ำท่วม – แสดงเมื่อต่างจากเส้นทางที่เลือก */
  baseline: { coords: LngLat[]; distance: number } | null;
  avoidedSegments: number;
  detourM: number;
  /** รายงานน้ำท่วมที่อยู่บนเส้นทางที่เลือก */
  hazards: RouteHazard[];
  /** รายงานที่ทำให้ AI ปฏิเสธเส้นทางอื่น */
  avoided: RouteHazard[];
  /** คำอธิบายการตัดสินใจของ AI (ภาษาไทย) */
  reasoning: string[];
  candidatesChecked: number;
  limitCm: number;
}

interface EdgeInfo {
  edge: RoadEdge;
  length: number;
  depth: number;
  zoneFrac: number;
}
interface Hop {
  from: string;
  to: string;
  info: EdgeInfo;
}

function buildEdgeInfo(checkpoints: Checkpoint[], zones: FloodZone[]): Map<string, EdgeInfo> {
  const map = new Map<string, EdgeInfo>();
  for (const edge of ROAD_EDGES) {
    let depth = 0;
    for (const c of checkpoints) {
      if (c.depthCm > depth && distToPolyline([c.lng, c.lat], edge.geometry) <= CHECK_RADIUS_M) depth = c.depthCm;
    }
    let inside = 0;
    const g = edge.geometry;
    const step = Math.max(1, Math.floor(g.length / 24));
    let total = 0;
    for (let i = 0; i < g.length; i += step) {
      total++;
      if (zones.some((z) => pointInRing(g[i], z.geometry.coordinates[0]))) inside++;
    }
    map.set(edge.id, { edge, length: edge.length, depth, zoneFrac: total ? inside / total : 0 });
  }
  return map;
}

function dijkstra(start: string, end: string, infos: Map<string, EdgeInfo>, cost: (i: EdgeInfo) => number | null): Hop[] | null {
  const adj = new Map<string, { to: string; info: EdgeInfo }[]>();
  for (const info of infos.values()) {
    const c = cost(info);
    if (c === null) continue;
    (adj.get(info.edge.a) ?? adj.set(info.edge.a, []).get(info.edge.a)!).push({ to: info.edge.b, info });
    (adj.get(info.edge.b) ?? adj.set(info.edge.b, []).get(info.edge.b)!).push({ to: info.edge.a, info });
  }
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, Hop>();
  const done = new Set<string>();
  while (true) {
    let u: string | null = null;
    let best = Infinity;
    for (const [k, v] of dist) {
      if (!done.has(k) && v < best) {
        best = v;
        u = k;
      }
    }
    if (u === null) return null;
    if (u === end) break;
    done.add(u);
    for (const { to, info } of adj.get(u) ?? []) {
      const nd = best + (cost(info) as number);
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, { from: u, to, info });
      }
    }
  }
  const path: Hop[] = [];
  let cur = end;
  while (cur !== start) {
    const h = prev.get(cur)!;
    path.unshift(h);
    cur = h.from;
  }
  return path;
}

const speedKph = (depth: number) => (depth < 20 ? 55 : depth <= 40 ? 15 : 5);

function hopGeometry(h: Hop): LngLat[] {
  return h.from === h.info.edge.a ? h.info.edge.geometry : [...h.info.edge.geometry].reverse();
}

function pathCoords(origin: LngLat, dest: LngLat, hops: Hop[], startId: string): LngLat[] {
  const pts: LngLat[] = [origin, nodeCoord(startId)];
  for (const h of hops) pts.push(...hopGeometry(h));
  pts.push(dest);
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}

function pathLength(coords: LngLat[]): number {
  let t = 0;
  for (let i = 1; i < coords.length; i++) t += haversine(coords[i - 1], coords[i]);
  return t;
}

function buildSteps(hops: Hop[], origin: LngLat, dest: LngLat, startId: string, destName?: string): RouteStep[] {
  const arrive: RouteStep = {
    maneuver: 'arrive',
    instruction: `ถึงจุดหมาย ${destName ?? 'ปลายทาง'}`,
    road: '',
    distance: 0,
    maxDepthCm: 0,
    location: dest,
  };
  const first = hops[0];
  if (!first) return [arrive];
  const lead = haversine(origin, nodeCoord(startId));
  let prevBearing = bearing(nodeCoord(first.from), nodeCoord(first.to));
  let cur: RouteStep = {
    maneuver: 'depart',
    instruction: `ขับมุ่งหน้าไปทาง${compass(prevBearing)} บน${first.info.edge.road}`,
    road: first.info.edge.road,
    distance: lead + first.info.length,
    maxDepthCm: first.info.depth,
    location: origin,
  };
  const steps: RouteStep[] = [];
  for (let i = 1; i < hops.length; i++) {
    const h = hops[i];
    const b = bearing(nodeCoord(h.from), nodeCoord(h.to));
    const delta = ((b - prevBearing + 540) % 360) - 180;
    const abs = Math.abs(delta);
    if (abs < 30 && h.info.edge.road === cur.road) {
      cur.distance += h.info.length;
      cur.maxDepthCm = Math.max(cur.maxDepthCm, h.info.depth);
    } else {
      steps.push(cur);
      const dir = delta > 0 ? 'right' : 'left';
      const dirTh = dir === 'right' ? 'ขวา' : 'ซ้าย';
      const maneuver: RouteStep['maneuver'] =
        abs < 30 ? 'straight' : abs < 60 ? (`slight-${dir}` as RouteStep['maneuver']) : abs < 135 ? dir : (`sharp-${dir}` as RouteStep['maneuver']);
      const verb = abs < 30 ? 'ตรงไป' : abs < 60 ? `เบี่ยง${dirTh}เล็กน้อย` : abs < 135 ? `เลี้ยว${dirTh}` : `เลี้ยวหักศอก${dirTh}`;
      cur = {
        maneuver,
        instruction: `${verb}เข้า${h.info.edge.road} ที่${ROAD_NODES[h.from].name}`,
        road: h.info.edge.road,
        distance: h.info.length,
        maxDepthCm: h.info.depth,
        location: nodeCoord(h.from),
      };
    }
    prevBearing = b;
  }
  cur.distance += haversine(nodeCoord(hops[hops.length - 1].to), dest);
  steps.push(cur);
  for (const s of steps) {
    if (s.maxDepthCm >= 20) s.warning = `น้ำลึกถึง ${s.maxDepthCm} ซม. บนช่วงนี้`;
  }
  steps.push(arrive);
  return steps;
}

const sig = (h: Hop[] | null) => (h ? h.map((x) => x.info.edge.id).join('>') : '');

/**
 * โหมดสำรอง (ออฟไลน์): Dijkstra บนกราฟถนนในเครื่อง
 * ตัดทุกช่วงที่ความลึกน้ำจากรายงาน > ขีดจำกัดของรถ (limitCm) และถ่วงน้ำหนักช่วงที่อยู่ในพื้นที่น้ำท่วมจากดาวเทียม
 */
export function computeRoute(
  origin: LngLat,
  dest: LngLat,
  limitCm: number,
  checkpoints: Checkpoint[],
  zones: FloodZone[],
  destName?: string,
): RouteResult {
  const none: RouteResult = {
    status: 'none', source: 'offline', coords: [], distance: 0, durationMin: 0, maxDepthCm: 0, steps: [], baseline: null,
    avoidedSegments: 0, detourM: 0, hazards: [], avoided: [], reasoning: [], candidatesChecked: 0, limitCm,
  };
  const start = nearestNode(origin).id;
  const end = nearestNode(dest).id;
  const infos = buildEdgeInfo(checkpoints, zones);
  const passable = (i: EdgeInfo) => i.depth <= limitCm;

  const safe = dijkstra(start, end, infos, (i) => (passable(i) ? i.length * (1 + i.zoneFrac * 0.8) : null));
  const shortest = dijkstra(start, end, infos, (i) => i.length);

  let main = safe;
  let status: RouteResult['status'] = 'safe';
  if (!safe) {
    main = dijkstra(start, end, infos, (i) => i.length * (1 + i.depth / 10));
    status = main ? 'unsafe' : 'none';
  }
  if (!main) return none;

  const coords = pathCoords(origin, dest, main, start);
  const distance = pathLength(coords);
  const durationMin =
    main.reduce((s, h) => s + h.info.length / ((speedKph(h.info.depth) * 1000) / 60), 0) + (distance - main.reduce((s, h) => s + h.info.length, 0)) / ((30 * 1000) / 60);

  let baseline: RouteResult['baseline'] = null;
  let avoided = 0;
  let detour = 0;
  let avoidedHazards: RouteHazard[] = [];
  if (status === 'safe' && shortest && sig(shortest) !== sig(main)) {
    avoided = shortest.filter((h) => !passable(h.info)).length;
    const bc = pathCoords(origin, dest, shortest, start);
    baseline = { coords: bc, distance: pathLength(bc) };
    detour = distance - baseline.distance;
    avoidedHazards = hazardsAlong(bc, checkpoints, limitCm, 250).filter((h) => !h.passable);
  }
  const hazards = hazardsAlong(coords, checkpoints, limitCm, 250);
  const maxDepthCm = hazards.reduce((m, h) => Math.max(m, h.depthCm), 0);

  const reasoning: string[] = [`ใช้กราฟถนนสำรองในเครื่อง (ออฟไลน์) – ขีดจำกัดรถของคุณ ${limitCm} ซม.`];
  if (avoidedHazards.length) reasoning.push(`เลี่ยงจุดน้ำท่วม ${avoidedHazards.length} จุดที่ลึกเกินกว่ารถของคุณจะผ่านได้`);
  if (status === 'unsafe') reasoning.push(`ทุกเส้นทางผ่านน้ำลึกถึง ${maxDepthCm} ซม. ซึ่งเกินขีดจำกัดรถของคุณ`);

  return {
    status,
    source: 'offline',
    coords,
    distance,
    durationMin: Math.max(1, Math.round(durationMin)),
    maxDepthCm,
    steps: buildSteps(main, origin, dest, start, destName),
    baseline,
    avoidedSegments: avoided,
    detourM: detour,
    hazards,
    avoided: avoidedHazards,
    reasoning,
    candidatesChecked: shortest ? 2 : 1,
    limitCm,
  };
}
