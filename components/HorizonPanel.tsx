'use client';

import { useState } from 'react';
import { Project } from '@/lib/types';
import ErrorBanner from './ErrorBanner';

const PRIORITY_STRIP: Record<string, string> = {
  high:   'bg-red-500',
  medium: 'bg-amber-400',
  low:    'bg-blue-400',
};

const STATUS_DOT: Record<string, string> = {
  active:   'bg-green-400',
  blocked:  'bg-red-400',
  'on-hold':'bg-amber-300',
  complete: 'bg-white/20',
};

function deadlineLabel(targetDate: Date | null): {
  text: string;
  color: string;
} {
  if (!targetDate) return { text: 'No date set', color: 'bg-white/[0.04] text-white/25' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) {
    const n = Math.abs(diff);
    return {
      text: n === 1 ? '1 day overdue' : `${n} days overdue`,
      color: 'bg-red-500/15 text-red-400',
    };
  }
  if (diff === 0) return { text: 'Due today', color: 'bg-red-500/15 text-red-400' };
  if (diff === 1) return { text: '1 day left', color: 'bg-amber-500/15 text-amber-400' };
  if (diff <= 7) return { text: `${diff} days left`, color: 'bg-amber-500/15 text-amber-400' };
  if (diff <= 21) return {
    text: targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    color: 'bg-white/[0.06] text-white/50',
  };
  return {
    text: targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    color: 'bg-white/[0.04] text-white/30',
  };
}

function urgencyScore(p: Project): number {
  // Lower = more urgent
  if (p.status === 'blocked') return -1000;
  if (!p.targetDate) return 9999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((p.targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function ProjectCard({ project }: { project: Project }) {
  const strip = PRIORITY_STRIP[project.priority] ?? 'bg-white/20';
  const dot = STATUS_DOT[project.status] ?? 'bg-white/20';
  const deadline = deadlineLabel(project.targetDate);
  const isBlocked = project.status === 'blocked';

  return (
    <div
      className={`flex rounded-xl overflow-hidden border ${
        isBlocked
          ? 'bg-red-500/[0.05] border-red-500/20'
          : 'bg-white/[0.04] border-white/[0.07]'
      }`}
    >
      {/* Priority strip */}
      <div className={`w-1 shrink-0 ${strip}`} />

      <div className="flex-1 min-w-0 px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          {/* Left: name + next action */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
              <p className="text-[14px] font-semibold text-white leading-snug truncate">
                {project.name}
              </p>
            </div>
            {project.nextAction ? (
              <p className="text-[11px] text-white/40 leading-relaxed pl-3 line-clamp-2">
                {project.nextAction}
              </p>
            ) : (
              <p className="text-[11px] text-white/20 pl-3 italic">No next action set</p>
            )}
          </div>

          {/* Right: deadline badge */}
          {deadline.text && (
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${deadline.color}`}
            >
              {deadline.text}
            </span>
          )}
        </div>

        {/* Owner — only if not Fritz */}
        {project.owner && project.owner.toUpperCase() !== 'FRITZ' && (
          <p className="text-[10px] text-white/25 mt-1.5 pl-3">{project.owner}</p>
        )}
      </div>
    </div>
  );
}

interface Props {
  projects: Project[];
  error: string | null;
  isMobile: boolean;
}

export default function HorizonPanel({ projects, error }: Props) {
  const [showInactive, setShowInactive] = useState(false);

  const active = projects
    .filter((p) => p.status === 'active' || p.status === 'blocked')
    .sort((a, b) => urgencyScore(a) - urgencyScore(b));

  const inactive = projects.filter(
    (p) => p.status === 'on-hold' || p.status === 'complete'
  );

  const blockedCount = active.filter((p) => p.status === 'blocked').length;
  const overdueCount = active.filter((p) => {
    if (!p.targetDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return p.targetDate < today;
  }).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">📅</span>
          <h2 className="text-sm font-semibold text-white">Horizon</h2>
          {blockedCount > 0 && (
            <span className="text-[10px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
              {blockedCount} blocked
            </span>
          )}
          {overdueCount > 0 && (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
              {overdueCount} overdue
            </span>
          )}
        </div>
        <span className="text-xs text-white/30">{projects.length} projects</span>
      </div>

      {error && <ErrorBanner message="Could not read projects.md. Check file format." />}

      {!error && projects.length === 0 && (
        <p className="text-white/30 text-sm">No projects found.</p>
      )}

      {!error && projects.length > 0 && (
        <div className="space-y-4">
          {/* Active + Blocked */}
          {active.length > 0 && (
            <div className="space-y-2">
              {active.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}

          {/* On Hold / Complete — collapsible */}
          {inactive.length > 0 && (
            <div>
              <button
                onClick={() => setShowInactive((v) => !v)}
                className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-white/25 hover:text-white/45 transition-colors px-1 mb-2 focus:outline-none"
              >
                <svg
                  className={`w-3 h-3 transition-transform duration-150 ${showInactive ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                On Hold / Complete ({inactive.length})
              </button>

              {showInactive && (
                <div className="space-y-2">
                  {inactive.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
