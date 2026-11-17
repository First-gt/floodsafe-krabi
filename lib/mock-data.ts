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
  'Mueang Songkhla': { thai: 'เมืองสงขลา', center: [100.5951, 7.1898], zoom: 12 },
  'Hat Yai': { thai: 'หาดใหญ่', center: [100.4747, 7.0084], zoom: 12 },
  Sadao: { thai: 'สะเดา', center: [100.421, 6.638], zoom: 12 },
  Ranot: { thai: 'ระโนด', center: [100.322, 7.777], zoom: 12 },
};

export const SONGKLA_CENTER: LngLat = [100.5, 7.12];

/** จุดเริ่มต้นสาธิต เมื่อ GPS ของเบราว์เซอร์ไม่อยู่ในจังหวัดสงขลา */
export const DEMO_ORIGIN = { name: 'หาดใหญ่ (ตำแหน่งสาธิต)', coord: [100.4747, 7.0084] as LngLat };

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
  // ระโนด
  cp('cp01', 'ตลาดระโนด (ทล.408)', 'Ranot', 'e1', 0.25, 58, 'citizen', 8),
  cp('cp02', 'บ้านท่าบอน อ.ระโนด', 'Ranot', 'e1', 0.65, 34, 'volunteer', 12),
  cp('cp03', 'หน้าเทศบาลสทิงพระ', 'Ranot', 'e2', 0.3, 14, 'citizen', 20),
  cp('cp04', 'แยกจะทิ้งพระ', 'Ranot', 'e1', 0.85, 10, 'sensor', 3),
  // เมืองสงขลา
  cp('cp05', 'เชิงสะพานติณสูลานนท์ ฝั่งสิงหนคร', 'Mueang Songkhla', 'e3', 0.4, 22, 'citizen', 15),
  cp('cp06', 'ถนนนครนอก (ย่านเมืองเก่าสงขลา)', 'Mueang Songkhla', 'e4', 0.35, 48, 'volunteer', 5),
  cp('cp07', 'แยกสำโรง เมืองสงขลา', 'Mueang Songkhla', 'e22', 0.8, 16, 'citizen', 25),
  cp('cp08', 'บ้านเกาะยอ (ทล.408)', 'Mueang Songkhla', 'e5', 0.3, 12, 'citizen', 30),
  // หาดใหญ่
  cp('cp09', 'ถนนลพบุรีราเมศวร์ (แยกคลองแห)', 'Hat Yai', 'e8', 0.6, 52, 'citizen', 6),
  { id: 'cp10', name: 'ถนนศุภสารรังสรรค์ (หาดใหญ่)', district: 'Hat Yai', lng: 100.485113, lat: 7.008903, depthCm: 42, source: 'volunteer', updatedAt: NOW - 7 * MIN },
  cp('cp11', 'แยกคอหงส์ (หน้า ม.อ.)', 'Hat Yai', 'e7', 0.25, 18, 'sensor', 4),
  cp('cp12', 'ถนนกาญจนวนิช – บ้านน้ำน้อย', 'Hat Yai', 'e6', 0.5, 28, 'citizen', 11),
  cp('cp13', 'ถนนเพชรเกษม – ควนเนียง', 'Hat Yai', 'e10', 0.55, 36, 'citizen', 14),
  cp('cp14', 'ถนนสนามบิน – คลองหอยโข่ง', 'Hat Yai', 'e12', 0.5, 8, 'sensor', 2),
  cp('cp15', 'เทศบาลเมืองบ้านพรุ', 'Hat Yai', 'e13', 0.6, 45, 'citizen', 9),
  cp('cp16', 'ทางเลี่ยงเมืองหาดใหญ่ (ทล.414)', 'Hat Yai', 'e9', 0.5, 12, 'sensor', 3),
  // สะเดา
  cp('cp17', 'ตลาดคลองแงะ (ทล.4)', 'Sadao', 'e16', 0.7, 64, 'citizen', 5),
  cp('cp18', 'บ้านพังลา อ.สะเดา', 'Sadao', 'e15', 0.6, 26, 'volunteer', 16),
  cp('cp19', 'สี่แยกสะเดา', 'Sadao', 'e17', 0.85, 19, 'citizen', 22),
  cp('cp20', 'ถนนด่านนอก – จังโหลน', 'Sadao', 'e18', 0.6, 15, 'sensor', 4),
  cp('cp21', 'ถนนปาดังเบซาร์ (ทล.4054)', 'Sadao', 'e19', 0.5, 31, 'citizen', 18),
  cp('cp22', 'แยกจะนะ (ทล.43)', 'Mueang Songkhla', 'e21', 0.75, 14, 'citizen', 28),
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
  zone('ลุ่มน้ำระโนด – ทะเลสาบสงขลา', 'Ranot', 'high', [100.328, 7.76], 3.0, 1.5, 15, 1),
  zone('พื้นที่ลุ่มคลองแห – หาดใหญ่', 'Hat Yai', 'high', [100.471, 7.042], 2.4, 1.3, 45, 2),
  zone('ริมคลองอู่ตะเภา – บ้านพรุ', 'Hat Yai', 'high', [100.468, 6.955], 2.2, 1.2, 70, 3),
  zone('ย่านเมืองเก่า – ท่าเรือสงขลา', 'Mueang Songkhla', 'moderate', [100.59, 7.195], 1.7, 1.0, 10, 4),
  zone('ที่ราบลุ่มคลองแงะ – สะเดา', 'Sadao', 'high', [100.427, 6.762], 2.1, 1.1, 35, 5),
  zone('ที่ราบควนเนียง', 'Hat Yai', 'moderate', [100.36, 7.18], 1.8, 1.0, 50, 6),
];

/* ------------------------------------------------------------------ */
/* ทีมกู้ภัยและอุปกรณ์                                                  */
/* ------------------------------------------------------------------ */
export const TEAMS: Team[] = [
  { id: 't1', name: 'มูลนิธิมิตรภาพสามัคคี (ท่งเซียเซี่ยงตึ๊ง)', base: 'หาดใหญ่', lng: 100.476, lat: 7.012, members: 14, skills: ['boat', 'medical', 'vehicle'], status: 'available' },
  { id: 't2', name: 'กู้ภัยเทศบาลนครหาดใหญ่', base: 'หาดใหญ่', lng: 100.469, lat: 7.005, members: 10, skills: ['boat', 'swiftwater'], status: 'busy' },
  { id: 't3', name: 'ชุดเรืออาสาสงขลา – สิงหนคร', base: 'เมืองสงขลา', lng: 100.592, lat: 7.191, members: 8, skills: ['boat', 'swiftwater'], status: 'available' },
  { id: 't4', name: 'หน่วยกู้ภัย อปพร. ระโนด', base: 'ระโนด', lng: 100.324, lat: 7.775, members: 10, skills: ['vehicle', 'logistics', 'boat'], status: 'available' },
  { id: 't5', name: 'กองพลพัฒนาที่ 4 รถ 6 ล้อ', base: 'คอหงส์ หาดใหญ่', lng: 100.506, lat: 7.022, members: 16, skills: ['vehicle', 'logistics'], status: 'available' },
  { id: 't6', name: 'ทีมกู้ภัยคลองแงะ – สะเดา', base: 'สะเดา', lng: 100.422, lat: 6.64, members: 8, skills: ['boat', 'vehicle'], status: 'available' },
  { id: 't7', name: 'หน่วยแพทย์ฉุกเฉิน รพ.สงขลานครินทร์', base: 'หาดใหญ่', lng: 100.495, lat: 7.007, members: 6, skills: ['medical'], status: 'available' },
  { id: 't8', name: 'อาสาสมัครแจกอาหารและน้ำดื่ม สงขลา', base: 'เมืองสงขลา', lng: 100.59, lat: 7.185, members: 20, skills: ['logistics'], status: 'available' },
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
  inc('i101', 'คุณสมชาย', 'ชุมชนคลองแห อ.หาดใหญ่', 'Hat Yai', 'e8', 0.65, [0.002, 0.001], 95, 'blocked', ['boat', 'elderly', 'medical'], ['strong_current'], 5, 'pending', 6, 'คุณยายติดเตียงอยู่ชั้นล่าง น้ำคลองอู่ตะเภาเอ่อขึ้นเร็วมาก'),
  inc('i102', 'คุณมาลี', 'บ้านท่าบอน อ.ระโนด', 'Ranot', 'e1', 0.55, [-0.002, 0.002], 110, 'blocked', ['boat', 'life_jackets', 'food_water'], [], 9, 'pending', 14, 'อยู่บนชั้นสอง 9 คน น้ำล้อมรอบออกไม่ได้'),
  inc('i103', 'คุณประสิทธิ์', 'ย่านเมืองเก่า ถนนนครนอก', 'Mueang Songkhla', 'e4', 0.35, [0.001, -0.002], 62, 'blocked', ['boat', 'elderly'], ['power_outage'], 4, 'pending', 22),
  inc('i104', 'คุณน้อย', 'ตลาดคลองแงะ อ.สะเดา', 'Sadao', 'e16', 0.7, [0.002, 0.001], 78, 'blocked', ['boat', 'medical'], [], 3, 'dispatched', 40, 'ผู้ป่วยเบาหวาน ต้องการอินซูลินด่วน', {
    assignedTeamIds: ['t2'],
    assignedEquipment: { boat: 1, life_jacket: 4, medic_kit: 1 },
    dispatchedAt: NOW - 28 * MIN,
  }),
  inc('i105', 'คุณอรุณ', 'เทศบาลเมืองบ้านพรุ อ.หาดใหญ่', 'Hat Yai', 'e13', 0.6, [0.001, 0.002], 46, 'blocked', ['food_water', 'elderly'], [], 6, 'pending', 55),
  inc('i106', 'คุณวิภา', 'บ้านน้ำน้อย อ.หาดใหญ่', 'Hat Yai', 'e6', 0.45, [-0.001, 0.001], 30, 'pickup_only', ['food_water'], [], 2, 'pending', 70),
  inc('i107', 'คุณบุญมี', 'ตลาดระโนด อ.ระโนด', 'Ranot', 'e1', 0.2, [0.001, 0.001], 52, 'blocked', ['life_jackets', 'medical'], [], 3, 'rescued', 190, undefined, {
    assignedTeamIds: ['t4'],
    dispatchedAt: NOW - 170 * MIN,
    rescuedAt: NOW - 120 * MIN,
  }),
  inc('i108', 'คุณเล็ก', 'แยกสำโรง อ.เมืองสงขลา', 'Mueang Songkhla', 'e22', 0.8, [0.001, -0.001], 28, 'pickup_only', ['elderly'], [], 1, 'rescued', 300, undefined, {
    assignedTeamIds: ['t3'],
    dispatchedAt: NOW - 280 * MIN,
    rescuedAt: NOW - 240 * MIN,
  }),
];

/* ------------------------------------------------------------------ */
/* สถานที่สำหรับค้นหาปลายทาง (alias = ชื่อภาษาอังกฤษ ใช้ค้นหา)           */
/* ------------------------------------------------------------------ */
export const PLACES: Place[] = [
  { id: 'p1', name: 'โรงพยาบาลสงขลานครินทร์ (ม.อ.)', alias: 'PSU Hospital Hat Yai มอ', district: 'Hat Yai', lng: 100.4942, lat: 7.0072, kind: 'hospital' },
  { id: 'p2', name: 'โรงพยาบาลหาดใหญ่', alias: 'Hat Yai Hospital', district: 'Hat Yai', lng: 100.4712, lat: 7.0112, kind: 'hospital' },
  { id: 'p3', name: 'ตัวเมืองหาดใหญ่ (ตลาดกิมหยง)', alias: 'Hat Yai Kim Yong Market', district: 'Hat Yai', lng: 100.4747, lat: 7.0084, kind: 'town' },
  { id: 'p4', name: 'ท่าอากาศยานนานาชาติหาดใหญ่', alias: 'Hat Yai Airport', district: 'Hat Yai', lng: 100.3929, lat: 6.9332, kind: 'transport' },
  { id: 'p5', name: 'ศูนย์ประชุมนานาชาติ ม.อ. (ศูนย์พักพิง)', alias: 'PSU ICC Hat Yai shelter', district: 'Hat Yai', lng: 100.4986, lat: 7.0061, kind: 'shelter' },
  { id: 'p6', name: 'โรงพยาบาลสงขลา', alias: 'Songkhla Hospital', district: 'Mueang Songkhla', lng: 100.5944, lat: 7.1319, kind: 'hospital' },
  { id: 'p7', name: 'สนามกีฬาติณสูลานนท์ (ศูนย์พักพิง)', alias: 'Tinsulanon Stadium Songkhla shelter', district: 'Mueang Songkhla', lng: 100.5968, lat: 7.1972, kind: 'shelter' },
  { id: 'p8', name: 'ศาลากลางจังหวัดสงขลา', alias: 'Songkhla City Hall ศาลากลาง', district: 'Mueang Songkhla', lng: 100.5951, lat: 7.1898, kind: 'town' },
  { id: 'p9', name: 'หาดสมิหลา', alias: 'Samila Beach สมิหลา', district: 'Mueang Songkhla', lng: 100.5975, lat: 7.2116, kind: 'town' },
  { id: 'p10', name: 'เกาะยอ', alias: 'Koh Yo เกาะยอ', district: 'Mueang Songkhla', lng: 100.542, lat: 7.163, kind: 'town' },
  { id: 'p11', name: 'โรงพยาบาลสะเดา', alias: 'Sadao Hospital', district: 'Sadao', lng: 100.422, lat: 6.639, kind: 'hospital' },
  { id: 'p12', name: 'โรงเรียนสะเดาขรรค์ชัย (ศูนย์พักพิง)', alias: 'Sadao School shelter', district: 'Sadao', lng: 100.419, lat: 6.635, kind: 'shelter' },
  { id: 'p13', name: 'ด่านศุลกากรสะเดา (ด่านนอก)', alias: 'Sadao Border Dan Nok', district: 'Sadao', lng: 100.418, lat: 6.526, kind: 'transport' },
  { id: 'p14', name: 'โรงพยาบาลระโนด', alias: 'Ranot Hospital', district: 'Ranot', lng: 100.323, lat: 7.779, kind: 'hospital' },
  { id: 'p15', name: 'เทศบาลตำบลระโนด (ศูนย์พักพิง)', alias: 'Ranot Municipality shelter', district: 'Ranot', lng: 100.321, lat: 7.775, kind: 'shelter' },
  { id: 'poi1', name: 'เซ็นทรัล หาดใหญ่ (Central Hat Yai)', alias: 'Central Festival Hat Yai เซ็นทรัล', district: 'Hat Yai', lng: 100.4819, lat: 6.9936, kind: 'market' },
  { id: 'poi2', name: 'โลตัส หาดใหญ่ (Lotus\'s)', alias: 'Lotus Hat Yai โลตัสหาดใหญ่', district: 'Hat Yai', lng: 100.4943, lat: 7.0018, kind: 'market' },
  { id: 'poi3', name: 'บิ๊กซี หาดใหญ่ (Big C)', alias: 'Big C Hat Yai บิ๊กซีหาดใหญ่', district: 'Hat Yai', lng: 100.4792, lat: 6.9965, kind: 'market' },
  { id: 'poi4', name: 'สถานีขนส่งผู้โดยสารหาดใหญ่', alias: 'Hat Yai Bus Terminal บขส', district: 'Hat Yai', lng: 100.4836, lat: 6.9927, kind: 'transport' },
];
