import type { Place } from './types';

const svg = (d: string) =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

/** สัญลักษณ์สถานที่สำคัญบนแผนที่ (ใช้ทั้งบนแผนที่และในคำอธิบายสัญลักษณ์) */
export const PLACE_META: Record<Place['kind'], { label: string; color: string; icon: string }> = {
  hospital: { label: 'โรงพยาบาล', color: '#ef4444', icon: svg('<path d="M12 5v14M5 12h14"/>') },
  shelter: { label: 'ศูนย์พักพิง', color: '#16a34a', icon: svg('<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>') },
  town: { label: 'ย่านชุมชน', color: '#475569', icon: svg('<circle cx="12" cy="12" r="3"/>') },
  transport: { label: 'ท่าเรือ / สนามบิน', color: '#7c3aed', icon: svg('<path d="M12 3v14"/><path d="M5 12a7 7 0 0 0 14 0"/>') },
  market: { label: 'ตลาด', color: '#d97706', icon: svg('<path d="M4 7h16l-1 5H5z"/><path d="M6 12v8h12v-8"/>') },
};
