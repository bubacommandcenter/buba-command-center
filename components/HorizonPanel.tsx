'use client';

import { useEffect, useRef, useState } from 'react';
import { Project } from '@/lib/types';
import ErrorBanner from './ErrorBanner';

// Mobile-friendly list view (replaces Gantt on small screens)
function ProjectList({ projects }: { projects: Project[] }) {
  const priorityBadge: Record<string, string> = {
    high: 'bg-red-900 text-red-300',
    medium: 'bg-amber-900 text-amber-300',
    low: 'bg-blue-900 text-blue-300',
  };

  const statusBadge: Record<string, string> = {
    active: 'text-green-400',
    blocked: 'text-red-400',
    'on-hold': 'text-yellow-400',
    complete: 'text-gray-500',
  };

  return (
    <div className="space-y-2">
      {projects.map((p) => (
        <div
          key={p.id}
          className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-start justify-between gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${statusBadge[p.status] ?? 'text-white'}`}>
              {p.name}
            </p>
            {p.nextAction && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{p.nextAction}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityBadge[p.priority]}`}>
              {p.priority.toUpperCase()}
            </span>
            {p.targetDate && (
              <span className="text-xs text-gray-500">
                {p.targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Gantt chart wrapper (desktop only)
function GanttChart({ projects }: { projects: Project[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || projects.length === 0) return;

    let cancelled = false;

    import('frappe-gantt').then((module) => {
      if (cancelled || !containerRef.current) return;

      const Gantt = module.default;

      // Clear previous render
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
      className="gantt-wrapper overflow-x-auto rounded-xl bg-gray-900 border border-gray-800 p-4 min-h-[200px]"
    >
      {!loaded && (
        <p className="text-gray-500 text-sm">Loading Gantt chart...</p>
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
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold tracking-widest uppercase text-gray-400">
          Horizon
        </h2>
        <span className="text-xs text-gray-500">{projects.length} projects</span>
      </div>

      {error && <ErrorBanner message="Could not read projects.md. Check file format." />}

      {!error && projects.length === 0 && (
        <p className="text-gray-500 text-sm">No active projects found.</p>
      )}

      {!error && projects.length > 0 && (
        isMobile
          ? <ProjectList projects={projects} />
          : <GanttChart projects={projects} />
      )}
    </div>
  );
}
