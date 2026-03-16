'use client';

import { useState, useCallback } from 'react';
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

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-white/30 transition-transform duration-200 ${up ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ActionCard({
  item,
  isCompleted,
  onToggleComplete,
  isExpanded,
  onToggleExpand,
  errorMessage,
}: {
  item: ActionItem;
  isCompleted: boolean;
  onToggleComplete: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  errorMessage: string | null;
}) {
  const isOverdue = item.isOverdue;

  const borderColor = isCompleted
    ? 'border-l-white/20'
    : isOverdue
    ? 'border-l-red-500'
    : 'border-l-amber-400';

  const dueLabelStyle = isOverdue
    ? 'bg-red-500/15 text-red-400'
    : 'bg-amber-500/15 text-amber-400';

  return (
    <div
      className={`bg-white/[0.04] border border-white/[0.07] border-l-4 ${borderColor} rounded-xl px-3 py-3.5 space-y-2 transition-opacity duration-150 ${
        isCompleted ? 'opacity-50' : 'opacity-100'
      }`}
    >
      {/* Top row: checkbox + title + chevron */}
      <div className="flex items-start gap-2.5">
        {/* Circular checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete();
          }}
          aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
          className="mt-0.5 shrink-0 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          style={{ width: '18px', height: '18px' }}
        >
          <span
            className={`block rounded-full transition-all duration-150 ${
              isCompleted ? 'w-2.5 h-2.5 bg-white/60' : 'w-0 h-0'
            }`}
            style={{ width: isCompleted ? '10px' : '0', height: isCompleted ? '10px' : '0' }}
          />
          {/* Outer ring */}
          <span
            className={`absolute rounded-full border-2 transition-colors duration-150 ${
              isCompleted ? 'border-white/50' : 'border-white/30'
            }`}
            style={{ width: '18px', height: '18px' }}
          />
        </button>

        {/* Title (clickable to expand) */}
        <button
          onClick={onToggleExpand}
          className="flex-1 text-left min-w-0 focus:outline-none"
        >
          <p
            className={`text-[15px] font-medium text-white leading-snug transition-all duration-150 ${
              isCompleted ? 'line-through text-white/50' : ''
            } ${!isExpanded ? 'line-clamp-3' : ''}`}
          >
            {item.title}
          </p>
        </button>

        {/* Chevron */}
        <button
          onClick={onToggleExpand}
          className="shrink-0 mt-0.5 focus:outline-none"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          <ChevronIcon up={isExpanded} />
        </button>
      </div>

      {/* Tags row */}
      <div className="flex items-center gap-2 flex-wrap pl-7">
        {item.dueDate && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${dueLabelStyle}`}>
            {humanDueDate(item)}
          </span>
        )}
        {item.owner && item.owner !== 'FRITZ' && (
          <span className="text-[11px] text-white/40">{item.owner}</span>
        )}
        {item.project && (
          <span className="text-[11px] text-white/30 truncate max-w-[140px]">
            {item.project}
          </span>
        )}
      </div>

      {/* Expanded context */}
      {isExpanded && item.context && (
        <div className="pl-7 pt-1 text-[12px] text-white/45 leading-relaxed">
          {item.context}
        </div>
      )}

      {/* Inline error */}
      {errorMessage && (
        <p className="pl-7 text-[11px] text-red-400">{errorMessage}</p>
      )}
    </div>
  );
}

interface Props {
  items: ActionItem[];
  error: string | null;
  onRefetch?: () => void;
}

export default function TodayPanel({ items, error, onRefetch }: Props) {
  // Optimistic completed overrides: itemId -> boolean (true = completed)
  const [completedOverrides, setCompletedOverrides] = useState<Map<string, boolean>>(
    () => new Map()
  );
  const [itemErrors, setItemErrors] = useState<Map<string, string>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = items.filter(
    (x) => x.status === 'open' && (x.isOverdue || x.isDueToday)
  );

  function isEffectivelyCompleted(item: ActionItem): boolean {
    return completedOverrides.has(item.id)
      ? completedOverrides.get(item.id)!
      : item.status === 'complete';
  }

  // Sort: open (not completed) first, completed last
  const sorted = [...visible].sort((a, b) => {
    const aC = isEffectivelyCompleted(a) ? 1 : 0;
    const bC = isEffectivelyCompleted(b) ? 1 : 0;
    return aC - bC;
  });

  const overdue = sorted.filter((x) => x.isOverdue && !isEffectivelyCompleted(x));
  const dueToday = sorted.filter((x) => x.isDueToday && !x.isOverdue && !isEffectivelyCompleted(x));
  const completed = sorted.filter((x) => isEffectivelyCompleted(x));

  const openCount = visible.filter((x) => !isEffectivelyCompleted(x)).length;

  const handleToggleComplete = useCallback(
    async (item: ActionItem) => {
      const wasCompleted = isEffectivelyCompleted(item);
      const newCompleted = !wasCompleted;

      // Optimistic update
      setCompletedOverrides((prev) => new Map(prev).set(item.id, newCompleted));
      setItemErrors((prev) => {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      });

      try {
        const res = await fetch('/api/drive/update-item', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: item.id, completed: newCompleted }),
        });

        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }

        if (res.status === 409) {
          // Drive conflict — revert and re-fetch
          setCompletedOverrides((prev) => {
            const next = new Map(prev);
            next.set(item.id, wasCompleted);
            return next;
          });
          setItemErrors((prev) =>
            new Map(prev).set(item.id, 'File was updated elsewhere — refreshing...')
          );
          onRefetch?.();
          return;
        }

        if (!res.ok) {
          throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        }

        // Success — keep optimistic state
      } catch {
        // Revert on failure
        setCompletedOverrides((prev) => {
          const next = new Map(prev);
          next.set(item.id, wasCompleted);
          return next;
        });
        setItemErrors((prev) =>
          new Map(prev).set(item.id, "Couldn't save — try again")
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completedOverrides, onRefetch]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🔴</span>
          <h2 className="text-sm font-semibold text-white">Today</h2>
        </div>
        {openCount > 0 && (
          <span className="text-[11px] font-bold text-white bg-red-500 rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
            {openCount}
          </span>
        )}
      </div>

      {error && <ErrorBanner message="Could not read action_items.md. Check file format." />}

      {!error && visible.length === 0 && (
        <div className="flex-1 flex items-center justify-center py-8">
          <p className="text-white/30 text-sm text-center">Nothing due today.</p>
        </div>
      )}

      <div className="space-y-4 overflow-y-auto flex-1">
        {overdue.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-widest uppercase text-red-500/70 px-1">
              Overdue
            </p>
            {overdue.map((item) => (
              <ActionCard
                key={item.id}
                item={item}
                isCompleted={isEffectivelyCompleted(item)}
                onToggleComplete={() => handleToggleComplete(item)}
                isExpanded={expandedId === item.id}
                onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                errorMessage={itemErrors.get(item.id) ?? null}
              />
            ))}
          </div>
        )}

        {dueToday.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-widest uppercase text-amber-500/70 px-1">
              Due Today
            </p>
            {dueToday.map((item) => (
              <ActionCard
                key={item.id}
                item={item}
                isCompleted={isEffectivelyCompleted(item)}
                onToggleComplete={() => handleToggleComplete(item)}
                isExpanded={expandedId === item.id}
                onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                errorMessage={itemErrors.get(item.id) ?? null}
              />
            ))}
          </div>
        )}

        {completed.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-widest uppercase text-white/20 px-1">
              Done
            </p>
            {completed.map((item) => (
              <ActionCard
                key={item.id}
                item={item}
                isCompleted={true}
                onToggleComplete={() => handleToggleComplete(item)}
                isExpanded={expandedId === item.id}
                onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                errorMessage={itemErrors.get(item.id) ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
