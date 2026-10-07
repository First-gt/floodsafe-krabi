/**
 * ตรวจสอบรูปภาพน้ำท่วม (ฝั่งผู้ใช้)
 *
 * ขั้นตอน:
 *  1) อ่านไฟล์ + ย่อรูป (≤1024px) – ไฟล์ที่ไม่ใช่รูปจริง/เปิดไม่ได้ จะถูกปฏิเสธ
 *  2) ตรวจคุณภาพ: ความละเอียด, ความสว่าง, ความคมชัด
 *  3) ตรวจ EXIF: เวลาที่ถ่าย (ต้องเป็นเหตุการณ์ปัจจุบัน) และพิกัด GPS (ต้องใกล้จุดที่แจ้ง) – ถ้ามี
 *  4) ตรวจรูปซ้ำ (perceptual hash) เทียบกับรูปที่เคยส่งแล้วในเครื่องนี้
 *  5) ประเมินสีและพื้นผิวคล้ายผิวน้ำ (heuristic)
 *  6) ถ้าตั้งค่า GEMINI_API_KEY ฝั่งเซิร์ฟเวอร์ จะให้ AI วิชันดูรูปจริง ๆ (/api/verify-photo)
 *     และใช้ผลของ AI เป็นตัวตัดสินหลัก
 */

import { withBase } from './base-path';
import { classifyScene, type SceneResult } from './scene-classifier';

export type VerifyStatus = 'verified' | 'review' | 'rejected';

export interface PhotoCheck {
  id: string;
  label: string;
  state: 'pass' | 'warn' | 'fail' | 'info';
  detail?: string;
}

export interface AiVerdict {
  isFlood: boolean;
  confidence: number;
  estimatedDepthCm: number | null;
  description: string;
  reason: string;
}

export interface PhotoVerification {
  status: VerifyStatus;
  /** 0–100 */
  score: number;
  summary: string;
  checks: PhotoCheck[];
  hash: string;
  /** รูปที่ย่อแล้ว (data URL) ใช้ส่งต่อและแสดงผล */
  image: string;
  method: 'ai' | 'heuristic';
  ai?: AiVerdict;
  takenAt?: number;
}

export interface VerifyContext {
  /** พิกัดที่แจ้งเหตุ (null = ไม่ใช่พิกัดจริงจาก GPS จึงไม่ตรวจระยะ) */
  lat: number | null;
  lng: number | null;
  /** hash ของรูปที่เคยส่งแล้ว */
  knownHashes: string[];
}

// ---------- hash เก็บไว้ในเครื่อง ----------
const HASH_KEY = 'floodsafe.photohashes.v1';

export function loadHashes(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HASH_KEY) || '[]');
  } catch {
    return [];
  }
}
export function rememberHashes(hs: string[]) {
  try {
    const all = Array.from(new Set([...loadHashes(), ...hs])).slice(-200);
    localStorage.setItem(HASH_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

// ---------- EXIF (JPEG) ----------
interface Exif {
  takenAt?: number;
  lat?: number;
  lng?: number;
  software?: string;
}

async function readExif(file: File): Promise<Exif> {
  try {
    const buf = await file.slice(0, 262144).arrayBuffer();
    const v = new DataView(buf);
    if (v.byteLength < 12 || v.getUint16(0) !== 0xffd8) return {};
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xff00) !== 0xff00) break;
      const len = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
      if (marker === 0xffda) break;
      off += 2 + len;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function parseTiff(v: DataView, start: number): Exif {
  const little = v.getUint16(start) === 0x4949;
  const g16 = (o: number) => v.getUint16(o, little);
  const g32 = (o: number) => v.getUint32(o, little);
  const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };

  const readIfd = (ifdOff: number) => {
    const out = new Map<number, { type: number; count: number; valOff: number }>();
    const n = g16(ifdOff);
    for (let i = 0; i < n; i++) {
      const e = ifdOff + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      const type = g16(e + 2);
      const count = g32(e + 4);
      const size = (TYPE_SIZE[type] ?? 1) * count;
      out.set(g16(e), { type, count, valOff: size <= 4 ? e + 8 : start + g32(e + 8) });
    }
    return out;
  };
  const ascii = (valOff: number, count: number) => {
    let s = '';
    for (let i = 0; i < count - 1 && valOff + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(valOff + i));
    return s;
  };
  const rationals = (valOff: number, n: number) => Array.from({ length: n }, (_, i) => g32(valOff + i * 8) / (g32(valOff + i * 8 + 4) || 1));

  const result: Exif = {};
  const ifd0 = readIfd(start + g32(start + 4));
  const sw = ifd0.get(0x0131);
  if (sw) result.software = ascii(sw.valOff, sw.count);
  const exifPtr = ifd0.get(0x8769);
  if (exifPtr) {
    const exif = readIfd(start + g32(exifPtr.valOff));
    const dt = exif.get(0x9003) ?? exif.get(0x9004);
    if (dt) {
      const m = ascii(dt.valOff, dt.count).match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (m) result.takenAt = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    }
  }
  const gpsPtr = ifd0.get(0x8825);
  if (gpsPtr) {
    const gps = readIfd(start + g32(gpsPtr.valOff));
    const la = gps.get(2);
    const lo = gps.get(4);
    if (la && lo) {
      const [d1, m1, s1] = rationals(la.valOff, 3);
      const [d2, m2, s2] = rationals(lo.valOff, 3);
      let lat = d1 + m1 / 60 + s1 / 3600;
      let lng = d2 + m2 / 60 + s2 / 3600;
      const latRef = gps.get(1) ? ascii(gps.get(1)!.valOff, 2) : 'N';
      const lngRef = gps.get(3) ? ascii(gps.get(3)!.valOff, 2) : 'E';
      if (latRef === 'S') lat = -lat;
      if (lngRef === 'W') lng = -lng;
      if (isFinite(lat) && isFinite(lng) && (lat !== 0 || lng !== 0)) {
        result.lat = lat;
        result.lng = lng;
      }
    }
  }
  return result;
}

// ---------- วิเคราะห์ภาพ ----------
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}

interface Stats {
  brightness: number;
  sharpness: number;
  waterRatio: number;
  hash: string;
}

function analyse(img: HTMLImageElement): Stats {
  const W = 192;
  const H = Math.max(48, Math.round((img.naturalHeight / img.naturalWidth) * W));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const gray = new Float32Array(W * H);
  let sum = 0;
  for (let i = 0; i < W * H; i++) {
    const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    gray[i] = g;
    sum += g;
  }
  const brightness = sum / (W * H);

  // sharpness = variance of Laplacian
  let lsum = 0;
  let lsq = 0;
  let ln = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - W] - gray[i + W];
      lsum += l;
      lsq += l * l;
      ln++;
    }
  }
  const sharpness = lsq / ln - (lsum / ln) ** 2;

  // water-like colour & smooth texture (lower 55% of the frame)
  let water = 0;
  let total = 0;
  for (let y = Math.floor(H * 0.45); y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      total++;
      const [h, s, v] = rgb2hsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      const muddy = h >= 15 && h <= 55 && s >= 0.15 && s <= 0.78 && v >= 0.22 && v <= 0.88;
      const bluish = h >= 150 && h <= 255 && s >= 0.07 && s <= 0.75 && v >= 0.15 && v <= 0.92;
      if (!muddy && !bluish) continue;
      const grad = Math.abs(gray[i + 1] - gray[i]) + Math.abs(gray[i + W] - gray[i]);
      if (grad < 14) water++;
    }
  }
  const waterRatio = total ? water / total : 0;

  // average hash 8x8
  const hc = document.createElement('canvas');
  hc.width = 8;
  hc.height = 8;
  const hx = hc.getContext('2d', { willReadFrequently: true })!;
  hx.drawImage(img, 0, 0, 8, 8);
  const hd = hx.getImageData(0, 0, 8, 8).data;
  const hg: number[] = [];
  for (let i = 0; i < 64; i++) hg.push(0.299 * hd[i * 4] + 0.587 * hd[i * 4 + 1] + 0.114 * hd[i * 4 + 2]);
  const mean = hg.reduce((a, b) => a + b, 0) / 64;
  let hash = '';
  for (let i = 0; i < 64; i += 4) hash += ((hg[i] > mean ? 8 : 0) + (hg[i + 1] > mean ? 4 : 0) + (hg[i + 2] > mean ? 2 : 0) + (hg[i + 3] > mean ? 1 : 0)).toString(16);

  return { brightness, sharpness, waterRatio, hash };
}

function resize(img: HTMLImageElement, max = 1024): string {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function askAi(image: string): Promise<AiVerdict | null> {
  try {
    const res = await fetch(withBase('/api/verify-photo'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || j.configured === false || j.error || typeof j.isFlood !== 'boolean') return null;
    return {
      isFlood: j.isFlood,
      confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)),
      estimatedDepthCm: typeof j.estimatedDepthCm === 'number' ? j.estimatedDepthCm : null,
      description: String(j.description ?? ''),
      reason: String(j.reason ?? ''),
    };
  } catch {
    return null;
  }
}

const rejected = (summary: string, checks: PhotoCheck[], hash = '', image = ''): PhotoVerification => ({
  status: 'rejected',
  score: 0,
  summary,
  checks,
  hash,
  image,
  method: 'heuristic',
});

export async function verifyPhoto(file: File, ctx: VerifyContext): Promise<PhotoVerification> {
  const checks: PhotoCheck[] = [];

  if (!file.type.startsWith('image/')) {
    return rejected('ไฟล์นี้ไม่ใช่รูปภาพ', [{ id: 'type', label: 'ชนิดไฟล์', state: 'fail', detail: 'รองรับเฉพาะไฟล์รูปภาพ' }]);
  }
  if (file.size > 20 * 1024 * 1024) {
    return rejected('ไฟล์ใหญ่เกินไป (สูงสุด 20 MB)', [{ id: 'size', label: 'ขนาดไฟล์', state: 'fail' }]);
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return rejected('เปิดไฟล์ภาพนี้ไม่ได้ ลองถ่ายใหม่หรือใช้รูปแบบ JPG/PNG', [{ id: 'decode', label: 'อ่านไฟล์ภาพ', state: 'fail' }]);
  }

  const exif = file.type === 'image/jpeg' ? await readExif(file) : {};
  const st = analyse(img);
  const image = resize(img);
  let hard = false;
  let warn = false;
  let score = 0;

  // 1) ความละเอียด
  const shortSide = Math.min(img.naturalWidth, img.naturalHeight);
  if (shortSide < 320) {
    checks.push({ id: 'res', label: 'ความละเอียด', state: 'fail', detail: `${img.naturalWidth}×${img.naturalHeight} เล็กเกินไป (ต้องอย่างน้อย 320 พิกเซล)` });
    hard = true;
  } else {
    checks.push({ id: 'res', label: 'ความละเอียด', state: 'pass', detail: `${img.naturalWidth}×${img.naturalHeight}` });
    score += 5;
  }

  // 2) ความสว่าง
  if (st.brightness < 28 || st.brightness > 242) {
    checks.push({ id: 'light', label: 'ความสว่าง', state: 'fail', detail: st.brightness < 28 ? 'ภาพมืดเกินไป' : 'ภาพสว่างจ้าเกินไป' });
    hard = true;
  } else {
    checks.push({ id: 'light', label: 'ความสว่าง', state: 'pass' });
    score += 10;
  }

  // 3) ความคมชัด
  if (st.sharpness < 10) {
    checks.push({ id: 'sharp', label: 'ความคมชัด', state: 'fail', detail: 'ภาพเบลอมาก มองไม่เห็นรายละเอียด' });
    hard = true;
  } else if (st.sharpness < 35) {
    checks.push({ id: 'sharp', label: 'ความคมชัด', state: 'warn', detail: 'ภาพค่อนข้างเบลอ' });
    warn = true;
    score += 4;
  } else {
    checks.push({ id: 'sharp', label: 'ความคมชัด', state: 'pass' });
    score += 10;
  }

  // 4) รูปซ้ำ
  const dup = ctx.knownHashes.find((h) => hash_ok(h) && hamming(h, st.hash) <= 4);
  if (dup) {
    checks.push({ id: 'dup', label: 'ไม่ใช้รูปซ้ำ', state: 'fail', detail: 'รูปนี้ (หรือรูปที่คล้ายกันมาก) เคยถูกส่งมาแล้ว' });
    hard = true;
  } else {
    checks.push({ id: 'dup', label: 'ไม่ใช้รูปซ้ำ', state: 'pass' });
  }

  // 5) EXIF เวลา / พิกัด
  if (exif.takenAt) {
    const ageH = (Date.now() - exif.takenAt) / 3.6e6;
    if (ageH < -1) {
      checks.push({ id: 'time', label: 'เวลาที่ถ่าย', state: 'warn', detail: 'เวลาในรูปเป็นอนาคต (นาฬิกาเครื่องอาจผิด)' });
      warn = true;
    } else if (ageH > 24 * 7) {
      checks.push({ id: 'time', label: 'เวลาที่ถ่าย', state: 'fail', detail: `ถ่ายเมื่อ ${Math.round(ageH / 24)} วันที่แล้ว ไม่ใช่เหตุการณ์ปัจจุบัน` });
      hard = true;
    } else if (ageH > 48) {
      checks.push({ id: 'time', label: 'เวลาที่ถ่าย', state: 'warn', detail: `ถ่ายเมื่อ ${Math.round(ageH / 24)} วันที่แล้ว` });
      warn = true;
      score += 5;
    } else {
      checks.push({ id: 'time', label: 'เวลาที่ถ่าย', state: 'pass', detail: ageH < 1 ? 'ถ่ายเมื่อสักครู่' : `ถ่ายเมื่อ ${Math.round(ageH)} ชม. ที่แล้ว` });
      score += 15;
    }
  } else {
    checks.push({ id: 'time', label: 'เวลาที่ถ่าย', state: 'info', detail: 'ไม่พบข้อมูลเวลาในรูป (ถ่ายด้วยกล้องในแอปจะตรวจได้แม่นกว่า)' });
  }
  if (exif.lat !== undefined && exif.lng !== undefined && ctx.lat !== null && ctx.lng !== null) {
    const d = km(exif.lat, exif.lng, ctx.lat, ctx.lng);
    if (d > 15) {
      checks.push({ id: 'gps', label: 'พิกัดในรูป', state: 'fail', detail: `ถ่ายห่างจากจุดที่แจ้ง ${d.toFixed(0)} กม.` });
      hard = true;
    } else if (d > 3) {
      checks.push({ id: 'gps', label: 'พิกัดในรูป', state: 'warn', detail: `ห่างจากจุดที่แจ้ง ${d.toFixed(1)} กม.` });
      warn = true;
      score += 5;
    } else {
      checks.push({ id: 'gps', label: 'พิกัดในรูป', state: 'pass', detail: `อยู่ห่างจุดที่แจ้ง ${(d * 1000).toFixed(0)} ม.` });
      score += 15;
    }
  } else {
    checks.push({ id: 'gps', label: 'พิกัดในรูป', state: 'info', detail: exif.lat === undefined ? 'ไม่พบพิกัดในรูป' : 'ข้ามการตรวจ (ไม่ได้ใช้ GPS ของเครื่อง)' });
  }

  // 6) ลักษณะผิวน้ำ
  const wr = st.waterRatio;
  if (wr < 0.1) {
    checks.push({ id: 'water', label: 'ลักษณะผิวน้ำ', state: 'fail', detail: 'ไม่พบบริเวณที่มีสี/พื้นผิวคล้ายน้ำท่วมในภาพ' });
    score += 0;
  } else if (wr < 0.2) {
    checks.push({ id: 'water', label: 'ลักษณะผิวน้ำ', state: 'warn', detail: 'พบลักษณะคล้ายน้ำท่วมเพียงเล็กน้อย' });
    warn = true;
    score += Math.round((wr / 0.35) * 35);
  } else {
    checks.push({ id: 'water', label: 'ลักษณะผิวน้ำ', state: 'pass', detail: `พบบริเวณคล้ายน้ำท่วม ~${Math.round(wr * 100)}% ของภาพ` });
    score += Math.min(35, Math.round((wr / 0.35) * 35));
  }

  // 7) จำแนกฉาก (โมเดลในเครื่อง) – ปฏิเสธรูปอาหาร/สัตว์/บุคคล
  let sceneFail = false;
  let scene: SceneResult | null = null;
  if (!hard) {
    scene = await classifyScene(img);
    if (scene) {
      if (scene.unrelated >= 0.5) {
        sceneFail = true;
        checks.push({ id: 'scene', label: 'ประเภทภาพ', state: 'fail', detail: `ภาพนี้ดูเหมือนรูป${scene.unrelatedLabel} ไม่ใช่สถานที่น้ำท่วม` });
      } else if (scene.unrelated >= 0.25) {
        warn = true;
        checks.push({ id: 'scene', label: 'ประเภทภาพ', state: 'warn', detail: `ภาพมีลักษณะคล้ายรูป${scene.unrelatedLabel}` });
      } else if (scene.water >= 0.12) {
        checks.push({ id: 'scene', label: 'ประเภทภาพ', state: 'pass', detail: 'เป็นภาพสถานที่กลางแจ้งที่มีน้ำ' });
        score += 15;
      } else {
        checks.push({ id: 'scene', label: 'ประเภทภาพ', state: 'info', detail: 'เป็นภาพสถานที่/วัตถุทั่วไป' });
        score += 5;
      }
    } else {
      checks.push({ id: 'scene', label: 'ประเภทภาพ', state: 'info', detail: 'ข้ามการจำแนกภาพ (โหลดโมเดลไม่สำเร็จ)' });
    }
  }
  if (sceneFail) hard = true;

  // 8) AI วิชัน (ถ้าตั้งค่า GEMINI_API_KEY ไว้)
  let ai: AiVerdict | null = null;
  if (!hard) ai = await askAi(image);

  let status: VerifyStatus;
  let summary: string;
  let method: PhotoVerification['method'] = 'heuristic';

  if (hard) {
    status = 'rejected';
    summary = (checks.find((c) => c.id === 'scene' && c.state === 'fail') ?? checks.find((c) => c.state === 'fail'))?.detail ?? 'รูปไม่ผ่านการตรวจสอบ';
  } else if (ai) {
    method = 'ai';
    score = Math.round((ai.isFlood ? ai.confidence : (1 - ai.confidence) * 0.3) * 100);
    checks.push({
      id: 'ai',
      label: 'AI ตรวจภาพ',
      state: ai.isFlood ? (ai.confidence >= 0.6 ? 'pass' : 'warn') : 'fail',
      detail: ai.description || ai.reason,
    });
    if (ai.estimatedDepthCm != null) checks.push({ id: 'aidepth', label: 'ระดับน้ำที่ AI ประเมินจากภาพ', state: 'info', detail: `≈ ${Math.round(ai.estimatedDepthCm)} ซม.` });
    if (ai.isFlood && ai.confidence >= 0.6) {
      status = warn ? 'review' : 'verified';
      summary = warn ? 'AI ยืนยันว่าเป็นภาพน้ำท่วม แต่มีข้อสังเกตบางข้อ รอเจ้าหน้าที่ตรวจซ้ำ' : 'AI ยืนยันว่าเป็นภาพน้ำท่วมจริง';
    } else if (!ai.isFlood && ai.confidence >= 0.5) {
      status = 'rejected';
      summary = `AI ตรวจแล้วไม่ใช่ภาพน้ำท่วม: ${ai.reason || ai.description}`;
    } else {
      status = 'review';
      summary = 'AI ไม่แน่ใจ รอเจ้าหน้าที่ตรวจสอบรูปนี้';
    }
  } else {
    // ไม่มี AI วิชัน: ตรวจเบื้องต้นยืนยันเต็มที่ไม่ได้ → อย่างมากคือ "รอเจ้าหน้าที่ยืนยัน"
    score = Math.max(0, Math.min(90, score));
    if (wr < 0.1) {
      status = 'rejected';
      summary = 'ไม่พบลักษณะของน้ำท่วมในภาพ กรุณาถ่ายให้เห็นระดับน้ำและพื้นที่โดยรอบ';
    } else if (score >= 35) {
      status = 'review';
      summary = 'ผ่านการตรวจเบื้องต้น รอเจ้าหน้าที่ยืนยันอีกครั้ง';
    } else {
      status = 'rejected';
      summary = 'ภาพไม่ชัดเจนพอที่จะยืนยันว่าเป็นน้ำท่วม กรุณาถ่ายใหม่';
    }
  }

  return { status, score, summary, checks, hash: st.hash, image, method, ai: ai ?? undefined, takenAt: exif.takenAt };
}

const hash_ok = (h: string) => typeof h === 'string' && h.length === 16;
