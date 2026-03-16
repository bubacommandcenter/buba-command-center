import { ActionItem, PipelineLead, Project } from './types';

export type QuestionAction =
  | { type: 'update-lead-nextstep'; leadId: string; currentValue: string }
  | { type: 'readonly' };

export type Question = {
  id: string;
  text: string;
  context: string; // e.g. "Pipeline — Caramel Kitchen"
  priority: 'high' | 'medium' | 'low';
  action: QuestionAction;
};

function daysAgo(d: Date): number {
  return Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function generateQuestions(
  actionItems: ActionItem[],
  leads: PipelineLead[],
  projects: Project[],
): Question[] {
  const questions: Question[] = [];

  // ── Pipeline rules ────────────────────────────────────────────────────────

  for (const lead of leads) {
    const dead = lead.stage.toLowerCase().includes('dead') ||
      lead.stage.toLowerCase().includes('complet');
    if (dead) continue;

    // Stale lead + no next step → actionable, high priority
    if (lead.isStale && !lead.nextStep) {
      const ago = lead.lastContact ? `${daysAgo(lead.lastContact)}d` : 'a while';
      questions.push({
        id: `pipeline-stale-nonextstep-${lead.id}`,
        text: `${lead.name} has gone quiet (${ago} ago) and has no next step. What's the plan?`,
        context: `Pipeline — ${lead.name}`,
        priority: 'high',
        action: { type: 'update-lead-nextstep', leadId: lead.id, currentValue: '' },
      });
      continue;
    }

    // Stale lead + has next step → read-only, medium priority
    if (lead.isStale && lead.nextStep) {
      const ago = lead.lastContact ? `${daysAgo(lead.lastContact)}d` : 'a while';
      const step = lead.nextStep.length > 60
        ? lead.nextStep.slice(0, 57) + '…'
        : lead.nextStep;
      questions.push({
        id: `pipeline-stale-hasstep-${lead.id}`,
        text: `It's been ${ago} since ${lead.name}. Have you made progress on: "${step}"?`,
        context: `Pipeline — ${lead.name}`,
        priority: 'medium',
        action: { type: 'readonly' },
      });
      continue;
    }

    // Not stale but no next step → low priority
    if (!lead.nextStep) {
      questions.push({
        id: `pipeline-nonextstep-${lead.id}`,
        text: `${lead.name} has no next step recorded. What needs to happen here?`,
        context: `Pipeline — ${lead.name}`,
        priority: 'low',
        action: { type: 'update-lead-nextstep', leadId: lead.id, currentValue: '' },
      });
    }
  }

  // ── Project rules ─────────────────────────────────────────────────────────

  for (const project of projects) {
    if (project.status === 'complete' || project.status === 'on-hold') continue;

    // Blocked project → high priority, read-only
    if (project.status === 'blocked') {
      questions.push({
        id: `project-blocked-${project.id}`,
        text: `${project.name} is blocked. What's in the way and what would unblock it?`,
        context: `Horizon — ${project.name}`,
        priority: 'high',
        action: { type: 'readonly' },
      });
      continue;
    }

    // Active + no next action → medium priority
    if (project.status === 'active' && !project.nextAction) {
      questions.push({
        id: `project-nonextaction-${project.id}`,
        text: `${project.name} is active but has no next action. What's the immediate next step?`,
        context: `Horizon — ${project.name}`,
        priority: 'medium',
        action: { type: 'readonly' },
      });
    }

    // Active + target date overdue → medium priority
    if (project.status === 'active' && project.targetDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (project.targetDate < today) {
        const n = Math.round((today.getTime() - project.targetDate.getTime()) / (1000 * 60 * 60 * 24));
        questions.push({
          id: `project-overdue-${project.id}`,
          text: `${project.name} was due ${n === 1 ? '1 day' : `${n} days`} ago. Is it still in play or needs a new date?`,
          context: `Horizon — ${project.name}`,
          priority: 'medium',
          action: { type: 'readonly' },
        });
      }
    }
  }

  // ── Action item rules ─────────────────────────────────────────────────────

  for (const item of actionItems) {
    if (item.status === 'complete') continue;

    // Overdue > 7 days → medium priority
    if (item.isOverdue && item.dueDate) {
      const n = Math.round(
        (new Date().setHours(0, 0, 0, 0) - item.dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (n >= 7) {
        const title = item.title.length > 50 ? item.title.slice(0, 47) + '…' : item.title;
        questions.push({
          id: `item-longoverdue-${item.id}`,
          text: `"${title}" has been overdue for ${n} days. Is it still relevant, or should it be dropped?`,
          context: `Today — ${item.project ?? 'Action Items'}`,
          priority: 'medium',
          action: { type: 'readonly' },
        });
      }
    }
  }

  // ── Sort and cap ──────────────────────────────────────────────────────────

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  questions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Deduplicate by lead/project — max 1 question per entity
  const seen = new Set<string>();
  const deduped: Question[] = [];
  for (const q of questions) {
    // Extract entity key from id (e.g. "pipeline-stale-nonextstep-caramel-kitchen")
    const entityKey = q.id.replace(/^[^-]+-[^-]+-[^-]+-/, '');
    if (!seen.has(entityKey)) {
      seen.add(entityKey);
      deduped.push(q);
    }
    if (deduped.length === 5) break;
  }

  return deduped;
}

export function formatQuestionsForEmail(questions: Question[]): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  const lines = [`Daily questions from BUBA — ${date}`, ''];
  questions.forEach((q, i) => {
    lines.push(`${i + 1}. [${q.context}]`);
    lines.push(`   ${q.text}`);
    lines.push('');
  });
  lines.push('---');
  lines.push('Reply with your answers to update the command center.');

  return lines.join('\n');
}
