'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Brain, CheckCircle2, GraduationCap, Lock, MapPin, Navigation, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TourStepId = 'intro' | 'report' | 'route' | 'dashboard' | 'ready';

interface Props {
  active: boolean;
  onStepChange: (step: TourStepId) => void;
  onFinish: () => void;
}

const STEPS: {
  id: TourStepId;
  title: string;
  subtitle: string;
  body: string;
  logic: string;
  icon: typeof GraduationCap;
}[] = [
  {
    id: 'intro',
    title: '1. ภาพรวมระบบ FloodSafe สงขลา',
    subtitle: 'ยินดีต้อนรับคณะกรรมการ ม.อ.',
    body: 'ระบบนี้ออกแบบให้แยกผู้ใช้ 2 กลุ่มชัดเจนบนหน้าจอแรก: (1) ผู้ประสบภัยที่ติดอยู่ในพื้นที่น้ำท่วม และ (2) ผู้ขับขี่ที่กำลังเดินทางผ่านพื้นที่เสี่ยง',
    logic: 'สถาปัตยกรรม: ข้อมูลจากระบบแจ้งเหตุ (ระบบที่ 1) จะถูกส่งเข้า Store แบบเรียลไทม์ เพื่อใช้คำนวณเส้นทางหลบน้ำ (ระบบที่ 2) และจัดคิวกู้ภัย (/dashboard)',
    icon: GraduationCap,
  },
  {
    id: 'report',
    title: '2. ระบบแจ้งน้ำท่วม & ตรวจรูปถ่าย',
    subtitle: 'กำลังจำลองรายงานเหตุจริงลงบนแผนที่หาดใหญ่…',
    body: 'สังเกตบนแผนที่: เมื่อประชาชนส่งพิกัดและรูปถ่าย ระบบจะสร้างจุดวัดระดับน้ำ (ซม.) และเคสขอความช่วยเหลือขึ้นทันที',
    logic: 'Logic ตรวจรูป: ใช้ MobileNetV2 (TensorFlow.js) + EXIF + Perceptual Hash คัดกรองรูปปลอม/รูปซ้ำในเครื่อง และส่งต่อ Gemini Vision เพื่อประเมินความลึกน้ำ',
    icon: ShieldAlert,
  },
  {
    id: 'route',
    title: '3. ระบบเช็กเส้นทางหนีน้ำตามรถ',
    subtitle: 'กำลังจำลองเส้นทางรถเก๋งไป รพ.สงขลานครินทร์ (ม.อ.)…',
    body: 'ระบบจะรับประเภทรถ (เช่น รถเก๋ง ลุยน้ำได้ ≤ 19 ซม.) แล้ววาดเส้นทางที่ปลอดภัยที่สุดบนแผนที่ให้อัตโนมัติ',
    logic: 'Logic นำทาง: ดึงถนนจริงหลายตัวเลือกจาก OSRM มาตัดจุดที่มีระดับน้ำสูงกว่ารถลุยได้ (เส้นประแดง) แล้วคำนวณทางอ้อม หรือสลับใช้กราฟถนนสำรองเมื่อออฟไลน์',
    icon: Navigation,
  },
  {
    id: 'dashboard',
    title: '4. ศูนย์กู้ภัย & AI จัดสรรทรัพยากร',
    subtitle: 'กำลังเติมข้อมูลจำลองทั้งจังหวัดสงขลา…',
    body: 'เจ้าหน้าที่กู้ภัยสามารถเปิดแท็บ "ศูนย์กู้ภัย" ด้านบนเพื่อดูเคสเร่งด่วน ส่งทีมอาสาที่ใกล้ที่สุด และติดตามสถานะการช่วยเหลือ',
    logic: 'Logic กู้ภัย: ฟังก์ชัน analyzeIncident() คำนวณคะแนนความเร่งด่วน (0–100) จากความลึกน้ำ, ผู้ป่วย/ผู้สูงอายุ, กระแสน้ำเชี่ยว และแนะนำเรือ/อุปกรณ์ตามสต็อกจริง',
    icon: Brain,
  },
  {
    id: 'ready',
    title: '5. พร้อมให้คณะกรรมการทดสอบระบบ',
    subtitle: 'สาธิตครบทุกขั้นตอนแล้ว',
    body: 'กดปุ่มด้านล่างเพื่อเข้าสู่หน้าหลัก ท่านสามารถทดลองกด "แจ้งน้ำท่วม", "เช็กเส้นทางหนีน้ำ" หรือสลับไปหน้า "ศูนย์กู้ภัย" ได้ทันที',
    logic: 'หมายเหตุ: ข้อมูลทั้งหมดในโหมดสาธิตนี้ทำงานบนเบราว์เซอร์แบบเรียลไทม์ สามารถทดสอบส่งเคสและจัดส่งทีมได้จริงโดยไม่กระทบข้อมูลภายนอก',
    icon: CheckCircle2,
  },
];

const READ_LOCK_SEC = 0;

export function CommitteeTour({ active, onStepChange, onFinish }: Props) {
  const [idx, setIdx] = useState(0);

  // รีเซ็ตเมื่อเปิดโหมดสอนใหม่
  useEffect(() => {
    if (!active) return;
    setIdx(0);
  }, [active]);

  // แจ้ง parent ทุกครั้งที่เปลี่ยนขั้น เพื่อสร้างข้อมูลจำลองสดบนแผนที่
  useEffect(() => {
    if (!active) return;
    onStepChange(STEPS[idx].id);
  }, [active, idx, onStepChange]);

  if (!active) return null;

  const step = STEPS[idx];
  const Icon = step.icon;
  const isLast = idx === STEPS.length - 1;

  return (
    <aside
      className="fixed bottom-4 right-4 z-50 w-[min(400px,calc(100vw-2rem))] animate-fade rounded-3xl border border-ocean-400/50 bg-navy-900/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl"
      role="dialog"
      aria-label="คู่มือแนะนำการใช้งานสำหรับคณะกรรมการ"
    >
      {/* แถบความคืบหน้า (กดข้ามไม่ได้) */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ocean-500/15 px-2.5 py-1 text-[11px] font-semibold text-ocean-300">
          <Lock size={11} /> โหมดสาธิตคณะกรรมการ ม.อ. ({idx + 1}/{STEPS.length})
        </span>
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={cn('h-1.5 w-5 rounded-full transition-colors', i <= idx ? 'bg-ocean-400' : 'bg-white/15')}
            />
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-ocean-500/20 text-ocean-300">
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white">{step.title}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-ocean-300">
            <MapPin size={11} className="shrink-0" /> {step.subtitle}
          </p>
        </div>
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-slate-200">{step.body}</p>

      <div className="mt-2.5 rounded-2xl border border-white/10 bg-navy-950/70 p-2.5 text-[11px] leading-relaxed text-slate-300">
        {step.logic}
      </div>

      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => {
            if (isLast) {
              onFinish();
            } else {
              setIdx((i) => i + 1);
            }
          }}
          className="btn-primary w-full justify-center text-sm"
        >
          {isLast ? (
            <>
              <CheckCircle2 size={16} /> เริ่มใช้งานระบบจริง
            </>
          ) : (
            <>
              ขั้นตอนถัดไป <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
