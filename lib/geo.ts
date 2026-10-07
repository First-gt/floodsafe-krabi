export type LngLat = [number, number];

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing a → b in degrees (0 = north, clockwise). */
export function bearing(a: LngLat, b: LngLat): number {
  const dLng = rad(b[0] - a[0]);
  const y = Math.sin(dLng) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
    Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function compass(deg: number): string {
  const dirs = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
  return dirs[Math.round(deg / 45) % 8];
}

/** Shortest distance (m) from point p to segment a-b (local equirectangular approximation). */
export function distToSegment(p: LngLat, a: LngLat, b: LngLat): number {
  const k = Math.cos(rad(p[1]));
  const toXY = (q: LngLat): [number, number] => [(q[0] - p[0]) * 111320 * k, (q[1] - p[1]) * 110540];
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function lerp(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Ray-casting point in polygon ring. */
export function pointInRing(pt: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} ม.` : `${(m / 1000).toFixed(1)} กม.`;
}

/** Krabi province rough bounding box – used to decide if a GPS fix is usable for the demo. */
export function inKrabi(p: LngLat): boolean {
  return p[1] > 7.6 && p[1] < 8.75 && p[0] > 98.5 && p[0] < 99.45;
}

/** ????????????????? p ?? distM ???? ?????? bearingDeg */
export function offsetPoint(p: LngLat, bearingDeg: number, distM: number): LngLat {
  const br = rad(bearingDeg);
  const d = distM / R;
  const lat1 = rad(p[1]);
  const lng1 = rad(p[0]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}
