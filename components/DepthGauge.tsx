import { DEPTH_COLORS, depthLevel } from '@/lib/utils';

const MAX = 250;
const GROUND = 205;
const H = 190;
const y = (cm: number) => GROUND - (Math.min(cm, MAX) / MAX) * H;

const MARKS = [
  { cm: 10, label: 'ข้อเท้า' },
  { cm: 40, label: 'เข่า' },
  { cm: 90, label: 'เอว' },
  { cm: 200, label: 'หลังคา' },
];

/** Visual gauge: a person silhouette standing in rising water with reference marks. */
export function DepthGauge({ depth }: { depth: number }) {
  const color = DEPTH_COLORS[depthLevel(depth)];
  const wy = y(depth);
  return (
    <svg viewBox="0 0 200 220" className="h-full w-full" role="img" aria-label={`ระดับน้ำ ${depth} เซนติเมตร`}>
      <defs>
        <clipPath id="below">
          <rect x="0" y={wy} width="200" height={GROUND - wy + 1} />
        </clipPath>
      </defs>
      {/* house / roof reference */}
      <path d={`M118 ${y(200)} L158 ${y(200) - 18} L198 ${y(200)} Z`} fill="none" stroke="#475569" strokeWidth="2" />
      <rect x="126" y={y(200)} width="64" height={GROUND - y(200)} fill="none" stroke="#334155" strokeWidth="2" />

      {/* person */}
      <g stroke="#cbd5e1" strokeWidth="9" strokeLinecap="round" fill="none">
        <line x1="60" y1={y(150)} x2="60" y2={y(92)} />
        <line x1="60" y1={y(140)} x2="42" y2={y(100)} strokeWidth="6" />
        <line x1="60" y1={y(140)} x2="78" y2={y(100)} strokeWidth="6" />
        <line x1="54" y1={y(92)} x2="52" y2={y(2)} strokeWidth="7" />
        <line x1="66" y1={y(92)} x2="68" y2={y(2)} strokeWidth="7" />
      </g>
      <circle cx="60" cy={y(165)} r="10" fill="#cbd5e1" />

      {/* reference marks */}
      {MARKS.map((m) => (
        <g key={m.label}>
          <line x1="8" x2="112" y1={y(m.cm)} y2={y(m.cm)} stroke="#64748b" strokeWidth="1" strokeDasharray="3 4" />
          <text x="116" y={y(m.cm) - 3} fontSize="9" fill={depth >= m.cm ? '#e2e8f0' : '#64748b'}>
            {m.label} {m.cm}
          </text>
        </g>
      ))}

      {/* water */}
      <g clipPath="url(#below)">
        <rect x="0" y={wy} width="200" height={GROUND - wy + 2} fill={color} opacity="0.32" />
        <g style={{ animation: 'wave 2.4s linear infinite' }}>
          <path
            d={`M-40 ${wy} q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 V${GROUND + 2} H-40 Z`}
            fill={color}
            opacity="0.35"
          />
        </g>
      </g>
      <line x1="0" x2="200" y1={GROUND + 1} y2={GROUND + 1} stroke="#475569" strokeWidth="2" />
      <text x="190" y={Math.max(12, wy - 6)} fontSize="12" fontWeight="700" fill={color} textAnchor="end">
        {depth} ซม.
      </text>
    </svg>
  );
}
