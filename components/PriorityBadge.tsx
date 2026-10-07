import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import type { Priority } from '@/lib/types';
import { PRIORITY_META, cn } from '@/lib/utils';

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const m = PRIORITY_META[priority];
  const Icon = priority === 'critical' ? AlertOctagon : priority === 'urgent' ? AlertTriangle : Info;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        m.cls,
        className,
      )}
    >
      <Icon size={12} />
      {m.label}
    </span>
  );
}
