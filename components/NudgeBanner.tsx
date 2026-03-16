'use client';

import { ActionItem, PipelineLead, Project } from '@/lib/types';

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

function computeNudges(
  actionItems: ActionItem[],
  leads: PipelineLead[],
  projects: Project[],
): string[] {
  const nudges: string[] = [];

  // 1. Overdue action items — most urgent signal
  const overdueItems = actionItems
    .filter((x) => x.isOverdue && x.status === 'open')
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));

  if (overdueItems.length > 0) {
    const n = overdueItems.length;
    const title = truncate(overdueItems[0].title, 35);
    nudges.push(
      n === 1
        ? `"${title}" is overdue — tackle it first.`
        : `${n} items overdue — "${title}" most urgent.`
    );
  }

  // 2. Stale pipeline leads — sorted by oldest contact
  const staleLeads = leads
    .filter((l) => l.isStale)
    .sort((a, b) => (a.lastContact?.getTime() ?? 0) - (b.lastContact?.getTime() ?? 0));

  if (staleLeads.length > 0) {
    const stalest = staleLeads[0];
    const n = staleLeads.length;
    const diffDays = stalest.lastContact
      ? Math.round((Date.now() - stalest.lastContact.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const ago = diffDays == null ? 'a while ago'
      : diffDays > 365 ? 'over a year ago'
      : diffDays > 60 ? `${Math.round(diffDays / 30)}mo ago`
      : `${diffDays}d ago`;
    nudges.push(
      n === 1
        ? `${stalest.name} has gone quiet — last touched ${ago}.`
        : `${n} leads quiet — ${stalest.name} last touched ${ago}.`
    );
  }

  // 3. Blocked projects — only if we haven't filled 2 nudges
  if (nudges.length < 2) {
    const blocked = projects.filter((p) => p.status === 'blocked');
    if (blocked.length > 0) {
      const name = truncate(blocked[0].name, 30);
      nudges.push(
        blocked.length === 1
          ? `${name} is blocked — needs your attention.`
          : `${blocked.length} projects blocked — ${name} needs unblocking.`
      );
    }
  }

  // Cap at 2, each max 120 chars
  return nudges.slice(0, 2).map((n) => truncate(n, 120));
}

interface Props {
  actionItems: ActionItem[];
  leads: PipelineLead[];
  projects: Project[];
}

export default function NudgeBanner({ actionItems, leads, projects }: Props) {
  const nudges = computeNudges(actionItems, leads, projects);
  if (nudges.length === 0) return null;

  return (
    <div className="px-5 pt-3 flex flex-col sm:flex-row gap-2">
      {nudges.map((nudge, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 text-[12px] text-white/50 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 shrink-0" />
          {nudge}
        </div>
      ))}
    </div>
  );
}
