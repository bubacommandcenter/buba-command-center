'use client';

import { ActionItem } from '@/lib/types';
import ErrorBanner from './ErrorBanner';

function humanDueDate(item: ActionItem): string {
  if (!item.dueDate) return '';
  if (item.isDueToday) return 'Due today';
  if (item.isOverdue) {
    const diffDays = Math.round(
      (new Date().setHours(0, 0, 0, 0) - item.dueDate.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    return diffDays === 1 ? '1 day overdue' : `${diffDays} days overdue`;
  }
  return item.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ActionCard({ item }: { item: ActionItem }) {
  const borderColor = item.isOverdue
    ? 'border-l-red-500'
    : item.isDueToday
    ? 'border-l-orange-400'
    : 'border-l-gray-600';

  const dueLabelColor = item.isOverdue
    ? 'text-red-400'
    : item.isDueToday
    ? 'text-orange-400'
    : 'text-gray-400';

  return (
    <div
      className={`bg-gray-900 border border-gray-800 border-l-4 ${borderColor} rounded-xl px-4 py-3 space-y-1`}
    >
      <p className="text-sm font-medium text-white leading-snug">{item.title}</p>
      <div className="flex items-center gap-3 flex-wrap">
        {item.owner && (
          <span className="text-xs text-gray-400">{item.owner}</span>
        )}
        {item.dueDate && (
          <span className={`text-xs font-medium ${dueLabelColor}`}>
            {humanDueDate(item)}
          </span>
        )}
        {item.project && (
          <span className="text-xs text-gray-500 truncate max-w-[140px]">
            {item.project}
          </span>
        )}
      </div>
    </div>
  );
}

interface Props {
  items: ActionItem[];
  error: string | null;
}

export default function TodayPanel({ items, error }: Props) {
  const visible = items.filter(
    (x) => x.status === 'open' && (x.isOverdue || x.isDueToday)
  );

  const overdue = visible.filter((x) => x.isOverdue);
  const dueToday = visible.filter((x) => x.isDueToday && !x.isOverdue);

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold tracking-widest uppercase text-gray-400">
          Today
        </h2>
        {visible.length > 0 && (
          <span className="text-xs font-bold text-white bg-red-600 rounded-full px-2 py-0.5">
            {visible.length}
          </span>
        )}
      </div>

      {error && <ErrorBanner message={`Could not read action_items.md. Check file format.`} />}

      {!error && visible.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm text-center">Nothing due today.</p>
        </div>
      )}

      <div className="space-y-2 overflow-y-auto flex-1">
        {overdue.map((item) => (
          <ActionCard key={item.id} item={item} />
        ))}
        {dueToday.map((item) => (
          <ActionCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
