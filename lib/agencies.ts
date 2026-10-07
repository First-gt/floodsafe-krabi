import type { District, Incident, Skill } from './types';

export type AgencyKind = 'government' | 'medical' | 'police' | 'local' | 'foundation' | 'volunteer';

export interface Agency {
  id: string;
  name: string;
  kind: AgencyKind;
  /** เบอร์โทร (ไม่มี = ยังไม่ได้ตั้งค่า) */
  phone?: string;
  /** true = สายด่วนระดับประเทศที่เป็นเบอร์จริง */
  hotline: boolean;
  /** true = รายการตัวอย่าง ต้องแก้เบอร์/ชื่อเป็นของจริงก่อนใช้งาน */
  mock?: boolean;
  coverage: 'all' | District[];
  skills: Skill[];
  hours: string;
  desc: string;
}

export const AGENCY_KIND_LABEL: Record<AgencyKind, string> = {
  government: 'หน่วยงานรัฐ',
  medical: 'การแพทย์ฉุกเฉิน',
  police: 'ตำรวจ',
  local: 'ท้องถิ่น',
  foundation: 'มูลนิธิกู้ภัย',
  volunteer: 'อาสาสมัคร',
};

/**
 * ไดเรกทอรีหน่วยงานช่วยเหลือ
 * - hotline: true  = สายด่วนระดับประเทศ (เบอร์จริง)
 * - mock: true     = หน่วยตัวอย่างระดับพื้นที่ — ใส่ชื่อ/เบอร์จริงของกระบี่ที่นี่ก่อนใช้งานจริง
 */
export const AGENCIES: Agency[] = [
  {
    id: 'ddpm-1784',
    name: 'สายด่วนนิรภัย กรมป้องกันและบรรเทาสาธารณภัย (ปภ.)',
    kind: 'government',
    phone: '1784',
    hotline: true,
    coverage: 'all',
    skills: ['boat', 'swiftwater', 'vehicle', 'logistics'],
    hours: '24 ชม.',
    desc: 'แจ้งเหตุอุทกภัย/สาธารณภัย ประสานทีมช่วยเหลือและศูนย์พักพิง',
  },
  {
    id: 'niems-1669',
    name: 'สถาบันการแพทย์ฉุกเฉินแห่งชาติ (สพฉ.)',
    kind: 'medical',
    phone: '1669',
    hotline: true,
    coverage: 'all',
    skills: ['medical'],
    hours: '24 ชม.',
    desc: 'เจ็บป่วยฉุกเฉิน ผู้สูงอายุ/ผู้ป่วยติดเตียง ต้องการรถพยาบาลหรือทีมแพทย์',
  },
  {
    id: 'police-191',
    name: 'ตำรวจ แจ้งเหตุด่วนเหตุร้าย',
    kind: 'police',
    phone: '191',
    hotline: true,
    coverage: 'all',
    skills: ['vehicle', 'logistics'],
    hours: '24 ชม.',
    desc: 'แจ้งเหตุด่วน ปิดเส้นทาง อพยพ และรักษาความปลอดภัย',
  },
  {
    id: 'tourist-police-1155',
    name: 'ตำรวจท่องเที่ยว',
    kind: 'police',
    phone: '1155',
    hotline: true,
    coverage: 'all',
    skills: ['logistics'],
    hours: '24 ชม.',
    desc: 'นักท่องเที่ยวที่ติดอยู่ในพื้นที่น้ำท่วม (รองรับหลายภาษา)',
  },
  {
    id: 'local-ddpm-krabi',
    name: 'ศูนย์ ปภ. จังหวัดกระบี่ (ตัวอย่าง)',
    kind: 'government',
    hotline: false,
    mock: true,
    coverage: 'all',
    skills: ['boat', 'vehicle', 'logistics'],
    hours: '24 ชม.',
    desc: 'ศูนย์ประสานงานระดับจังหวัด — ใส่เบอร์จริงใน lib/agencies.ts',
  },
  {
    id: 'local-tao-aoluek',
    name: 'อปท./กู้ภัย อ.อ่าวลึก (ตัวอย่าง)',
    kind: 'local',
    hotline: false,
    mock: true,
    coverage: ['Ao Luek'],
    skills: ['boat', 'vehicle'],
    hours: '24 ชม.',
    desc: 'ทีมท้องถิ่นพื้นที่อ่าวลึก — ใส่เบอร์จริงใน lib/agencies.ts',
  },
  {
    id: 'local-tao-mueang',
    name: 'อปท./กู้ภัย อ.เมืองกระบี่ (ตัวอย่าง)',
    kind: 'local',
    hotline: false,
    mock: true,
    coverage: ['Mueang Krabi'],
    skills: ['boat', 'vehicle', 'medical'],
    hours: '24 ชม.',
    desc: 'ทีมท้องถิ่นพื้นที่เมืองกระบี่ — ใส่เบอร์จริงใน lib/agencies.ts',
  },
  {
    id: 'foundation-krabi',
    name: 'มูลนิธิกู้ภัยท้องถิ่น (ตัวอย่าง)',
    kind: 'foundation',
    hotline: false,
    mock: true,
    coverage: 'all',
    skills: ['medical', 'vehicle', 'boat'],
    hours: '24 ชม.',
    desc: 'มูลนิธิกู้ภัยในพื้นที่ — ใส่ชื่อ/เบอร์จริงใน lib/agencies.ts',
  },
  {
    id: 'volunteer-boats',
    name: 'อาสาสมัครเรือท้องถิ่น (ตัวอย่าง)',
    kind: 'volunteer',
    hotline: false,
    mock: true,
    coverage: ['Plai Phraya', 'Khlong Thom', 'Ao Luek'],
    skills: ['boat', 'swiftwater'],
    hours: 'ตามที่ตกลง',
    desc: 'กลุ่มอาสาเรือท้องแบน/เรือหางยาว — ใส่ช่องทางติดต่อจริงใน lib/agencies.ts',
  },
];

export const HOTLINES = AGENCIES.filter((a) => a.hotline);

export function getAgency(id: string): Agency | undefined {
  return AGENCIES.find((a) => a.id === id);
}

export interface AgencyMatch {
  agency: Agency;
  score: number;
  reasons: string[];
}

/** จัดอันดับหน่วยงานที่เหมาะกับเคส: ทักษะที่ AI แนะนำ + พื้นที่ + ความเร่งด่วน */
export function rankAgencies(inc: Incident): AgencyMatch[] {
  const need = inc.recommendation.skills;
  const critical = inc.recommendation.priority === 'critical';
  return AGENCIES.map((agency) => {
    const reasons: string[] = [];
    let score = 0;
    const hit = agency.skills.filter((s) => need.includes(s));
    if (hit.length) {
      score += hit.length * 20;
      reasons.push('ทักษะตรงกับที่ AI แนะนำ');
    }
    if (agency.coverage !== 'all' && agency.coverage.includes(inc.district)) {
      score += 25;
      reasons.push('ดูแลพื้นที่นี้');
    }
    if (agency.coverage !== 'all' && !agency.coverage.includes(inc.district)) score -= 40;
    if (agency.hotline) score += 10;
    if (critical && (agency.id === 'ddpm-1784' || agency.id === 'niems-1669')) {
      score += 15;
      reasons.push('เคสวิกฤต ควรแจ้งสายด่วนทันที');
    }
    if ((inc.needs.includes('medical') || inc.needs.includes('elderly')) && agency.skills.includes('medical')) {
      score += 20;
      reasons.push('มีผู้ป่วย/ผู้สูงอายุ');
    }
    if (agency.id === 'tourist-police-1155') score -= 25;
    return { agency, score, reasons };
  })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}
