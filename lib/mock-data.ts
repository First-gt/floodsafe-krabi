import { analyzeIncident } from './ai-engine';
import type { LngLat } from './geo';
import { pointOnEdge } from './road-network';
import type {
  Checkpoint,
  District,
  EquipmentStock,
  FloodZone,
  Hazard,
  Incident,
  IncidentStatus,
  Passability,
  Place,
  RescueNeed,
  Team,
} from './types';

const MIN = 60_000;
const NOW = Date.now();

export const DISTRICTS: Record<District, { thai: string; center: LngLat; zoom: number }> = {
  'Mueang Krabi': { thai: 'เมืองกระบี่', center: [98.9063, 8.0863], zoom: 12 },
  'Ao Luek': { thai: 'อ่าวลึก', center: [98.764, 8.38], zoom: 12 },
  'Plai Phraya': { thai: 'พลายพระยา', center: [98.7, 8.45], zoom: 12 },
  'Khlong Thom': { thai: 'คลองท่อม', center: [99.166, 7.933], zoom: 12 },
};

export const KRABI_CENTER: LngLat = [98.93, 8.2];

/** จุดเริ่มต้นสาธิต เมื่อ GPS ของเบราว์เซอร์ไม่อยู่ในจังหวัดกระบี่ */
export const DEMO_ORIGIN = { name: 'อ่าวลึก (ตำแหน่งสาธิต)', coord: [98.764, 8.38] as LngLat };

/* ------------------------------------------------------------------ */
/* จุดตรวจระดับน้ำจากประชาชน (วางบนเส้นถนนในกราฟ)                      */
/* ------------------------------------------------------------------ */
const cp = (
  id: string,
  name: string,
  district: District,
  edge: string,
  t: number,
  depthCm: number,
  source: Checkpoint['source'],
  agoMin: number,
): Checkpoint => {
  const [lng, lat] = pointOnEdge(edge, t);
  return { id, name, district, lng, lat, depthCm, source, updatedAt: NOW - agoMin * MIN };
};

export const INITIAL_CHECKPOINTS: Checkpoint[] = [
  // พลายพระยา
  cp('cp01', 'ถนนตลาดพลายพระยา', 'Plai Phraya', 'e1', 0.3, 55, 'citizen', 8),
  cp('cp02', 'บ้านคลองหิน', 'Plai Phraya', 'e1', 0.7, 32, 'volunteer', 12),
  cp('cp03', 'ทล.ท้องถิ่น 4151 – วัดพลายพระยา', 'Plai Phraya', 'e21', 0.5, 12, 'citizen', 20),
  cp('cp04', 'เทศบาลพลายพระยา', 'Plai Phraya', 'e21', 0.1, 8, 'sensor', 3),
  // อ่าวลึก
  cp('cp05', 'สี่แยกอ่าวลึก', 'Ao Luek', 'e2', 0.6, 24, 'citizen', 15),
  cp('cp06', 'บ้านอ่าวลึกใต้', 'Ao Luek', 'e3', 0.4, 68, 'volunteer', 5),
  cp('cp07', 'วัดอ่าวลึก', 'Ao Luek', 'e3', 0.85, 15, 'citizen', 25),
  cp('cp08', 'ถนนบ้านเขาทอง', 'Ao Luek', 'e22', 0.5, 11, 'citizen', 30),
  cp('cp09', 'ถนนบ้านลำทับ', 'Ao Luek', 'e9', 0.5, 10, 'sensor', 4),
  cp('cp10', 'บ้านห้วยพลู', 'Ao Luek', 'e10', 0.5, 18, 'citizen', 18),
  cp('cp11', 'ถนนเขาพนม', 'Ao Luek', 'e4', 0.5, 45, 'volunteer', 9),
  cp('cp12', 'สามแยกเขาพนม', 'Ao Luek', 'e5', 0.5, 14, 'citizen', 40),
  // เมืองกระบี่
  cp('cp13', 'บ้านหนองทะเล', 'Mueang Krabi', 'e6', 0.5, 28, 'citizen', 11),
  cp('cp14', 'ทางเข้าโรงพยาบาลกระบี่', 'Mueang Krabi', 'e7', 0.6, 36, 'volunteer', 7),
  cp('cp15', 'ถนนท่าเรือกระบี่', 'Mueang Krabi', 'e8', 0.5, 62, 'citizen', 6),
  cp('cp16', 'ถนนเลี่ยงเมืองกระบี่', 'Mueang Krabi', 'e20', 0.5, 12, 'sensor', 2),
  cp('cp17', 'ทล.4034 – บ้านคลองประสงค์', 'Mueang Krabi', 'e12', 0.4, 16, 'citizen', 22),
  cp('cp18', 'ถนนสนามบิน', 'Mueang Krabi', 'e13', 0.5, 6, 'sensor', 1),
  cp('cp19', 'ทช.4035 – บ้านทุ่งทราย', 'Ao Luek', 'e23', 0.5, 13, 'citizen', 35),
  cp('cp20', 'สะพานเหนือคลอง', 'Mueang Krabi', 'e14', 0.5, 19, 'sensor', 4),
  // คลองท่อม
  cp('cp21', 'บ้านคลองพน', 'Mueang Krabi', 'e15', 0.5, 42, 'citizen', 13),
  cp('cp22', 'คลองท่อมเหนือ', 'Khlong Thom', 'e16', 0.6, 38, 'volunteer', 10),
  cp('cp23', 'ตลาดคลองท่อม', 'Khlong Thom', 'e18', 0.5, 72, 'citizen', 4),
  cp('cp24', 'คลองท่อมใต้', 'Khlong Thom', 'e19', 0.5, 22, 'citizen', 17),
  cp('cp25', 'ถนนเหนือคลอง', 'Mueang Krabi', 'e17', 0.5, 9, 'sensor', 3),
  cp('cp26', 'ทช.4038 – บ้านบางแก้ว', 'Khlong Thom', 'e24', 0.5, 17, 'citizen', 28),
];

/* ------------------------------------------------------------------ */
/* พื้นที่น้ำท่วมจำลองจากดาวเทียม (SAR / Sentinel-1)                    */
/* ------------------------------------------------------------------ */
function blob(center: LngLat, rxKm: number, ryKm: number, rotDeg: number, seed: number, n = 16): LngLat[] {
  const ring: LngLat[] = [];
  const rot = (rotDeg * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    const r = 1 + 0.18 * Math.sin(seed * 3.1 + i * 1.7) + 0.1 * Math.cos(seed + i * 2.9);
    const x = rxKm * Math.cos(a) * r;
    const y = ryKm * Math.sin(a) * r;
    const xr = x * Math.cos(rot) - y * Math.sin(rot);
    const yr = x * Math.sin(rot) + y * Math.cos(rot);
    ring.push([center[0] + xr / (111.32 * Math.cos((center[1] * Math.PI) / 180)), center[1] + yr / 110.54]);
  }
  ring.push(ring[0]);
  return ring;
}

const zone = (
  name: string,
  district: District,
  severity: 'moderate' | 'high',
  center: LngLat,
  rx: number,
  ry: number,
  rot: number,
  seed: number,
): FloodZone => ({
  type: 'Feature',
  properties: { name, district, severity, source: 'Sentinel-1 SAR (จำลอง)' },
  geometry: { type: 'Polygon', coordinates: [blob(center, rx, ry, rot, seed)] },
});

export const FLOOD_ZONES: FloodZone[] = [
  zone('แอ่งพลายพระยา', 'Plai Phraya', 'high', [98.704, 8.442], 2.2, 1.3, 20, 1),
  zone('ที่ราบน้ำท่วมอ่าวลึก', 'Ao Luek', 'high', pointOnEdge('e3', 0.4), 3.2, 1.1, 60, 2),
  zone('ที่ลุ่มเขาพนม', 'Ao Luek', 'moderate', pointOnEdge('e4', 0.5), 2.0, 1.0, 40, 3),
  zone('ริมแม่น้ำกระบี่', 'Mueang Krabi', 'high', [98.913, 8.065], 1.9, 1.0, 0, 4),
  zone('พื้นที่ชุ่มน้ำหนองทะเล', 'Mueang Krabi', 'moderate', [98.915, 8.118], 1.5, 0.9, 80, 5),
  zone('ที่ราบคลองพน', 'Mueang Krabi', 'moderate', pointOnEdge('e15', 0.5), 1.6, 0.9, 50, 6),
  zone('ชุมชนคลองท่อม', 'Khlong Thom', 'high', [99.165, 7.934], 2.6, 1.5, 30, 7),
];

/* ------------------------------------------------------------------ */
/* ทีมกู้ภัยและอุปกรณ์                                                  */
/* ------------------------------------------------------------------ */
export const TEAMS: Team[] = [
  { id: 't1', name: 'มูลนิธิกู้ภัยกระบี่', base: 'เมืองกระบี่', lng: 98.908, lat: 8.083, members: 12, skills: ['boat', 'medical', 'vehicle'], status: 'available' },
  { id: 't2', name: 'หน่วยกาชาดคลองท่อม', base: 'คลองท่อม', lng: 99.162, lat: 7.935, members: 7, skills: ['boat', 'medical'], status: 'busy' },
  { id: 't3', name: 'ชุดเรืออาสาอ่าวลึก', base: 'อ่าวลึก', lng: 98.766, lat: 8.383, members: 8, skills: ['boat', 'swiftwater'], status: 'available' },
  { id: 't4', name: 'หน่วยกู้ภัยเทศบาลพลายพระยา (อปพร.)', base: 'พลายพระยา', lng: 98.701, lat: 8.452, members: 10, skills: ['vehicle', 'logistics', 'boat'], status: 'available' },
  { id: 't5', name: 'กองร้อยทหารช่าง รถ 6 ล้อ', base: 'เมืองกระบี่', lng: 98.94, lat: 8.095, members: 14, skills: ['vehicle', 'logistics'], status: 'available' },
  { id: 't6', name: 'ชุดกู้ภัยกระแสน้ำเชี่ยว กรมเจ้าท่า', base: 'ท่าเรือกระบี่', lng: 98.915, lat: 8.064, members: 6, skills: ['swiftwater', 'boat'], status: 'available' },
  { id: 't7', name: 'หน่วยแพทย์ฉุกเฉิน รพ.กระบี่', base: 'เมืองกระบี่', lng: 98.915, lat: 8.09, members: 6, skills: ['medical'], status: 'available' },
  { id: 't8', name: 'อาสาสมัครแจกอาหารและน้ำดื่ม', base: 'เมืองกระบี่', lng: 98.9, lat: 8.1, members: 20, skills: ['logistics'], status: 'available' },
];

export const INITIAL_EQUIPMENT: EquipmentStock[] = [
  { id: 'boat', total: 6, available: 5 },
  { id: 'life_jacket', total: 80, available: 76 },
  { id: 'truck6', total: 3, available: 3 },
  { id: 'highclear', total: 8, available: 8 },
  { id: 'swift_kit', total: 2, available: 2 },
  { id: 'medic_kit', total: 10, available: 9 },
  { id: 'stretcher', total: 8, available: 8 },
  { id: 'food_pack', total: 240, available: 240 },
  { id: 'light', total: 6, available: 6 },
];

/* ------------------------------------------------------------------ */
/* เหตุการณ์ขอความช่วยเหลือ                                             */
/* ------------------------------------------------------------------ */
const inc = (
  id: string,
  reporter: string,
  locationName: string,
  district: District,
  edge: string,
  t: number,
  off: LngLat,
  depthCm: number,
  passability: Passability,
  needs: RescueNeed[],
  hazards: Hazard[],
  people: number,
  status: IncidentStatus,
  agoMin: number,
  note?: string,
  extra: Partial<Incident> = {},
): Incident => {
  const [lng, lat] = pointOnEdge(edge, t);
  return {
    id,
    reporter,
    phone: '08x-xxx-' + String(1000 + Math.abs(id.charCodeAt(id.length - 1) * 37)).slice(0, 4),
    locationName,
    district,
    lng: lng + off[0],
    lat: lat + off[1],
    depthCm,
    passability,
    needs,
    hazards,
    people,
    note,
    photos: [],
    createdAt: NOW - agoMin * MIN,
    status,
    recommendation: analyzeIncident({ depthCm, passability, needs, hazards, people }),
    assignedTeamIds: [],
    assignedEquipment: {},
    ...extra,
  };
};

export const INITIAL_INCIDENTS: Incident[] = [
  inc('i101', 'คุณสมชาย', 'บ้านคลองหิน อ.พลายพระยา', 'Plai Phraya', 'e1', 0.6, [0.002, 0.001], 95, 'blocked', ['boat', 'elderly', 'medical'], ['strong_current'], 5, 'pending', 6, 'คุณยายติดเตียงอยู่ชั้นล่าง น้ำขึ้นเร็วมาก'),
  inc('i102', 'คุณมาลี', 'บ้านอ่าวลึกใต้ อ.อ่าวลึก', 'Ao Luek', 'e3', 0.45, [-0.002, 0.002], 110, 'blocked', ['boat', 'life_jackets', 'food_water'], [], 9, 'pending', 14, 'อยู่บนชั้นสอง 9 คน ยังไม่ได้กินข้าวตั้งแต่เมื่อวาน'),
  inc('i103', 'คุณประสิทธิ์', 'ชุมชนท่าเรือกระบี่', 'Mueang Krabi', 'e8', 0.55, [0.001, -0.002], 65, 'blocked', ['boat', 'elderly'], ['power_outage'], 4, 'pending', 22),
  inc('i104', 'คุณน้อย', 'ตลาดคลองท่อม', 'Khlong Thom', 'e18', 0.5, [0.002, 0.001], 78, 'blocked', ['boat', 'medical'], [], 3, 'dispatched', 40, 'ผู้ป่วยเบาหวาน ต้องการอินซูลิน', {
    assignedTeamIds: ['t2'],
    assignedEquipment: { boat: 1, life_jacket: 4, medic_kit: 1 },
    dispatchedAt: NOW - 28 * MIN,
  }),
  inc('i105', 'คุณอรุณ', 'บ้านคลองพน', 'Mueang Krabi', 'e15', 0.45, [0.001, 0.002], 44, 'blocked', ['food_water', 'elderly'], [], 6, 'pending', 55),
  inc('i106', 'คุณวิภา', 'บ้านหนองทะเล', 'Mueang Krabi', 'e6', 0.45, [-0.001, 0.001], 30, 'pickup_only', ['food_water'], [], 2, 'pending', 70),
  inc('i107', 'คุณบุญมี', 'เทศบาลพลายพระยา', 'Plai Phraya', 'e21', 0.15, [0.001, 0.001], 52, 'blocked', ['life_jackets', 'medical'], [], 3, 'rescued', 190, undefined, {
    assignedTeamIds: ['t4'],
    dispatchedAt: NOW - 170 * MIN,
    rescuedAt: NOW - 120 * MIN,
  }),
  inc('i108', 'คุณเล็ก', 'วัดอ่าวลึก', 'Ao Luek', 'e3', 0.85, [0.001, -0.001], 28, 'pickup_only', ['elderly'], [], 1, 'rescued', 300, undefined, {
    assignedTeamIds: ['t3'],
    dispatchedAt: NOW - 280 * MIN,
    rescuedAt: NOW - 240 * MIN,
  }),
];

/* ------------------------------------------------------------------ */
/* สถานที่สำหรับค้นหาปลายทาง (alias = ชื่อภาษาอังกฤษ ใช้ค้นหา)           */
/* ------------------------------------------------------------------ */
export const PLACES: Place[] = [
  { id: 'p1', name: 'โรงพยาบาลกระบี่', alias: 'Krabi Hospital', district: 'Mueang Krabi', lng: 98.9115, lat: 8.0905, kind: 'hospital' },
  { id: 'p2', name: 'ตัวเมืองกระบี่', alias: 'Krabi Town', district: 'Mueang Krabi', lng: 98.9063, lat: 8.0863, kind: 'town' },
  { id: 'p3', name: 'ท่าอากาศยานกระบี่', alias: 'Krabi Airport', district: 'Mueang Krabi', lng: 98.986, lat: 8.099, kind: 'transport' },
  { id: 'p4', name: 'ท่าเรือเจ้าฟ้า', alias: 'Chao Fah Pier', district: 'Mueang Krabi', lng: 98.915, lat: 8.062, kind: 'transport' },
  { id: 'p5', name: 'สนามกีฬากระบี่ (ศูนย์พักพิง)', alias: 'Krabi Stadium shelter', district: 'Mueang Krabi', lng: 98.952, lat: 8.1, kind: 'shelter' },
  { id: 'p6', name: 'โรงพยาบาลอ่าวลึก', alias: 'Ao Luek Hospital', district: 'Ao Luek', lng: 98.766, lat: 8.381, kind: 'hospital' },
  { id: 'p7', name: 'เทศบาลอ่าวลึก (ศูนย์พักพิง)', alias: 'Ao Luek Municipality shelter', district: 'Ao Luek', lng: 98.762, lat: 8.379, kind: 'shelter' },
  { id: 'p8', name: 'ตลาดเขาพนม', alias: 'Khao Phanom Market', district: 'Ao Luek', lng: 98.885, lat: 8.225, kind: 'market' },
  { id: 'p9', name: 'โรงพยาบาลพลายพระยา', alias: 'Plai Phraya Hospital', district: 'Plai Phraya', lng: 98.701, lat: 8.451, kind: 'hospital' },
  { id: 'p10', name: 'โรงเรียนพลายพระยา (ศูนย์พักพิง)', alias: 'Plai Phraya School shelter', district: 'Plai Phraya', lng: 98.735, lat: 8.415, kind: 'shelter' },
  { id: 'p11', name: 'โรงพยาบาลคลองท่อม', alias: 'Khlong Thom Hospital', district: 'Khlong Thom', lng: 99.165, lat: 7.934, kind: 'hospital' },
  { id: 'p12', name: 'ตลาดคลองท่อม', alias: 'Khlong Thom Market', district: 'Khlong Thom', lng: 99.167, lat: 7.932, kind: 'market' },
  { id: 'p13', name: 'วัดคลองท่อม (ศูนย์พักพิง)', alias: 'Khlong Thom Temple shelter', district: 'Khlong Thom', lng: 99.2, lat: 7.88, kind: 'shelter' },
  { id: 'p14', name: 'ชุมชนเหนือคลอง', alias: 'Nuea Khlong', district: 'Mueang Krabi', lng: 99.05, lat: 8.12, kind: 'town' },
];
