'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock, Handshake, MapPin, Minus, Plus, Send, ShieldCheck, Timer, Undo2, Users } from 'lucide-react';
import { EQUIPMENT_CATALOG } from '@/lib/ai-engine';
import { autoSelectTeams, suggestTeams } from '@/lib/dispatch';
import { DISTRICT_TH, NEED_LABEL, SKILL_LABEL, STATUS_LABEL } from '@/lib/labels';
import { useFloodStore } from '@/lib/store';
import type { Incident, IncidentStatus } from '@/lib/types';
import { DEPTH_COLORS, PRIORITY_META, cn, depthLevel } from '@/lib/utils';
import { AiRecommendationCard } from './AiRecommendationCard';
import { EQUIPMENT_ICONS, FALLBACK_ICON } from './equipment-icons';
import { PriorityBadge } from './PriorityBadge';
import { REFERRAL_STATUS_LABEL, REFERRAL_STATUS_STYLE, ReferralPanel, referralAgencyName } from './ReferralPanel';
import { TimeAgo } from './TimeAgo';

const STATUS_STYLE: Record<IncidentStatus, string> = {
  pending: 'bg-safety/15 text-yellow-300',
  dispatched: 'bg-sky-400/15 text-sky-300',
  rescued: 'bg-safe/15 text-green-300',
};

interface Props {
  incident: Incident;
  selected: boolean;
  onSelect: () => void;
  onViewMap: () => void;
}

export function IncidentCard({ incident: inc, selected, onSelect, onViewMap }: Props) {
  const color = PRIORITY_META[inc.recommendation.priority].color;
  return (
    <article
      className={cn('rounded-2xl border transition', selected ? 'border-ocean-400/60 bg-white/[0.07]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]')}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <button className="w-full p-3.5 text-left" onClick={onSelect} aria-expanded={selected}>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <PriorityBadge priority={inc.recommendation.priority} />
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLE[inc.status])}>{STATUS_LABEL[inc.status]}</span>
          <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
            <Clock size={11} /> <TimeAgo ts={inc.createdAt} />
          </span>
        </div>
        <p className="text-sm font-semibold text-white">{inc.locationName}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DEPTH_COLORS[depthLevel(inc.depthCm)] }} />
            {inc.depthCm} ซม.
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} /> {inc.people} คน
          </span>
          <span>อ.{DISTRICT_TH[inc.district]}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {inc.needs.map((n) => (
            <span key={n} className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-300">
              {NEED_LABEL[n]}
            </span>
          ))}
          {inc.hazards.includes('strong_current') && <span className="rounded-md bg-danger/20 px-1.5 py-0.5 text-[11px] text-red-300">กระแสน้ำเชี่ยว</span>}
          {inc.hazards.includes('power_outage') && <span className="rounded-md bg-safety/20 px-1.5 py-0.5 text-[11px] text-yellow-300">ไฟฟ้าดับ</span>}
        </div>
      </button>

      {selected && <Details incident={inc} onViewMap={onViewMap} />}
    </article>
  );
}

function Details({ incident: inc, onViewMap }: { incident: Incident; onViewMap: () => void }) {
  const { teams, markRescued, reopen } = useFloodStore();
  const [refOpen, setRefOpen] = useState(false);
  const assigned = teams.filter((t) => inc.assignedTeamIds.includes(t.id));

  return (
    <div className="space-y-3 border-t border-white/10 p-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>
          ผู้แจ้ง: <b className="text-slate-200">{inc.reporter}</b>
        </span>
        {inc.phone && (
          <span>
            โทร: <b className="text-slate-200">{inc.phone}</b>
          </span>
        )}
        <button className="ml-auto flex min-h-[36px] items-center gap-1 text-ocean-300 hover:underline" onClick={onViewMap}>
          <MapPin size={13} /> ดูบนแผนที่
        </button>
      </div>
      {inc.note && <p className="rounded-xl bg-white/[0.04] p-2.5 text-sm italic text-slate-300">“{inc.note}”</p>}
      {inc.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {inc.photos.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="ภาพจากที่เกิดเหตุ" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
          ))}
        </div>
      )}
      {inc.photoReviews && inc.photoReviews.length > 0 && (
        <div className="space-y-1">
          {inc.photoReviews.map((r, i) => (
            <p
              key={i}
              className={cn(
                'flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs',
                r.status === 'verified' ? 'bg-safe/10 text-green-300' : 'bg-safety/10 text-yellow-300',
              )}
            >
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              <span>
                <b>รูปที่ {i + 1}: {r.status === 'verified' ? 'ตรวจสอบแล้ว' : 'รอเจ้าหน้าที่ยืนยัน'}</b> ({r.score}%{r.method === 'ai' ? ' · AI วิชัน' : ' · ตรวจเบื้องต้น'}) – {r.summary}
              </span>
            </p>
          ))}
        </div>
      )}

      <AiRecommendationCard rec={inc.recommendation} />

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center gap-2">
          <p className="mr-auto flex items-center gap-2 text-sm font-semibold text-white">
            <Handshake size={16} className="text-ocean-300" /> ส่งต่อหน่วยงานภายนอก
          </p>
          <button className="btn-ghost !min-h-[40px] !text-xs" onClick={() => setRefOpen(true)}>
            <Send size={14} /> {(inc.referrals ?? []).length ? 'จัดการ' : 'เลือกหน่วยงาน'}
          </button>
        </div>
        {(inc.referrals ?? []).length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {(inc.referrals ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-slate-300">{referralAgencyName(r.agencyId)}</span>
                <span className={cn('rounded-full px-2 py-0.5 font-semibold', REFERRAL_STATUS_STYLE[r.status])}>{REFERRAL_STATUS_LABEL[r.status]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-500">ยังไม่ได้ส่งต่อ — เลือกหน่วยงานที่เหมาะกับเคสนี้ (ปภ. 1784 / การแพทย์ฉุกเฉิน 1669 / มูลนิธิ / อาสา)</p>
        )}
      </div>
      {refOpen && <ReferralPanel incidentId={inc.id} onClose={() => setRefOpen(false)} />}

      {inc.status === 'pending' && <DispatchPanel key={inc.id} incident={inc} />}

      {inc.status !== 'pending' && (
        <div className="rounded-2xl border border-white/10 bg-navy-950/50 p-3 text-sm">
          <p className="mb-2 flex items-center gap-2 font-semibold text-white">
            {inc.status === 'dispatched' ? <Timer size={16} className="text-sky-300" /> : <Check size={16} className="text-safe" />}
            {inc.status === 'dispatched' ? 'ส่งทีมแล้ว' : 'ช่วยเหลือสำเร็จ'}
            {inc.dispatchedAt && (
              <span className="ml-auto text-xs font-normal text-slate-500">
                <TimeAgo ts={inc.status === 'rescued' && inc.rescuedAt ? inc.rescuedAt : inc.dispatchedAt} />
              </span>
            )}
          </p>
          {assigned.length > 0 && (
            <ul className="mb-2 space-y-1 text-xs text-slate-300">
              {assigned.map((t) => (
                <li key={t.id}>
                  • {t.name} <span className="text-slate-500">({t.members} คน)</span>
                </li>
              ))}
            </ul>
          )}
          {Object.keys(inc.assignedEquipment).length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {Object.entries(inc.assignedEquipment).map(([id, q]) => (
                <span key={id} className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">
                  {EQUIPMENT_CATALOG[id]?.label ?? id} ×{q}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            {inc.status === 'dispatched' && (
              <button className="btn-primary flex-1" onClick={() => markRescued(inc.id)}>
                <Check size={16} /> ช่วยเหลือสำเร็จ
              </button>
            )}
            <button className="btn-ghost flex-1" onClick={() => reopen(inc.id)}>
              <Undo2 size={16} /> {inc.status === 'dispatched' ? 'ยกเลิกการส่งทีม' : 'เปิดเคสใหม่'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DispatchPanel({ incident: inc }: { incident: Incident }) {
  const { teams, equipment, dispatchIncident } = useFloodStore();
  const suggestions = useMemo(() => suggestTeams(inc, teams), [inc, teams]);
  const [picked, setPicked] = useState<string[]>(() => autoSelectTeams(suggestTeams(inc, teams), inc.recommendation.skills));
  const stock = (id: string) => equipment.find((e) => e.id === id)?.available ?? 0;
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(inc.recommendation.equipment.map((r) => [r.id, Math.min(r.qty, equipment.find((e) => e.id === r.id)?.available ?? 0)])),
  );

  const shortage = inc.recommendation.equipment.filter((r) => stock(r.id) < r.qty);

  return (
    <div className="rounded-2xl border border-ocean-400/30 bg-ocean-500/[0.06] p-3">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
        <Send size={15} className="text-ocean-300" /> มอบหมายอาสาสมัครและอุปกรณ์
      </h4>

      <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400">ทีมกู้ภัย · เรียงตามความเหมาะสมและระยะทาง</p>
      <ul className="mb-3 space-y-1.5">
        {suggestions.slice(0, 5).map((s) => {
          const busy = s.team.status === 'busy';
          const on = picked.includes(s.team.id);
          return (
            <li key={s.team.id}>
              <label
                className={cn(
                  'flex min-h-[52px] items-center gap-3 rounded-xl border px-3 py-1.5 transition',
                  busy ? 'cursor-not-allowed border-white/5 opacity-40' : 'cursor-pointer',
                  on ? 'border-ocean-400 bg-ocean-500/15' : 'border-white/10 bg-white/[0.03] hover:bg-white/10',
                )}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-cyan-400"
                  disabled={busy}
                  checked={on}
                  onChange={() => setPicked(on ? picked.filter((x) => x !== s.team.id) : [...picked, s.team.id])}
                />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm text-slate-100">{s.team.name}</span>
                  <span className="block text-[11px] text-slate-400">
                    {s.team.members} คน · {s.distKm.toFixed(1)} กม. · ถึงใน ~{s.etaMin} นาที {busy && '· ไม่ว่าง'}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {s.team.skills.map((k) => (
                    <span
                      key={k}
                      className={cn('rounded px-1 text-[10px]', inc.recommendation.skills.includes(k) ? 'bg-safe/20 text-green-300' : 'bg-white/10 text-slate-500')}
                    >
                      {SKILL_LABEL[k]}
                    </span>
                  ))}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {inc.recommendation.equipment.length > 0 && (
        <>
          <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400">อุปกรณ์ (ตามสต็อกที่มี)</p>
          <ul className="mb-3 space-y-1.5">
            {inc.recommendation.equipment.map((r) => {
              const Icon = EQUIPMENT_ICONS[r.id] ?? FALLBACK_ICON;
              const max = stock(r.id);
              const v = qty[r.id] ?? 0;
              return (
                <li key={r.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5">
                  <Icon size={16} className="shrink-0 text-ocean-300" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-xs text-slate-100">{EQUIPMENT_CATALOG[r.id]?.label}</span>
                    <span className="text-[10px] text-slate-500">
                      ต้องการ {r.qty} · คงเหลือ {max}
                    </span>
                  </span>
                  <button className="btn-ghost !min-h-[40px] !min-w-[40px] !px-0" onClick={() => setQty({ ...qty, [r.id]: Math.max(0, v - 1) })} aria-label="ลด">
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-white">{v}</span>
                  <button className="btn-ghost !min-h-[40px] !min-w-[40px] !px-0" onClick={() => setQty({ ...qty, [r.id]: Math.min(max, v + 1) })} aria-label="เพิ่ม" disabled={v >= max}>
                    <Plus size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {shortage.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-safety/10 p-2.5 text-xs text-yellow-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          อุปกรณ์ไม่เพียงพอ: {shortage.map((s) => EQUIPMENT_CATALOG[s.id]?.label).join(', ')} – ขอสนับสนุนจากอำเภอใกล้เคียง
        </p>
      )}

      <button
        className="btn-primary w-full !min-h-[52px] text-base"
        disabled={picked.length === 0}
        onClick={() => dispatchIncident(inc.id, picked, Object.fromEntries(Object.entries(qty).filter(([, q]) => q > 0)))}
      >
        <Send size={18} /> ส่งทีมออกปฏิบัติการ {picked.length > 0 ? `(${picked.length} ทีม)` : ''}
      </button>
    </div>
  );
}
