import { AlertOctagon } from 'lucide-react';
import type { Priority } from '@/lib/types';
import { cn } from '@/lib/utils';

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  if (priority === 'critical') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-semibold text-red-300',
          className,
        )}
      >
        <AlertOctagon size={12} />
        วิกฤต
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-300',
        className,
      )}
    >
      {priority === 'urgent' ? 'เร่งด่วน' : 'ปานกลาง'}
    </span>
  );
}
