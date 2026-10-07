'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Mail, MessageCircle, Phone, Send, ShieldCheck, X } from 'lucide-react';
import { AGENCY_KIND_LABEL, getAgency, rankAgencies, type Agency } from '@/lib/agencies';
import { buildCaseSummary, lineShareUrl, mailtoUrl } from '@/lib/case-summary';
import { withBase } from '@/lib/base-path';
import { useFloodStore } from '@/lib/store';
import type { ReferralChannel, ReferralStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PriorityBadge } from './PriorityBadge';

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  sent: 'ส่งต่อแล้ว',
  acknowledged: 'หน่วยงานรับเรื่องแล้ว',
  on_the_way: 'กำลังเดินทางไปช่วย',
  done: 'ดำเนินการเสร็จสิ้น',
};

export const REFERRAL_STATUS_STYLE: Record<ReferralStatus, string> = {
  sent: 'bg-safety/15 text-yellow-300',
  acknowledged: 'bg-sky-400/15 text-sky-300',
  on_the_way: 'bg-ocean-500/20 text-ocean-300',
  done: 'bg-safe/15 text-green-300',
};

const CHANNEL_LABEL: Record<ReferralChannel, string> = {
  call: 'โทร',
  line: 'LINE',
  sms: 'SMS',
  email: 'อีเมล',
  copy: 'คัดลอก',
  system: 'ส่งผ่านระบบ',
};

interface Props {
  incidentId: string;
  onClose: () => void;
}

/** หน้าต่าง "ส่งต่อเคสให้หน่วยงาน" — เว็บเป็นสื่อกลาง: จับคู่หน่วยงาน + ช่องทางติดต่อ + ติดตามสถานะ */
export function ReferralPanel({ incidentId, onClose }: Props) {
  const { incidents, addReferral, setReferralStatus } = useFloodStore();
  const inc = incidents.find((i) => i.id === incidentId);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [channels, setChannels] = useState<{ webhook: boolean; email: boolean } | null>(null);

  useEffect(() => {
    fetch(withBase('/api/forward'))
      .then((r) => r.json())
      .then(setChannels)
      .catch(() => setChannels({ webhook: false, email: false }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ranked = useMemo(() => (inc ? rankAgencies(inc) : []), [inc]);
  if (!inc) return null;

  const generic = buildCaseSummary(inc);
  const autoOn = Boolean(channels?.webhook || channels?.email);

  const log = (agency: Agency, channel: ReferralChannel) => {
    if (!(inc.referrals ?? []).some((r) => r.agencyId === agency.id)) addReferral(inc.id, agency.id, channel);
  };

  const copy = async (agency: Agency | null) => {
    const text = buildCaseSummary(inc, agency ?? undefined);
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ ok: true, text: 'คัดลอกข้อความสรุปเคสแล้ว นำไปวางในแชท/อีเมลได้เลย' });
      if (agency) log(agency, 'copy');
    } catch {
      setMsg({ ok: false, text: 'คัดลอกอัตโนมัติไม่ได้ กรุณากดค้างที่ข้อความแล้วคัดลอกเอง' });
    }
  };

  const forward = async (agency: Agency) => {
    setBusy(agency.id);
    setMsg(null);
    try {
      const r = await fetch(withBase('/api/forward'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: buildCaseSummary(inc, agency), incidentId: inc.id, agency: agency.name }),
      });
      const j = (await r.json()) as { ok: boolean; configured?: boolean; error?: string; sent?: string[] };
      if (j.ok) {
        log(agency, 'system');
        setMsg({ ok: true, text: `ส่งเคสไปยังศูนย์ประสานงานแล้ว (${(j.sent ?? []).join(', ')})` });
      } else if (j.configured === false) {
        setMsg({ ok: false, text: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าช่องทางส่งอัตโนมัติ — ใช้โทร / LINE / คัดลอกข้อความแทน (ดูวิธีตั้งค่าใน README)' });
      } else {
        setMsg({ ok: false, text: j.error ?? 'ส่งไม่สำเร็จ กรุณาลองช่องทางอื่น' });
      }
    } catch {
      setMsg({ ok: false, text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองช่องทางอื่น' });
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="ส่งต่อเคสให้หน่วยงาน">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="ปิด" />
      <div className="glass relative flex max-h-[92dvh] w-full max-w-xl animate-sheet-up flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
        <header className="flex items-center gap-3 p-4">
          <div className="mr-auto leading-tight">
            <h2 className="text-base font-semibold text-white">ส่งต่อเคสให้หน่วยงานช่วยเหลือ</h2>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
              <PriorityBadge priority={inc.recommendation.priority} /> {inc.locationName}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost !min-h-[44px] !min-w-[44px] !px-0" aria-label="ปิด">
            <X size={20} />
          </button>
        </header>

        <div className="space-y-3 overflow-y-auto px-4 pb-5">
          <p className="rounded-xl bg-white/[0.04] p-2.5 text-xs text-slate-300">
            เว็บนี้เป็นสื่อกลาง: สรุปเคสให้พร้อมพิกัดและสิ่งที่ต้องการ แล้วคุณเลือกช่องทางติดต่อหน่วยงานที่เหมาะสม
            <b className="text-white"> เคสวิกฤตให้โทรสายด่วนก่อนเสมอ</b>
          </p>

          <details className="rounded-xl border border-white/10 bg-navy-950/50">
            <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm text-slate-200">ดูข้อความสรุปเคสที่จะส่ง</summary>
            <pre className="select-all whitespace-pre-wrap break-words px-3 pb-3 font-sans text-xs leading-relaxed text-slate-300">{generic}</pre>
            <div className="flex gap-2 px-3 pb-3">
              <button className="btn-ghost flex-1 !text-xs" onClick={() => copy(null)}>
                <Copy size={14} /> คัดลอก
              </button>
              <a className="btn-ghost flex-1 !text-xs" href={lineShareUrl(generic)} target="_blank" rel="noreferrer">
                <MessageCircle size={14} /> แชร์ LINE
              </a>
            </div>
          </details>

          {msg && (
            <p className={cn('flex items-start gap-2 rounded-xl p-2.5 text-xs', msg.ok ? 'bg-safe/10 text-green-300' : 'bg-safety/10 text-yellow-200')} role="status">
              {msg.ok ? <Check size={14} className="mt-0.5 shrink-0" /> : <ShieldCheck size={14} className="mt-0.5 shrink-0" />}
              {msg.text}
            </p>
          )}

          <p className="text-[11px] font-semibold tracking-wider text-slate-400">หน่วยงานที่แนะนำ · เรียงตามความเหมาะสมกับเคสนี้</p>
          <ul className="space-y-2.5">
            {ranked.map(({ agency, reasons }) => {
              const mine = (inc.referrals ?? []).filter((r) => r.agencyId === agency.id);
              const summary = buildCaseSummary(inc, agency);
              return (
                <li key={agency.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="mr-auto text-sm font-semibold text-white">{agency.name}</p>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">{AGENCY_KIND_LABEL[agency.kind]}</span>
                    {agency.hotline && <span className="rounded-full bg-safe/15 px-2 py-0.5 text-[10px] text-green-300">สายด่วนจริง</span>}
                    {agency.mock && <span className="rounded-full bg-safety/15 px-2 py-0.5 text-[10px] text-yellow-300">ตัวอย่าง</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{agency.desc}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {agency.hours}
                    {reasons.length > 0 && ` · ${reasons.join(' · ')}`}
                  </p>

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {agency.phone ? (
                      <a
                        className="btn-primary flex-1 !text-xs"
                        href={`tel:${agency.phone}`}
                        onClick={() => log(agency, 'call')}
                        aria-label={`โทร ${agency.phone}`}
                      >
                        <Phone size={14} /> โทร {agency.phone}
                      </a>
                    ) : (
                      <span className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-dashed border-white/15 px-2 text-center text-[11px] text-slate-500">
                        ยังไม่ได้ตั้งเบอร์ (แก้ใน lib/agencies.ts)
                      </span>
                    )}
                    <a className="btn-ghost flex-1 !text-xs" href={lineShareUrl(summary)} target="_blank" rel="noreferrer" onClick={() => log(agency, 'line')}>
                      <MessageCircle size={14} /> LINE
                    </a>
                    <a className="btn-ghost flex-1 !text-xs" href={mailtoUrl(`แจ้งเหตุน้ำท่วม ${inc.locationName}`, summary)} onClick={() => log(agency, 'email')}>
                      <Mail size={14} /> อีเมล
                    </a>
                    <button className="btn-ghost flex-1 !text-xs" onClick={() => copy(agency)}>
                      <Copy size={14} /> คัดลอก
                    </button>
                    <button
                      className="btn-ghost w-full !text-xs"
                      disabled={busy === agency.id || channels === null || !autoOn}
                      onClick={() => forward(agency)}
                      title={autoOn ? undefined : 'ยังไม่ได้ตั้งค่า FORWARD_WEBHOOK_URL หรือ RESEND_API_KEY บนเซิร์ฟเวอร์'}
                    >
                      <Send size={14} /> {busy === agency.id ? 'กำลังส่ง…' : autoOn ? 'ส่งผ่านระบบถึงศูนย์ประสานงาน' : 'ส่งผ่านระบบ (ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์)'}
                    </button>
                  </div>

                  {mine.map((r) => (
                    <div key={r.id} className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-navy-950/60 px-2.5 py-2 text-xs">
                      <span className={cn('rounded-full px-2 py-0.5 font-semibold', REFERRAL_STATUS_STYLE[r.status])}>{REFERRAL_STATUS_LABEL[r.status]}</span>
                      <span className="text-slate-500">ผ่าน {CHANNEL_LABEL[r.channel]}</span>
                      <label className="ml-auto flex items-center gap-1.5 text-slate-400">
                        อัปเดตสถานะ
                        <select
                          className="field !min-h-[36px] !w-auto !px-2 !py-0 text-xs"
                          value={r.status}
                          onChange={(e) => setReferralStatus(inc.id, r.id, e.target.value as ReferralStatus)}
                        >
                          {(Object.keys(REFERRAL_STATUS_LABEL) as ReferralStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {REFERRAL_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] leading-relaxed text-slate-500">
            หมายเหตุ: การกดโทร/LINE/อีเมลเป็นการเปิดแอปในเครื่องของคุณ ระบบจึงไม่ทราบว่าหน่วยงานรับเรื่องแล้วหรือยัง — ให้อัปเดตสถานะเองหลังติดต่อ
            รายการที่ติดป้าย &quot;ตัวอย่าง&quot; ยังไม่ใช่หน่วยงานจริง ต้องใส่ข้อมูลจริงก่อนใช้งาน
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function referralAgencyName(agencyId: string): string {
  return getAgency(agencyId)?.name ?? agencyId;
}
