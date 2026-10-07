import type {
  AiRecommendation,
  EquipmentRec,
  Hazard,
  Passability,
  Priority,
  RescueNeed,
  Skill,
} from './types';

export const EQUIPMENT_CATALOG: Record<string, { label: string; unit: string }> = {
  boat: { label: 'เรือท้องแบน', unit: 'ลำ' },
  life_jacket: { label: 'เสื้อชูชีพ', unit: 'ตัว' },
  truck6: { label: 'รถทหาร 6 ล้อ', unit: 'คัน' },
  highclear: { label: 'รถยกสูง / กระบะ 4x4', unit: 'คัน' },
  swift_kit: { label: 'ชุดกู้ภัยกระแสน้ำเชี่ยว', unit: 'ชุด' },
  medic_kit: { label: 'ชุดปฐมพยาบาล + เจ้าหน้าที่การแพทย์', unit: 'ชุด' },
  stretcher: { label: 'เปลหาม', unit: 'อัน' },
  food_pack: { label: 'ข้าวกล่อง / น้ำดื่ม', unit: 'ชุด' },
  light: { label: 'ไฟส่องสว่าง / ไฟฉายคาดหัว', unit: 'ชุด' },
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'วิกฤต',
  urgent: 'เร่งด่วน',
  moderate: 'ปานกลาง',
};

export interface AnalyzeInput {
  depthCm: number;
  passability: Passability;
  needs: RescueNeed[];
  hazards: Hazard[];
  people: number;
}

/**
 * ระบบ "AI" แนะนำทรัพยากรกู้ภัยแบบ rule-based
 * ระดับน้ำ → ความสามารถในการผ่านของรถ → อุปกรณ์ + ระดับความเร่งด่วน
 * สามารถเปลี่ยนเป็นโมเดล ML / LLM ได้โดยคง input/output เดิม
 */
export function analyzeIncident(input: AnalyzeInput): AiRecommendation {
  const { depthCm: d, needs, hazards, passability } = input;
  const people = Math.max(1, input.people);
  const has = (n: RescueNeed) => needs.includes(n);
  const current = hazards.includes('strong_current');
  const outage = hazards.includes('power_outage');

  // ---------- คะแนนความเร่งด่วน ----------
  let score = d >= 100 ? 50 : d >= 60 ? 40 : d > 40 ? 28 : d >= 20 ? 15 : 5;
  if (has('medical')) score += 25;
  if (has('elderly')) score += 20;
  if (has('boat')) score += 15;
  if (has('food_water')) score += 8;
  if (has('life_jackets')) score += 8;
  if (current) score += 20;
  if (outage) score += 8;
  if (passability === 'blocked') score += 10;
  score += Math.min(10, Math.floor(people / 2));
  score = Math.min(100, score);

  let priority: Priority = score >= 70 ? 'critical' : score >= 40 ? 'urgent' : 'moderate';
  if (d >= 100 || (has('medical') && d >= 40) || (current && d >= 60) || (has('elderly') && d >= 60)) {
    priority = 'critical';
  }

  // ---------- อุปกรณ์ ----------
  const eq = new Map<string, EquipmentRec>();
  const add = (id: string, qty: number, reason: string) => {
    const cur = eq.get(id);
    if (cur) {
      cur.qty = Math.max(cur.qty, qty);
      if (!cur.reason.includes(reason)) cur.reason += ` · ${reason}`;
    } else {
      eq.set(id, { id, qty, reason });
    }
  };
  const notes: string[] = [];

  if (d >= 60) {
    add('boat', Math.ceil(people / 6) + (d >= 100 ? 1 : 0), `น้ำลึก ${d} ซม. – ลึกเกินกว่ารถทุกชนิดจะผ่านได้ ต้องใช้เรือท้องแบน`);
    add('life_jacket', people + 2, 'คนละ 1 ตัว + สำรองสำหรับเจ้าหน้าที่ 2 ตัว');
  } else if (d > 40) {
    add('truck6', people > 8 ? 2 : 1, `น้ำลึก ${d} ซม. (> 40 ซม.) – มีเพียงรถทหาร 6 ล้อหรือเรือเท่านั้นที่ผ่านได้`);
    if (has('boat')) add('boat', Math.ceil(people / 6), 'ผู้แจ้งขอเรือ');
  } else if (d >= 20) {
    add('highclear', 1, `น้ำลึก ${d} ซม. – รถกระบะ/4x4 ที่ยกสูงเข้าถึงได้`);
  }
  if (has('boat') && d < 60) add('boat', Math.ceil(people / 6), 'ผู้แจ้งขอเรือ');
  if (has('life_jackets')) add('life_jacket', people, 'ผู้แจ้งขอเสื้อชูชีพ');
  if (d >= 100) notes.push('น้ำถึงระดับหลังคา/ชั้นบน – แนะนำให้ขึ้นที่สูงและส่งสัญญาณขอความช่วยเหลือ ใช้เรือ 2 ลำและคนสังเกตการณ์ 1 คน');

  if (current) {
    add('swift_kit', 1, 'มีกระแสน้ำเชี่ยว – ต้องใช้ทีมกู้ภัยกระแสน้ำเชี่ยว');
    add('life_jacket', people + 4, 'กระแสน้ำเชี่ยว: ผู้ประสบภัยและผู้ช่วยเหลือต้องสวมชูชีพ');
    notes.push('กระแสน้ำเชี่ยว: ห้ามลุยน้ำ ใช้เรือติดเครื่องยนต์และทีมกู้ภัยกระแสน้ำเชี่ยว พร้อมเชือกและถุงโยน');
  }
  if (has('medical')) {
    add('medic_kit', 1, 'ขอความช่วยเหลือทางการแพทย์');
    notes.push(d >= 40 ? 'ต้องลำเลียงผู้ป่วยทางเรือไป รพ.กระบี่ – แจ้งหน่วยแพทย์ฉุกเฉิน (EMS)' : 'ส่งเจ้าหน้าที่การแพทย์ไปด้วยรถยกสูงได้');
  }
  if (has('elderly')) {
    add('stretcher', 1, 'มีผู้สูงอายุ/ผู้ป่วยติดเตียง');
    notes.push('มีผู้เปราะบาง: ส่งอาสาสมัครเพิ่มอย่างน้อย 2 คนสำหรับการยก และเลือกเรือ/รถที่มีทางลาด');
    if (d >= 40) add('boat', Math.ceil(people / 6), 'ลำเลียงผู้สูงอายุข้ามน้ำลึกอย่างปลอดภัย');
  }
  if (has('food_water')) add('food_pack', people * 3, 'คนละ 3 ชุด (24 ชม.)');
  if (outage) {
    add('light', 1, 'ไฟฟ้าดับ – ปฏิบัติการตอนกลางคืน');
    notes.push('ไฟฟ้าดับ: แนะนำให้ปิดเบรกเกอร์หลักและหลีกเลี่ยงการสัมผัสน้ำใกล้ไฟฟ้า');
  }

  const equipment = [...eq.values()];
  if (equipment.length === 0) notes.push('ไม่ต้องใช้อุปกรณ์กู้ภัย – เฝ้าระวังต่อและแชร์ระดับน้ำให้ผู้ขับขี่ใกล้เคียง');

  // ---------- ทักษะของทีมที่ต้องส่ง ----------
  const skills = new Set<Skill>();
  for (const r of equipment) {
    if (r.id === 'boat') skills.add('boat');
    if (r.id === 'swift_kit') skills.add('swiftwater');
    if (r.id === 'medic_kit' || r.id === 'stretcher') skills.add('medical');
    if (r.id === 'truck6' || r.id === 'highclear') skills.add('vehicle');
    if (r.id === 'food_pack' || r.id === 'light') skills.add('logistics');
  }

  // ---------- แท็ก ----------
  const tags: string[] = [PRIORITY_LABEL[priority]];
  if (eq.has('boat')) tags.push('ต้องใช้เรือ');
  if (eq.has('truck6')) tags.push('รถ 6 ล้อ');
  if (current) tags.push('กระแสน้ำเชี่ยว');
  if (has('medical')) tags.push('การแพทย์');
  if (has('elderly')) tags.push('ผู้เปราะบาง');
  if (passability === 'blocked') tags.push('ถนนถูกตัดขาด');

  const headline =
    priority === 'critical'
      ? 'แนะนำให้ส่งทีมทันที – สถานการณ์เสี่ยงต่อชีวิต'
      : priority === 'urgent'
        ? 'ควรส่งทีมภายใน 30 นาที – สถานการณ์เริ่มรุนแรง'
        : equipment.length
          ? 'จัดทีมสนับสนุน – สถานการณ์คงที่แต่ต้องการความช่วยเหลือ'
          : 'เฝ้าระวังเท่านั้น';

  return { priority, score, headline, equipment, skills: [...skills], notes, tags };
}
