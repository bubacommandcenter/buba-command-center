import { ActionItem, ParseResult } from '../types';

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseDueDate(raw: string): Date | null {
  const s = raw.trim().toUpperCase();

  if (s === 'TODAY' || s.includes('TODAY')) {
    return new Date(TODAY);
  }

  if (s === 'ASAP' || s.includes('ASAP')) {
    return new Date(TODAY); // treat ASAP as today
  }

  if (s.includes('OVERDUE')) {
    // Return yesterday as a fallback to trigger isOverdue
    const d = new Date(TODAY);
    d.setDate(d.getDate() - 1);
    return d;
  }

  // Month name patterns: "March 16", "March 16, 2026", "MARCH 16 AT 12PM"
  const monthMatch = s.match(
    /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2})(?:[,\s]+(\d{4}))?\b/
  );
  if (monthMatch) {
    const [, month, day, year] = monthMatch;
    const months: Record<string, number> = {
      JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, MAY: 4, JUNE: 5,
      JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
    };
    const d = new Date(
      parseInt(year ?? String(TODAY.getFullYear())),
      months[month],
      parseInt(day)
    );
    if (!isNaN(d.getTime())) return d;
  }

  // ISO / MM/DD/YYYY patterns
  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(`${isoMatch[0]}T00:00:00`);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function makeId(title: string, dueRaw: string | null): string {
  return `${title.slice(0, 30)}-${dueRaw ?? 'none'}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
}

function detectOwnerSection(line: string): string | null {
  const m = line.match(/^##\s+OPEN\s+—\s+(.+)/i);
  return m ? m[1].trim() : null;
}

export function parseActionItems(markdown: string): ParseResult<ActionItem> {
  const lines = markdown.split('\n');
  const items: ActionItem[] = [];
  let currentOwnerSection = 'FRITZ';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Track owner section headings
    const ownerSection = detectOwnerSection(line);
    if (ownerSection) {
      currentOwnerSection = ownerSection;
      i++;
      continue;
    }

    // Match top-level list items: "- [ ]" or "- [x]"
    const itemMatch = line.match(/^-\s+\[([ xX])\]\s+\*\*(.+?)\*\*/);
    if (!itemMatch) {
      i++;
      continue;
    }

    const isComplete = itemMatch[1].toLowerCase() === 'x';
    const rawTitle = itemMatch[2];

    // Collect sub-lines (indented) until next top-level item or heading
    const subLines: string[] = [];
    i++;
    while (i < lines.length) {
      const sub = lines[i];
      if (/^-\s+\[[ xX]\]/.test(sub) || /^#/.test(sub) || /^---/.test(sub)) break;
      subLines.push(sub);
      i++;
    }

    const fullText = subLines.join('\n');

    // Extract Due date
    let dueRaw: string | null = null;
    const dueMatch = fullText.match(/(?:^|\n)\s*-?\s*\*?Due:\*?\s*(.+?)(?:\n|$)/i)
      ?? fullText.match(/Due:\s*(.+?)(?:\n|$)/i);
    if (dueMatch) dueRaw = dueMatch[1].trim();

    // Also check title itself for due markers
    if (!dueRaw) {
      if (/overdue/i.test(rawTitle)) dueRaw = 'OVERDUE';
      else if (/today/i.test(rawTitle)) dueRaw = 'TODAY';
    }

    const dueDate = dueRaw ? parseDueDate(dueRaw) : null;

    const isOverdue = dueDate !== null && dueDate < TODAY;
    const isDueToday = dueDate !== null && isSameDay(dueDate, TODAY);

    // Extract context
    const contextMatch = fullText.match(/Context:\s*(.+?)(?:\n|$)/i);
    const context = contextMatch ? contextMatch[1].trim() : null;

    // Determine owner: prioritize explicit "Owner:" field, fall back to section
    const ownerMatch = fullText.match(/Owner:\s*(.+?)(?:\n|$)/i);
    const owner = ownerMatch ? ownerMatch[1].trim() : currentOwnerSection;

    // Priority heuristic
    let priority: ActionItem['priority'] = null;
    const titleLower = rawTitle.toLowerCase();
    const combined = `${rawTitle} ${fullText}`.toLowerCase();
    if (/🚨|⚠️|hard deadline|p1|urgent/i.test(combined)) {
      priority = 'high';
    } else if (/this week|asap/i.test(combined)) {
      priority = 'medium';
    } else if (/when convenient|someday/i.test(combined)) {
      priority = 'low';
    }

    // Project association
    const projectMatch = fullText.match(/(?:Context|Project):\s*(.+?)(?:\n|$)/i);
    const project = projectMatch ? projectMatch[1].split('—')[0].trim() : null;

    items.push({
      id: makeId(rawTitle, dueRaw),
      title: rawTitle,
      owner,
      dueDate,
      isOverdue,
      isDueToday,
      priority,
      context,
      status: isComplete ? 'complete' : 'open',
      project,
    });
  }

  const openItems = items.filter((x) => x.status === 'open');
  const valid = openItems.length > 0;
  if (!valid) {
    console.warn('[action-items] No open items parsed — possible format mismatch');
  }

  return { data: items, error: null, valid };
}
