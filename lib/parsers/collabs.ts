import { PipelineLead, ParseResult } from '../types';

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const STALE_DAYS = 14;

function isStaleDate(d: Date | null): boolean {
  if (!d) return true;
  return TODAY.getTime() - d.getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;
}

function parseDate(raw: string): Date | null {
  const d = new Date(raw.trim());
  if (!isNaN(d.getTime())) return d;
  const m = raw.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:[,\s]+(\d{4}))?\b/i
  );
  if (m) {
    const year = m[3] ? parseInt(m[3]) : TODAY.getFullYear();
    const d2 = new Date(`${m[1]} ${m[2]}, ${year}`);
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

function inferType(name: string, typeField: string): PipelineLead['type'] {
  const s = `${name} ${typeField}`.toLowerCase();
  if (/catering/i.test(s)) return 'catering';
  if (/influencer|content creator|digital|tastemakers/i.test(s)) return 'influencer';
  if (/joint event|pop.?up|festival/i.test(s)) return 'pop-up';
  return 'collab';
}

function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

function parseStage(stageField: string, folderPath: string): string {
  if (folderPath.includes('confirmed')) return 'Confirmed';
  if (folderPath.includes('dead')) return 'Dead';
  const primary = stageField.split('—')[0].split('(')[0].trim().toLowerCase();
  if (primary.includes('interested') || primary.includes('concept')) return 'Interested';
  if (primary.includes('conversation') || primary.includes('talking')) return 'Conversation Started';
  if (primary.includes('confirm')) return 'Confirmed';
  if (primary.includes('active') || primary.includes('progress')) return 'Active';
  if (primary.includes('hold')) return 'On Hold';
  if (primary.includes('planning') || primary.includes('identified')) return 'Identified';
  return stageField.split('—')[0].trim() || 'Identified';
}

const STAGE_ORDER = ['Confirmed', 'Active', 'Interested', 'Conversation Started', 'Identified', 'On Hold', 'Dead'];

export function parseCollabFiles(
  files: Array<{ name: string; content: string; folderPath: string }>
): { result: ParseResult<PipelineLead>; stages: string[] } {
  const leads: PipelineLead[] = [];
  const stageSet = new Set<string>();

  for (const file of files) {
    const { content, folderPath } = file;
    const lines = content.split('\n');

    // H1 title
    const titleLine = lines.find(l => l.startsWith('# '));
    if (!titleLine) continue;
    const fullTitle = titleLine.replace(/^# /, '').trim();
    const name = fullTitle.replace(/^BUBA\s+x\s+/i, '').trim();

    const getField = (label: string): string | null => {
      const m = content.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+?)(?:\\n|$)`, 'i'));
      return m ? m[1].trim() : null;
    };

    const typeField = getField('Type') ?? '';
    const stageField = getField('Stage') ?? '';
    const updatedField = getField('Updated');

    const stage = parseStage(stageField, folderPath);
    stageSet.add(stage);

    const lastContact = updatedField ? parseDate(updatedField) : null;

    // First unchecked item in ## Next Actions
    const nextActionsMatch = content.match(/## Next Actions\n([\s\S]+?)(?=\n## |\n---|\s*$)/i);
    let nextStep: string | null = null;
    if (nextActionsMatch) {
      for (const line of nextActionsMatch[1].split('\n')) {
        const m = line.match(/^-\s+\[\s+\]\s+(.+)/);
        if (m) {
          // Strip → file pointers
          nextStep = m[1].replace(/→.*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
          break;
        }
      }
    }

    // Current Status first line as notes
    const statusMatch = content.match(/## Current Status\n([\s\S]+?)(?=\n## |\n---|\s*$)/i);
    const notes = statusMatch ? statusMatch[1].trim().split('\n')[0] : null;

    leads.push({
      id: makeId(name),
      name,
      type: inferType(name, typeField),
      stage,
      lastContact,
      isStale: isStaleDate(lastContact),
      nextStep,
      notes,
      owner: 'Fritz',
    });
  }

  const stages = STAGE_ORDER.filter(s => stageSet.has(s));
  Array.from(stageSet).forEach(s => {
    if (!stages.includes(s)) stages.push(s);
  });

  return {
    result: { data: leads, error: null, valid: leads.length > 0 },
    stages,
  };
}
