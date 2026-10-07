import { PLACE_META } from '@/lib/place-meta';
import { cn, DEPTH_COLORS, DEPTH_META, type DepthLevel } from '@/lib/utils';

export function DepthLegend({ className, compact, full }: { className?: string; compact?: boolean; full?: boolean }) {
  const levels: DepthLevel[] = ['safe', 'caution', 'danger'];
  return (
    <div className={cn('glass rounded-2xl p-3', className)} role="group" aria-label="คำอธิบายระดับน้ำ">
      <p className="mb-2 text-[11px] font-semibold tracking-wider text-slate-400">ระดับน้ำ</p>
      <ul className="space-y-2">
        {levels.map((l) => (
          <li key={l} className="flex items-start gap-2.5">
            <span
              className="mt-0.5 grid h-6 min-w-[4.6rem] place-items-center rounded-full px-2 text-[11px] font-bold text-navy-950"
              style={{ background: DEPTH_COLORS[l] }}
            >
              {DEPTH_META[l].range}
            </span>
            <span className="text-xs leading-snug">
              <span className="font-semibold text-slate-100">{DEPTH_META[l].label}</span>
              {!compact && <span className="block text-slate-400">{DEPTH_META[l].vehicle}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-ocean-300 bg-sky-500/40" /> พื้นที่น้ำท่วมจากดาวเทียม
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-0 w-4 border-t-2 border-dashed border-danger" /> เส้นทางสั้นสุดที่ไม่ปลอดภัย
        </span>
      </div>
      {full && (
        <>
          <p className="mb-1.5 mt-3 border-t border-white/10 pt-2 text-[11px] font-semibold tracking-wider text-slate-400">สัญลักษณ์บนแผนที่</p>
          <ul className="grid grid-cols-1 gap-1.5 text-xs text-slate-200">
            <li className="flex items-center gap-2">
              <span className="grid h-5 min-w-[2.2rem] place-items-center rounded-full bg-safe px-1.5 text-[10px] font-bold text-navy-950">12</span>
              จุดวัดระดับน้ำ (ตัวเลข = ซม.) แตะดูรายละเอียด
            </li>
            {(Object.keys(PLACE_META) as (keyof typeof PLACE_META)[])
              .filter((k) => k !== 'town')
              .map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-white"
                    style={{ background: PLACE_META[k].color }}
                    dangerouslySetInnerHTML={{ __html: PLACE_META[k].icon.replace(/13/g, '11') }}
                  />
                  {PLACE_META[k].label} (แตะเพื่อนำทาง)
                </li>
              ))}
            <li className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-sky-400/30">
                <i className="h-2.5 w-2.5 rounded-full border-2 border-white bg-sky-400" />
              </span>
              ตำแหน่งของคุณ
            </li>
            <li className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded bg-cyan-400 text-[10px] font-bold text-navy-950">A</span>
              <span className="grid h-5 w-5 place-items-center rounded bg-safety text-[10px] font-bold text-navy-950">B</span>
              จุดเริ่มต้น / ปลายทาง
            </li>
            <li className="flex items-center gap-2">
              <i className="inline-block h-1.5 w-6 rounded bg-cyan-400" /> เส้นทางที่ AI เลือก (สีเหลือง = ไม่ปลอดภัย)
            </li>
          </ul>
          <p className="mt-3 rounded-lg bg-safety/10 p-2 text-[11px] leading-snug text-yellow-200">
            <b>ที่มาข้อมูล:</b> แผนที่และถนนเป็นข้อมูลจริง (OpenStreetMap) · ตำแหน่งของคุณมาจาก GPS จริงของเครื่อง · ส่วนระดับน้ำ พื้นที่น้ำท่วม และเหตุฉุกเฉิน
            <b> เป็นข้อมูลจำลองสำหรับสาธิต</b> จนกว่าจะเชื่อมกับข้อมูลจริง
          </p>
        </>
      )}
    </div>
  );
}
