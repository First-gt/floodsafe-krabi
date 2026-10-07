import type { District, Passability, RescueNeed, Skill } from './types';

export const DISTRICT_TH: Record<District, string> = {
  'Mueang Krabi': 'เมืองกระบี่',
  'Ao Luek': 'อ่าวลึก',
  'Plai Phraya': 'พลายพระยา',
  'Khlong Thom': 'คลองท่อม',
};

export const SKILL_LABEL: Record<Skill, string> = {
  boat: 'เรือ',
  swiftwater: 'กระแสน้ำเชี่ยว',
  medical: 'การแพทย์',
  vehicle: 'ยานพาหนะ',
  logistics: 'ส่งกำลังบำรุง',
};

export const NEED_LABEL: Record<RescueNeed, string> = {
  boat: 'เรือยาง',
  life_jackets: 'เสื้อชูชีพ',
  medical: 'การแพทย์',
  elderly: 'ผู้สูงอายุ/ติดเตียง',
  food_water: 'อาหาร/น้ำดื่ม',
};

export const SOURCE_LABEL = {
  citizen: 'ประชาชนรายงาน',
  volunteer: 'อาสาสมัครรายงาน',
  sensor: 'เซนเซอร์',
} as const;

export const STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  dispatched: 'ส่งทีมแล้ว',
  rescued: 'ช่วยเหลือแล้ว',
} as const;

export const PASSABILITY_LABEL: Record<Passability, string> = {
  passable: 'ผ่านได้',
  pickup_only: 'กระบะเท่านั้น',
  blocked: 'ผ่านไม่ได้',
};
