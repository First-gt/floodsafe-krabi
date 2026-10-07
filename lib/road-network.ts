import { distToSegment, haversine, lerp, type LngLat } from './geo';
import geometry from './road-geometry.json';
import type { District } from './types';

/**
 * กราฟถนนแบบย่อของเส้นทางหลักในจังหวัดกระบี่ (ทางหลวงหมายเลข 4 + ถนนสายรอง)
 * เรขาคณิตของแต่ละช่วงถนนดึงมาจากข้อมูลถนนจริง (OpenStreetMap ผ่าน OSRM) ไว้ล่วงหน้า
 * ใช้เป็นโหมดสำรองเมื่อไม่มีอินเทอร์เน็ต / บริการเส้นทางออนไลน์ล่ม
 */
export interface RoadNode {
  id: string;
  name: string;
  lng: number;
  lat: number;
  district: District;
}
export interface RoadEdge {
  id: string;
  a: string;
  b: string;
  road: string;
  /** polyline จาก a → b (ตามถนนจริง) */
  geometry: LngLat[];
  length: number;
}

const GEO = geometry as unknown as Record<string, [number, number][]>;

const n = (id: string, name: string, lng: number, lat: number, district: District): RoadNode => ({
  id,
  name,
  lng,
  lat,
  district,
});

export const ROAD_NODES: Record<string, RoadNode> = Object.fromEntries(
  [
    n('pp', 'พลายพระยา', 98.7, 8.45, 'Plai Phraya'),
    n('pp2', 'แยกพลายพระยา', 98.735, 8.415, 'Plai Phraya'),
    n('al', 'อ่าวลึก', 98.764, 8.38, 'Ao Luek'),
    n('al2', 'อ่าวลึกใต้', 98.795, 8.33, 'Ao Luek'),
    n('alt1', 'บ้านเขาทอง', 98.87, 8.3, 'Ao Luek'),
    n('alt2', 'บ้านห้วยพลู', 98.945, 8.22, 'Ao Luek'),
    n('kp', 'เขาพนม', 98.885, 8.225, 'Ao Luek'),
    n('kp2', 'เขาพนมใต้', 98.91, 8.17, 'Mueang Krabi'),
    n('mkn', 'บ้านหนองทะเล', 98.915, 8.12, 'Mueang Krabi'),
    n('mk', 'ตัวเมืองกระบี่', 98.9063, 8.0863, 'Mueang Krabi'),
    n('mkp', 'ท่าเรือกระบี่', 98.915, 8.062, 'Mueang Krabi'),
    n('mke', 'กระบี่ตะวันออก', 98.955, 8.1, 'Mueang Krabi'),
    n('air', 'ท่าอากาศยานกระบี่', 98.986, 8.099, 'Mueang Krabi'),
    n('nk', 'เหนือคลอง', 99.05, 8.12, 'Mueang Krabi'),
    n('mkz', 'บ้านคลองพน', 98.94, 8.03, 'Mueang Krabi'),
    n('ktn', 'คลองท่อมเหนือ', 99.06, 7.99, 'Khlong Thom'),
    n('kt', 'คลองท่อม', 99.166, 7.933, 'Khlong Thom'),
    n('kts', 'คลองท่อมใต้', 99.2, 7.88, 'Khlong Thom'),
  ].map((x) => [x.id, x]),
);

const RAW_EDGES: [string, string, string, string][] = [
  ['e1', 'pp', 'pp2', 'ทางหลวงหมายเลข 4'],
  ['e2', 'pp2', 'al', 'ทางหลวงหมายเลข 4'],
  ['e3', 'al', 'al2', 'ทางหลวงหมายเลข 4'],
  ['e4', 'al2', 'kp', 'ทางหลวงหมายเลข 4'],
  ['e5', 'kp', 'kp2', 'ทางหลวงหมายเลข 4'],
  ['e6', 'kp2', 'mkn', 'ทางหลวงหมายเลข 4'],
  ['e7', 'mkn', 'mk', 'ทางหลวงหมายเลข 4'],
  ['e8', 'mk', 'mkp', 'ถนนอุตรกิจ'],
  ['e9', 'al2', 'alt1', 'ทางหลวงชนบท 4036'],
  ['e10', 'alt1', 'alt2', 'ทางหลวงชนบท 4036'],
  ['e11', 'alt2', 'kp2', 'ทางหลวงชนบท 4036'],
  ['e12', 'mkn', 'mke', 'ทางหลวงหมายเลข 4034'],
  ['e13', 'mke', 'air', 'ถนนสนามบิน'],
  ['e14', 'air', 'nk', 'ทางหลวงหมายเลข 4034'],
  ['e15', 'mk', 'mkz', 'ทางหลวงหมายเลข 4'],
  ['e16', 'mkz', 'ktn', 'ทางหลวงหมายเลข 4'],
  ['e17', 'nk', 'ktn', 'ถนนเหนือคลอง'],
  ['e18', 'ktn', 'kt', 'ทางหลวงหมายเลข 4'],
  ['e19', 'kt', 'kts', 'ทางหลวงหมายเลข 4'],
  ['e20', 'mk', 'mke', 'ถนนเลี่ยงเมืองกระบี่'],
  ['e21', 'pp', 'al', 'ทางหลวงท้องถิ่น 4151'],
  ['e22', 'al', 'alt1', 'ถนนสายรองอ่าวลึก'],
  ['e23', 'alt2', 'mke', 'ทางหลวงชนบท 4035'],
  ['e24', 'nk', 'kt', 'ทางหลวงชนบท 4038'],
];

function polyLength(g: LngLat[]): number {
  let t = 0;
  for (let i = 1; i < g.length; i++) t += haversine(g[i - 1], g[i]);
  return t;
}

export const ROAD_EDGES: RoadEdge[] = RAW_EDGES.map(([id, a, b, road]) => {
  const g = (GEO[id] as LngLat[] | undefined) ?? [
    [ROAD_NODES[a].lng, ROAD_NODES[a].lat],
    [ROAD_NODES[b].lng, ROAD_NODES[b].lat],
  ];
  return { id, a, b, road, geometry: g, length: polyLength(g) };
});

// snap graph nodes onto the real road network
for (const ed of ROAD_EDGES) {
  const first = ed.geometry[0];
  const last = ed.geometry[ed.geometry.length - 1];
  ROAD_NODES[ed.a].lng = first[0];
  ROAD_NODES[ed.a].lat = first[1];
  ROAD_NODES[ed.b].lng = last[0];
  ROAD_NODES[ed.b].lat = last[1];
}

export const nodeCoord = (id: string): LngLat => [ROAD_NODES[id].lng, ROAD_NODES[id].lat];

/** จุดที่ระยะสัดส่วน t (0–1) ตามความยาวของ polyline */
export function pointAlong(g: LngLat[], t: number): LngLat {
  const total = polyLength(g);
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < g.length; i++) {
    const d = haversine(g[i - 1], g[i]);
    if (target <= d || i === g.length - 1) return lerp(g[i - 1], g[i], d === 0 ? 0 : Math.min(1, target / d));
    target -= d;
  }
  return g[0];
}

export function pointOnEdge(edgeId: string, t: number): LngLat {
  const ed = ROAD_EDGES.find((x) => x.id === edgeId);
  if (!ed) throw new Error(`Unknown edge ${edgeId}`);
  return pointAlong(ed.geometry, t);
}

/** ระยะ (ม.) จากจุด p ถึง polyline */
export function distToPolyline(p: LngLat, g: LngLat[]): number {
  let best = Infinity;
  for (let i = 1; i < g.length; i++) {
    const d = distToSegment(p, g[i - 1], g[i]);
    if (d < best) best = d;
  }
  return best;
}

export function nearestNode(p: LngLat): RoadNode {
  let best = Object.values(ROAD_NODES)[0];
  let bd = Infinity;
  for (const node of Object.values(ROAD_NODES)) {
    const d = haversine(p, [node.lng, node.lat]);
    if (d < bd) {
      bd = d;
      best = node;
    }
  }
  return best;
}
