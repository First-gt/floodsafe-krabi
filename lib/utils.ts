import type { Passability, Priority, VehicleMode } from './types';

export function cn(...a: (string | false | null | undefined)[]): string {
  return a.filter(Boolean).join(' ');
}

export type DepthLevel = 'safe' | 'caution' | 'danger';

/** < 20 ซม. เขียว · 20–40 ซม. เหลืองอำพัน · > 40 ซม. แดง */
export function depthLevel(cm: number): DepthLevel {
  if (cm < 20) return 'safe';
  if (cm <= 40) return 'caution';
  return 'danger';
}

export const DEPTH_COLORS: Record<DepthLevel, string> = {
  safe: '#22c55e',
  caution: '#f59e0b',
  danger: '#ef4444',
};

export const DEPTH_META: Record<DepthLevel, { label: string; range: string; vehicle: string }> = {
  safe: { label: 'ผ่านได้', range: '< 20 ซม.', vehicle: 'รถเก๋ง/รถยนต์ทั่วไปผ่านได้' },
  caution: { label: 'เฉพาะรถยกสูง', range: '20 – 40 ซม.', vehicle: 'กระบะ / 4x4 / SUV เท่านั้น' },
  danger: { label: 'ผ่านไม่ได้', range: '> 40 ซม.', vehicle: 'ถนนขาด – ใช้รถทหาร 6 ล้อหรือเรือเท่านั้น' },
};

export function isPassable(depthCm: number, mode: VehicleMode): boolean {
  return mode === 'car' ? depthCm < 20 : depthCm <= 40;
}

export function passabilityFromDepth(cm: number): Passability {
  const l = depthLevel(cm);
  return l === 'safe' ? 'passable' : l === 'caution' ? 'pickup_only' : 'blocked';
}

export const PRIORITY_META: Record<Priority, { label: string; color: string; cls: string }> = {
  critical: { label: 'วิกฤต', color: '#ef4444', cls: 'bg-danger/15 text-red-300 border-danger/50' },
  urgent: { label: 'เร่งด่วน', color: '#facc15', cls: 'bg-safety/15 text-yellow-300 border-safety/50' },
  moderate: { label: 'ปานกลาง', color: '#38bdf8', cls: 'bg-sky-400/15 text-sky-300 border-sky-400/50' },
};

export const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, urgent: 1, moderate: 2 };

export function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'เมื่อสักครู่';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ชม.ที่แล้ว`;
  return `${Math.round(h / 24)} วันที่แล้ว`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
