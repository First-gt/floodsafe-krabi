'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bike, Car, CarFront, Check, Container, Mountain, Sparkles, Truck, X, type LucideIcon } from 'lucide-react';
import { VEHICLE_PRESETS, defaultProfile, detectVehicleType, type VehicleProfile, type VehicleType } from '@/lib/vehicle';
import { cn } from '@/lib/utils';

const ICONS: Record<VehicleType, LucideIcon> = {
  motorcycle: Bike,
  sedan: Car,
  suv: CarFront,
  pickup: Truck,
  pickup4x4: Mountain,
  truck6: Container,
};

interface Props {
  open: boolean;
  /** บังคับกรอกก่อนใช้งาน (ยังไม่เคยตั้งค่ารถ) – ปิดโดยไม่บันทึกไม่ได้ */
  required: boolean;
  initial: VehicleProfile | null;
  onSave: (v: VehicleProfile) => void;
  onClose: () => void;
}

export function VehicleSetup({ open, required, initial, onSave, onClose }: Props) {
  const [type, setType] = useState<VehicleType | null>(null);
  const [model, setModel] = useState('');
  const [maxDepth, setMaxDepth] = useState(19);
  const [touchedDepth, setTouchedDepth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(initial?.type ?? null);
    setModel(initial?.model ?? '');
    setMaxDepth(initial?.maxDepthCm ?? 19);
    setTouchedDepth(!!initial);
    setError(null);
  }, [open, initial]);

  const guess = useMemo(() => detectVehicleType(model), [model]);

  const pick = (t: VehicleType) => {
    setType(t);
    setError(null);
    if (!touchedDepth) setMaxDepth(VEHICLE_PRESETS[t].maxDepthCm);
  };

  if (!open) return null;

  const submit = () => {
    if (!type) {
      setError('กรุณาเลือกประเภทรถของคุณ');
      return;
    }
    if (!model.trim()) {
      setError('กรุณาระบุยี่ห้อ/รุ่นรถ เช่น Toyota Vios, Isuzu D-Max');
      return;
    }
    onSave({ type, model: model.trim(), maxDepthCm: maxDepth });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="ข้อมูลรถของคุณ">
      <div className="glass flex max-h-[94dvh] w-full max-w-lg animate-fade flex-col rounded-t-3xl !bg-navy-900/95 sm:rounded-3xl">
        <div className="flex items-center gap-3 px-5 pb-2 pt-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ocean-500/15 text-ocean-300">
            <Car size={20} />
          </span>
          <div className="mr-auto leading-tight">
            <h2 className="text-base font-semibold text-white">ข้อมูลรถของคุณ</h2>
            <p className="text-xs text-slate-400">AI ใช้เลือกถนนที่รถคันนี้ลุยน้ำผ่านได้</p>
          </div>
          {!required && (
            <button className="grid h-10 w-10 place-items-center rounded-full text-slate-400 hover:bg-white/10" onClick={onClose} aria-label="ปิด">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto px-5 pb-4 pt-2">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400">ประเภทรถ *</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ประเภทรถ">
              {(Object.keys(VEHICLE_PRESETS) as VehicleType[]).map((t) => {
                const Icon = ICONS[t];
                const v = VEHICLE_PRESETS[t];
                const on = type === t;
                return (
                  <button
                    key={t}
                    role="radio"
                    aria-checked={on}
                    onClick={() => pick(t)}
                    className={cn(
                      'flex min-h-[64px] items-center gap-2.5 rounded-xl border px-3 text-left transition',
                      on ? 'border-ocean-400 bg-ocean-500/20 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10',
                    )}
                  >
                    <Icon size={22} className="shrink-0" />
                    <span className="min-w-0 leading-tight">
                      <span className="block text-[13px] font-semibold">{v.label}</span>
                      <span className="block text-[11px] text-slate-400">ลุยน้ำ ~{v.maxDepthCm} ซม.</span>
                    </span>
                    {on && <Check size={16} className="ml-auto shrink-0 text-ocean-300" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="veh-model" className="mb-1.5 block text-[11px] font-semibold tracking-wider text-slate-400">
              ยี่ห้อ / รุ่นรถ *
            </label>
            <input
              id="veh-model"
              className="field"
              placeholder="เช่น Toyota Vios, Isuzu D-Max, Honda Wave"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setError(null);
              }}
            />
            {guess && guess !== type && (
              <button
                className="mt-2 flex min-h-[40px] w-full items-center gap-2 rounded-xl bg-safety/10 px-3 text-left text-xs text-safety"
                onClick={() => pick(guess)}
              >
                <Sparkles size={14} className="shrink-0" />
                <span>
                  AI คาดว่าเป็น <b>{VEHICLE_PRESETS[guess].label}</b> – แตะเพื่อใช้ประเภทนี้
                </span>
              </button>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="veh-depth" className="text-[11px] font-semibold tracking-wider text-slate-400">
                ระดับน้ำสูงสุดที่รถลุยได้
              </label>
              <span className="text-lg font-bold text-ocean-300">{maxDepth} ซม.</span>
            </div>
            <input
              id="veh-depth"
              type="range"
              min={5}
              max={90}
              step={1}
              value={maxDepth}
              onChange={(e) => {
                setMaxDepth(Number(e.target.value));
                setTouchedDepth(true);
              }}
              className="w-full accent-cyan-400"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              ค่าเริ่มต้นตามประเภทรถ ปรับได้ตามความสูงใต้ท้องรถ/ท่อไอเสียของคุณ AI จะไม่พาผ่านจุดที่น้ำสูงกว่าค่านี้
            </p>
          </div>

          {error && (
            <p className="rounded-xl bg-danger/10 p-2.5 text-xs text-red-300" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-white/10 p-4">
          <button className="btn-primary w-full" onClick={submit}>
            <Check size={18} /> บันทึกข้อมูลรถ
          </button>
        </div>
      </div>
    </div>
  );
}
