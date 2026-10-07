import type { LngLat } from './geo';

export type District = 'Mueang Krabi' | 'Ao Luek' | 'Plai Phraya' | 'Khlong Thom';

export type VehicleMode = 'car' | 'pickup';
export type Passability = 'passable' | 'pickup_only' | 'blocked';
export type RescueNeed = 'boat' | 'life_jackets' | 'medical' | 'elderly' | 'food_water';
export type Hazard = 'strong_current' | 'power_outage';
export type Priority = 'critical' | 'urgent' | 'moderate';
export type IncidentStatus = 'pending' | 'dispatched' | 'rescued';
export type Skill = 'boat' | 'swiftwater' | 'medical' | 'vehicle' | 'logistics';

export interface Checkpoint {
  id: string;
  name: string;
  district: District;
  lng: number;
  lat: number;
  depthCm: number;
  source: 'citizen' | 'volunteer' | 'sensor';
  updatedAt: number;
}

export interface FloodZone {
  type: 'Feature';
  properties: { name: string; district: District; severity: 'moderate' | 'high'; source: string };
  geometry: { type: 'Polygon'; coordinates: LngLat[][] };
}

export interface EquipmentRec {
  id: string;
  qty: number;
  reason: string;
}

export interface AiRecommendation {
  priority: Priority;
  score: number;
  headline: string;
  equipment: EquipmentRec[];
  skills: Skill[];
  notes: string[];
  tags: string[];
}

export interface Incident {
  id: string;
  reporter: string;
  phone?: string;
  locationName: string;
  district: District;
  lng: number;
  lat: number;
  depthCm: number;
  passability: Passability;
  needs: RescueNeed[];
  hazards: Hazard[];
  people: number;
  note?: string;
  photos: string[];
  photoReviews?: PhotoReview[];
  createdAt: number;
  status: IncidentStatus;
  recommendation: AiRecommendation;
  assignedTeamIds: string[];
  assignedEquipment: Record<string, number>;
  dispatchedAt?: number;
  rescuedAt?: number;
  /** การส่งต่อเคสไปยังหน่วยงานภายนอก */
  referrals?: Referral[];
}

export interface Team {
  id: string;
  name: string;
  base: string;
  lng: number;
  lat: number;
  members: number;
  skills: Skill[];
  status: 'available' | 'busy';
}

export interface EquipmentStock {
  id: string;
  total: number;
  available: number;
}

export interface Place {
  id: string;
  name: string;
  alias: string;
  district: District;
  lng: number;
  lat: number;
  kind: 'hospital' | 'shelter' | 'town' | 'transport' | 'market';
}

/** ผลตรวจรูปถ่ายที่แนบมากับรายงาน */
export interface PhotoReview {
  status: 'verified' | 'review' | 'rejected';
  score: number;
  summary: string;
  method: 'ai' | 'heuristic';
}

export interface ReportInput {
  lng: number;
  lat: number;
  locationName?: string;
  depthCm: number;
  passability: Passability;
  needs: RescueNeed[];
  hazards: Hazard[];
  people: number;
  note?: string;
  photos: string[];
  photoReviews?: PhotoReview[];
  reporter: string;
  phone?: string;
}

export type ReferralChannel = 'call' | 'line' | 'sms' | 'email' | 'copy' | 'system';
export type ReferralStatus = 'sent' | 'acknowledged' | 'on_the_way' | 'done';

/** บันทึกการส่งต่อเคสให้หน่วยงานภายนอก + สถานะติดตาม */
export interface Referral {
  id: string;
  agencyId: string;
  channel: ReferralChannel;
  status: ReferralStatus;
  at: number;
  updatedAt: number;
}
