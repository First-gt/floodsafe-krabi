import { distToSegment, haversine, lerp, type LngLat } from './geo';
import type { District } from './types';

/**
 * กราฟถนนแบบย่อของเส้นทางหลักในจังหวัดสงขลา (ทล.4, ทล.407, ทล.408, ทล.414)
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

const n = (id: string, name: string, lng: number, lat: number, district: District): RoadNode => ({
  id,
  name,
  lng,
  lat,
  district,
});

export const ROAD_NODES: Record<string, RoadNode> = Object.fromEntries(
  [
    n('rn', 'ระโนด', 100.322, 7.777, 'Ranot'),
    n('st', 'สทิงพระ', 100.435, 7.472, 'Ranot'),
    n('sn', 'สิงหนคร', 100.558, 7.206, 'Mueang Songkhla'),
    n('ms', 'ตัวเมืองสงขลา', 100.5951, 7.1898, 'Mueang Songkhla'),
    n('ky', 'เกาะยอ', 100.542, 7.163, 'Mueang Songkhla'),
    n('nn', 'น้ำน้อย', 100.525, 7.095, 'Hat Yai'),
    n('kh', 'แยกคอหงส์', 100.504, 7.018, 'Hat Yai'),
    n('hy', 'ตัวเมืองหาดใหญ่', 100.4747, 7.0084, 'Hat Yai'),
    n('ka', 'คลองแห', 100.471, 7.046, 'Hat Yai'),
    n('kn', 'ควนเนียง', 100.354, 7.182, 'Hat Yai'),
    n('air', 'ท่าอากาศยานหาดใหญ่', 100.3929, 6.9332, 'Hat Yai'),
    n('bp', 'บ้านพรุ', 100.472, 6.942, 'Hat Yai'),
    n('kp', 'พังลา', 100.448, 6.812, 'Sadao'),
    n('kn2', 'คลองแงะ', 100.427, 6.762, 'Sadao'),
    n('sd', 'ตัวเมืองสะเดา', 100.421, 6.638, 'Sadao'),
    n('dn', 'ด่านนอก (สะเดา)', 100.418, 6.526, 'Sadao'),
    n('pb', 'ปาดังเบซาร์', 100.328, 6.663, 'Sadao'),
    n('jn', 'จะนะ', 100.742, 6.912, 'Mueang Songkhla'),
  ].map((x) => [x.id, x]),
);

const RAW_EDGES: [string, string, string, string][] = [
  ['e1', 'rn', 'st', 'ทางหลวงหมายเลข 408'],
  ['e2', 'st', 'sn', 'ทางหลวงหมายเลข 408'],
  ['e3', 'sn', 'ms', 'สะพานติณสูลานนท์'],
  ['e4', 'ms', 'ky', 'ทางหลวงหมายเลข 408'],
  ['e5', 'ky', 'nn', 'ถนนลพบุรีราเมศวร์ (ทล.414)'],
  ['e6', 'nn', 'kh', 'ถนนกาญจนวนิช (ทล.407)'],
  ['e7', 'kh', 'hy', 'ถนนเพชรเกษม (ทล.4)'],
  ['e8', 'hy', 'ka', 'ถนนลพบุรีราเมศวร์ (ทล.414)'],
  ['e9', 'ka', 'nn', 'ถนนลพบุรีราเมศวร์ (ทล.414)'],
  ['e10', 'ka', 'kn', 'ทางหลวงหมายเลข 4'],
  ['e11', 'kn', 'st', 'ทางหลวงชนบท สข.4018'],
  ['e12', 'hy', 'air', 'ถนนสนามบิน-ลพบุรีราเมศวร์'],
  ['e13', 'hy', 'bp', 'ถนนกาญจนวนิช (ทล.4)'],
  ['e14', 'air', 'bp', 'ทางหลวงชนบท สข.4036'],
  ['e15', 'bp', 'kp', 'ทางหลวงหมายเลข 4'],
  ['e16', 'kp', 'kn2', 'ทางหลวงหมายเลข 4'],
  ['e17', 'kn2', 'sd', 'ทางหลวงหมายเลข 4'],
  ['e18', 'sd', 'dn', 'ทางหลวงหมายเลข 4'],
  ['e19', 'sd', 'pb', 'ทางหลวงหมายเลข 4054'],
  ['e20', 'ms', 'jn', 'ทางหลวงหมายเลข 408'],
  ['e21', 'kh', 'jn', 'ทางหลวงหมายเลข 43'],
  ['e22', 'kh', 'ms', 'ถนนกาญจนวนิช (ทล.407)'],
  ['e23', 'air', 'kn2', 'ทางหลวงชนบท สข.2004'],
  ['e24', 'bp', 'jn', 'ทางหลวงหมายเลข 43'],
];

function polyLength(g: LngLat[]): number {
  let t = 0;
  for (let i = 1; i < g.length; i++) t += haversine(g[i - 1], g[i]);
  return t;
}

export const ROAD_EDGES: RoadEdge[] = RAW_EDGES.map(([id, a, b, road]) => {
  const g: LngLat[] = [
    [ROAD_NODES[a].lng, ROAD_NODES[a].lat],
    [ROAD_NODES[b].lng, ROAD_NODES[b].lat],
  ];
  return { id, a, b, road, geometry: g, length: polyLength(g) };
});

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
