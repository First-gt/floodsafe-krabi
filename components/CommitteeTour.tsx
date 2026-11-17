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
  demoChips?: { label: string; tone: 'danger' | 'caution' | 'safe' | 'ocean' }[];
  logic: string;
  icon: typeof GraduationCap;
}[] = [
  {
    id: 'intro',
    title: '1. ภาพรวมระบบ FloodSafe สงขลา',
    subtitle: 'แนะนำการใช้งานสำหรับคณะกรรมการ ม.อ.',
    body: 'หน้าแรกแยก 2 ปุ่มใหญ่ชัดเจน: (1) "แจ้งน้ำท่วม" สำหรับคนที่อยู่ในจุดน้ำท่วม และ (2) "เช็กเส้นทางหนีน้ำ" สำหรับคนที่กำลังขับรถผ่าน',
    logic: 'หลักการทำงาน: ข้อมูลจากคนแจ้งน้ำท่วม (ระบบที่ 1) จะถูกส่งไปใช้คำนวณเส้นทางหลบน้ำ (ระบบที่ 2) และจัดคิวกู้ภัย (/dashboard) อัตโนมัติ',
    icon: GraduationCap,
  },
  {
    id: 'report',
    title: '2. ระบบแจ้งน้ำท่วม (จำลองเหตุการณ์สด)',
    subtitle: 'กำลังปักหมุดระดับน้ำ 3 จุดในหาดใหญ่บนแผนที่…',
    body: 'ดูบนแผนที่: เมื่อมีคนแจ้งเหตุ ระบบจะปักหมุดระดับน้ำ (ซม.) และส่งเคสเข้าศูนย์กู้ภัยทันที',
    demoChips: [
      { label: 'คลองแห 52 ซม. (รถเก๋งผ่านไม่ได้)', tone: 'danger' },
      { label: 'วงเวียนน้ำพุ 42 ซม. (ระวัง)', tone: 'caution' },
      { label: 'แยกคอหงส์ 18 ซม. (ผ่านได้)', tone: 'safe' },
    ],
    logic: 'ระบบตรวจรูปถ่าย: ใช้ AI ในเบราว์เซอร์ (MobileNetV2) + EXIF + ตรวจรูปซ้ำ เพื่อกันรูปปลอมก่อนบันทึกจริง',
    icon: ShieldAlert,
  },
  {
    id: 'route',
    title: '3. ระบบเช็กเส้นทางหนีน้ำ + เสียงนำทาง',
    subtitle: 'กำลังจำลอง: รถเก๋ง → รพ.สงขลานครินทร์ (ม.อ.)',
    body: 'ระบบเทียบรุ่นรถ (รถเก๋งลุยน้ำได้ ≤ 19 ซม.) กับจุดน้ำท่วมในขั้นที่ 2 แล้ววาดทางที่ปลอดภัยให้ พร้อมเสียงพูดนำทางภาษาไทย',
    demoChips: [
      { label: 'เส้นสีฟ้า = ทางที่รถเก๋งผ่านได้', tone: 'ocean' },
      { label: 'เส้นประแดง = ทางที่น้ำท่วมเกินรถ (ระบบหลบให้)', tone: 'danger' },
    ],
    logic: 'หลักการคำนวณ: ดึงถนนจริงจาก OSRM มาคัดจุดน้ำท่วมออก หากทุกทางหลักท่วมจะคำนวณทางอ้อม หรือสลับใช้แผนที่สำรองเมื่อออฟไลน์',
    icon: Navigation,
  },
  {
    id: 'dashboard',
    title: '4. ศูนย์กู้ภัย & AI จัดทีมช่วยเหลือ',
    subtitle: 'เติมข้อมูลจำลองครบ 4 อำเภอในสงขลาแล้ว',
    body: 'เจ้าหน้าที่กู้ภัยสามารถกดแท็บ "ศูนย์กู้ภัย" ด้านบน เพื่อดูเคสเร่งด่วน เลือกทีมที่ใกล้ที่สุด และติดตามสถานะจนช่วยเหลือเสร็จ',
    logic: 'หลักการจัดลำดับ: ระบบให้คะแนนความเร่งด่วน (0–100) จากระดับน้ำ, ผู้สูงอายุ/ผู้ป่วย, กระแสน้ำเชี่ยว และแนะนำอุปกรณ์ตามสต็อกที่มี',
    icon: Brain,
  },
  {
    id: 'ready',
    title: '5. พร้อมให้ทดลองใช้งานจริง',
    subtitle: 'จบการสาธิตแล้ว (แสดงเพียงครั้งเดียว)',
    body: 'กดปุ่มด้านล่างเพื่อปลดล็อกเมนูทั้งหมด ท่านสามารถลองกด "แจ้งน้ำท่วม", "เช็กเส้นทางหนีน้ำ" (พร้อมเสียงนำทาง) หรือดูหน้า "ศูนย์กู้ภัย" ได้เลยครับ',
    logic: 'ข้อมูลทั้งหมดทำงานบนเบราว์เซอร์แบบเรียลไทม์ ทดลองกดได้เต็มที่โดยไม่กระทบระบบภายนอก',
    icon: CheckCircle2,
  },
];

const CHIP_TONE = {
  danger: 'bg-danger/15 text-red-300 border-danger/30',
  caution: 'bg-safety/15 text-yellow-200 border-safety/30',
  safe: 'bg-safe/15 text-green-300 border-safe/30',
  ocean: 'bg-ocean-500/15 text-ocean-200 border-ocean-400/30',
} as const;

export function CommitteeTour({ active, onStepChange, onFinish }: Props) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!active) return;
    setIdx(0);
  }, [active]);

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
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ocean-500/15 px-2.5 py-1 text-[11px] font-semibold text-ocean-300">
          <Lock size={11} /> สาธิตสำหรับกรรมการ ม.อ. ({idx + 1}/{STEPS.length})
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

      {step.demoChips && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {step.demoChips.map((c) => (
            <span key={c.label} className={cn('rounded-lg border px-2 py-1 text-[11px] font-medium', CHIP_TONE[c.tone])}>
              {c.label}
            </span>
          ))}
        </div>
      )}

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
