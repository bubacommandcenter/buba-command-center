import { Project, ParseResult } from '../types';

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function weeksFromToday(n: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n * 7);
  return d;
}

function mapStatus(raw: string): Project['status'] {
  const s = raw.toLowerCase();
  if (s.includes('progress') || s.includes('active') || s.includes('live')) return 'active';
  if (s.includes('stall') || s.includes('paused') || s.includes('on-hold') || s.includes('on hold')) return 'on-hold';
  if (s.includes('complet') || s.includes('done') || s.includes('killed')) return 'complete';
  if (s.includes('block') || s.includes('wait')) return 'blocked';
  if (s.includes('planning') || s.includes('identif') || s.includes('explor')) return 'active';
  return 'active';
}

function mapPriority(raw: string): Project['priority'] {
  if (/p1|high/i.test(raw)) return 'high';
  if (/p2|medium|mid/i.test(raw)) return 'medium';
  return 'low';
}

function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

export function parseProjects(markdown: string): ParseResult<Project> {
  const projects: Project[] = [];

  // Split on ### headings under ACTIVE PROJECTS
  const sections = markdown.split(/^###\s+/m);

  for (const section of sections.slice(1)) {
    const lines = section.split('\n');
    const name = lines[0].trim();

    // Skip if empty name or clearly a meta section
    if (!name || /COMPLETED|KILLED|PAUSED/i.test(name)) continue;

    const body = lines.slice(1).join('\n');

    const field = (label: string): string | null => {
      const match = body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+?)(?:\\n|$)`, 'i'))
        ?? body.match(new RegExp(`- \\*\\*${label}:\\*\\*\\s*(.+?)(?:\\n|$)`, 'i'))
        ?? body.match(new RegExp(`${label}:\\s*(.+?)(?:\\n|$)`, 'i'));
      return match ? match[1].trim() : null;
    };

    // Check for Status first, then fall back to Completed (for completed projects)
    let statusRaw = field('Status') ?? field('status') ?? field('Completed') ?? field('completed') ?? 'active';
    const priorityRaw = field('Priority') ?? field('priority') ?? 'p3';
    const nextAction = field('Next Action') ?? field('Next action') ?? null;
    const ownerRaw = field('Owner') ?? null;
    const notesRaw = field('Notes') ?? null;

    // Dates: look for date patterns in the section
    // The projects.md doesn't have explicit start/target date fields,
    // so we use today as start and null for target (no fake deadlines)
    const targetMatch = body.match(/(?:target|deadline|by)\s+([A-Za-z]+\s+\d{1,2}(?:,?\s*\d{4})?)/i);
    let targetDate: Date | null = null;
    if (targetMatch) {
      const d = new Date(targetMatch[1]);
      if (!isNaN(d.getTime())) targetDate = d;
    }

    projects.push({
      id: makeId(name),
      name,
      status: mapStatus(statusRaw),
      priority: mapPriority(priorityRaw),
      startDate: new Date(TODAY),
      targetDate,
      nextAction,
      owner: ownerRaw,
      notes: notesRaw,
    });
  }

  const valid = projects.length > 0;
  if (!valid) {
    console.warn('[projects] No projects parsed — possible format mismatch');
  }

  return { data: projects, error: null, valid };
}
