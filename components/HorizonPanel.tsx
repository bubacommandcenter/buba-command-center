'use client';

import { useEffect, useRef, useState } from 'react';
import { Project } from '@/lib/types';
import ErrorBanner from './ErrorBanner';

const STATUS_DOT: Record<string, string> = {
  active:   'bg-green-400',
  blocked:  'bg-red-400',
  'on-hold':'bg-amber-400',
  complete: 'bg-white/20',
};

const STATUS_LABEL: Record<string, string> = {
  active:   'Active',
  blocked:  'Blocked',
  'on-hold':'On Hold',
  complete: 'Complete',
};

const PRIORITY_BAR: Record<string, string> = {
  high:   'bg-red-500',
  medium: 'bg-amber-400',
  low:    'bg-blue-400',
};

function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div className="space-y-2">
      {projects.map((p) => {
        const dot = STATUS_DOT[p.status] ?? 'bg-white/20';
        const bar = PRIORITY_BAR[p.priority] ?? 'bg-white/20';
        return (
          <div
            key={p.id}
            className="bg-white/[0.04] border border-white/[0.07] rounded-xl overflow-hidden flex"
          >
            {/* Priority bar */}
            <div className={`w-1 shrink-0 ${bar}`} />

            <div className="flex-1 min-w-0 px-3.5 py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                  <p className="text-[14px] font-semibold text-white truncate">{p.name}</p>
                </div>
                {p.nextAction && (
                  <p className="text-[11px] text-white/40 truncate pl-3.5">{p.nextAction}</p>
                )}
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[11px] text-white/35">
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
                {p.targetDate && (
                  <span className="text-[11px] text-white/25">
                    {p.targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GanttChart({ projects }: { projects: Project[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || projects.length === 0) return;

    let cancelled = false;

    import('frappe-gantt').then((module) => {
      if (cancelled || !containerRef.current) return;

      const Gantt = module.default;

      containerRef.current.innerHTML = '<svg></svg>';
      const svg = containerRef.current.querySelector('svg')!;

      const tasks = projects.map((p) => ({
        id: p.id,
        name: p.name,
        start: formatDate(p.startDate ?? new Date()),
        end: formatDate(p.targetDate ?? addWeeks(new Date(), 6)),
        progress: 0,
        custom_class: `priority-${p.priority} status-${p.status}`,
      }));

      new Gantt(svg, tasks, {
        view_mode: 'Week',
        date_format: 'YYYY-MM-DD',
        readonly: true,
      });

      setLoaded(true);
    }).catch((err) => {
      console.error('[Gantt] Failed to load frappe-gantt:', err);
    });

    return () => { cancelled = true; };
  }, [projects]);

  return (
    <div
      ref={containerRef}
      className="gantt-wrapper overflow-x-auto rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 min-h-[200px]"
    >
      {!loaded && (
        <p className="text-white/30 text-sm">Loading Gantt chart...</p>
      )}
    </div>
  );
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addWeeks(d: Date, weeks: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + weeks * 7);
  return r;
}

interface Props {
  projects: Project[];
  error: string | null;
  isMobile: boolean;
}

export default function HorizonPanel({ projects, error, isMobile }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">📅</span>
          <h2 className="text-sm font-semibold text-white">Horizon</h2>
        </div>
        <span className="text-xs text-white/30">{projects.length} projects</span>
      </div>

      {error && <ErrorBanner message="Could not read projects.md. Check file format." />}

      {!error && projects.length === 0 && (
        <p className="text-white/30 text-sm">No active projects found.</p>
      )}

      {!error && projects.length > 0 && (
        isMobile
          ? <ProjectList projects={projects} />
          : <GanttChart projects={projects} />
      )}
    </div>
  );
}
