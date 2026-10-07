import { EQUIPMENT_CATALOG, PRIORITY_LABEL } from './ai-engine';
import type { Agency } from './agencies';
import { DISTRICT_TH, NEED_LABEL, PASSABILITY_LABEL } from './labels';
import type { Incident } from './types';

export function mapLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** ข้อความสรุปเคสสำหรับส่งต่อให้หน่วยงาน (อ่านง่ายใน LINE/SMS/อีเมล) */
export function buildCaseSummary(inc: Incident, agency?: Agency): string {
  const rec = inc.recommendation;
  const lines: string[] = [];
  if (agency) lines.push(`ถึง: ${agency.name}`);
  lines.push(`🆘 แจ้งเหตุน้ำท่วม จ.กระบี่ [${PRIORITY_LABEL[rec.priority]}]`);
  lines.push(`📍 ${inc.locationName} อ.${DISTRICT_TH[inc.district]}`);
  lines.push(`🗺 ${mapLink(inc.lat, inc.lng)}`);
  lines.push(`💧 ระดับน้ำ ${Math.round(inc.depthCm)} ซม. · รถ: ${PASSABILITY_LABEL[inc.passability]}`);
  lines.push(`👥 ผู้ประสบภัย ${inc.people} คน`);
  if (inc.needs.length) lines.push(`🆘 ต้องการ: ${inc.needs.map((n) => NEED_LABEL[n]).join(', ')}`);
  const hz: string[] = [];
  if (inc.hazards.includes('strong_current')) hz.push('กระแสน้ำเชี่ยว');
  if (inc.hazards.includes('power_outage')) hz.push('ไฟฟ้าดับ');
  if (hz.length) lines.push(`⚠️ อันตราย: ${hz.join(', ')}`);
  if (rec.equipment.length) {
    lines.push(`🧰 AI แนะนำอุปกรณ์: ${rec.equipment.map((e) => `${EQUIPMENT_CATALOG[e.id]?.label ?? e.id} ×${e.qty}`).join(', ')}`);
  }
  lines.push(`👤 ผู้แจ้ง: ${inc.reporter}${inc.phone ? ` โทร ${inc.phone}` : ''}`);
  if (inc.note) lines.push(`📝 ${inc.note}`);
  const photoOk = inc.photoReviews?.filter((r) => r.status === 'verified').length ?? 0;
  if (inc.photos.length) lines.push(`📷 แนบรูป ${inc.photos.length} รูป (ผ่านตรวจสอบ ${photoOk})`);
  lines.push(`🕒 ${new Date(inc.createdAt).toLocaleString('th-TH')}`);
  lines.push(`รหัสเคส: ${inc.id} · ส่งผ่าน FloodSafe กระบี่`);
  return lines.join('\n');
}

export const lineShareUrl = (text: string) => `https://line.me/R/share?text=${encodeURIComponent(text)}`;
export const smsUrl = (phone: string, text: string) => `sms:${phone}?body=${encodeURIComponent(text)}`;
export const mailtoUrl = (subject: string, text: string) =>
  `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
