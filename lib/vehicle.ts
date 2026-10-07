export type VehicleType = 'motorcycle' | 'sedan' | 'suv' | 'pickup' | 'pickup4x4' | 'truck6';

export interface VehicleProfile {
  type: VehicleType;
  /** ยี่ห้อ/รุ่น (พิมพ์เอง) */
  model: string;
  /** ระดับน้ำสูงสุด (ซม.) ที่รถคันนี้ผ่านได้อย่างปลอดภัย */
  maxDepthCm: number;
}

export const VEHICLE_PRESETS: Record<VehicleType, { label: string; sub: string; maxDepthCm: number; example: string }> = {
  motorcycle: { label: 'มอเตอร์ไซค์', sub: 'ผ่านน้ำได้ไม่เกิน 10 ซม.', maxDepthCm: 10, example: 'Wave, Click, PCX' },
  sedan: { label: 'รถเก๋ง / อีโคคาร์', sub: 'ผ่านน้ำได้ไม่เกิน 19 ซม.', maxDepthCm: 19, example: 'Vios, City, Civic, Yaris' },
  suv: { label: 'SUV / ครอสโอเวอร์', sub: 'ผ่านน้ำได้ไม่เกิน 30 ซม.', maxDepthCm: 30, example: 'Fortuner, CR-V, HR-V' },
  pickup: { label: 'รถกระบะ', sub: 'ผ่านน้ำได้ไม่เกิน 35 ซม.', maxDepthCm: 35, example: 'Hilux, D-Max, Triton' },
  pickup4x4: { label: 'กระบะยกสูง / 4x4', sub: 'ผ่านน้ำได้ไม่เกิน 40 ซม.', maxDepthCm: 40, example: 'Revo 4x4, Ranger Raptor' },
  truck6: { label: 'รถบรรทุก / รถทหาร 6 ล้อ', sub: 'ผ่านน้ำได้ไม่เกิน 80 ซม.', maxDepthCm: 80, example: 'รถ 6 ล้อ, รถกู้ภัยสูง' },
};

export const defaultProfile = (type: VehicleType, model = ''): VehicleProfile => ({
  type,
  model,
  maxDepthCm: VEHICLE_PRESETS[type].maxDepthCm,
});

const KEYWORDS: [VehicleType, string[]][] = [
  ['truck6', ['6 ล้อ', '6ล้อ', 'หกล้อ', 'รถบรรทุก', 'ทหาร', 'truck', 'isuzu forward', 'hino']],
  ['pickup4x4', ['4x4', '4wd', 'ยกสูง', 'ยกสูง', 'raptor', 'wildtrak', 'rocco 4x4']],
  ['motorcycle', ['มอเตอร์ไซค์', 'มอไซค์', 'มอไซ', 'จักรยานยนต์', 'wave', 'click', 'scoopy', 'pcx', 'nmax', 'aerox', 'forza', 'fino', 'mio', 'fazzio', 'giorno', 'msx', 'cb150', 'cbr', 'ninja', 'bigbike', 'big bike']],
  ['pickup', ['กระบะ', 'hilux', 'revo', 'vigo', 'd-max', 'dmax', 'triton', 'navara', 'ranger', 'colorado', 'bt-50', 'bt50', 'pickup', 'pick-up']],
  ['suv', ['suv', 'fortuner', 'pajero', 'cr-v', 'crv', 'hr-v', 'hrv', 'cx-5', 'cx5', 'cx-3', 'cx3', 'cx-30', 'mu-x', 'mux', 'everest', 'corolla cross', 'yaris cross', 'xpander', 'ecosport', 'kicks', 'br-v', 'brv', 'rush', 'wr-v', 'seltos', 'sportage', 'x-trail', 'xtrail', 'zs', 'hs', 'cross', 'ครอสโอเวอร์', 'เอสยูวี']],
  ['sedan', ['เก๋ง', 'อีโคคาร์', 'vios', 'yaris', 'city', 'civic', 'accord', 'altis', 'camry', 'almera', 'march', 'attrage', 'mirage', 'swift', 'jazz', 'brio', 'ativ', 'sunny', 'mazda2', 'mazda 2', 'mazda3', 'mazda 3', 'sedan', 'hatchback', 'mg5', 'mg 5', 'seal', 'atto']],
];

/** AI ช่วยเดาประเภทรถจากชื่อรุ่นที่ผู้ใช้พิมพ์ */
export function detectVehicleType(model: string): VehicleType | null {
  const m = model.toLowerCase().trim();
  if (m.length < 2) return null;
  for (const [type, words] of KEYWORDS) {
    if (words.some((w) => m.includes(w))) return type;
  }
  return null;
}

const KEY = 'floodsafe.vehicle.v1';

export function loadVehicle(): VehicleProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as VehicleProfile;
    if (v && v.type in VEHICLE_PRESETS && typeof v.maxDepthCm === 'number') return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveVehicle(v: VehicleProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
