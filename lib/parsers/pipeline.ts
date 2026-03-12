import { PipelineLead, ParseResult } from '../types';

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const STALE_DAYS = 14;

function isStaleDate(d: Date | null): boolean {
  if (!d) return false;
  const diffMs = TODAY.getTime() - d.getTime();
  return diffMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

function parseDate(raw: string): Date | null {
  // Try to parse "March 10, 2026", "Dec 21, 2025", ISO, etc.
  const d = new Date(raw.trim());
  if (!isNaN(d.getTime())) return d;

  // Match "Month Day, Year" or "Month Day"
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

function inferType(name: string, details: string): PipelineLead['type'] {
  const s = `${name} ${details}`.toLowerCase();
  if (/catering|office drop|office-drop|drop|fooda|forkable|ezcater/i.test(s)) return 'catering';
  if (/influencer|content creator|tastemakers|digital dept|instagram/i.test(s)) return 'influencer';
  if (/pop.?up|event|dinner|hosted/i.test(s)) return 'pop-up';
  if (/run club|runners|run/i.test(s)) return 'other';
  return 'other';
}

function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

function extractField(body: string, label: string): string | null {
  const m = body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+?)(?:\\n|$)`, 'i'))
    ?? body.match(new RegExp(`- \\*\\*${label}:\\*\\*\\s*(.+?)(?:\\n|$)`, 'i'));
  return m ? m[1].trim() : null;
}

export function parsePipeline(markdown: string): {
  result: ParseResult<PipelineLead>;
  stages: string[];
} {
  const leads: PipelineLead[] = [];

  // Discover stages from the PIPELINE STAGES section
  const stagesMatch = markdown.match(/## PIPELINE STAGES\n([\s\S]+?)(?=\n##)/i);
  const stagesRaw = stagesMatch ? stagesMatch[1] : '';
  const stageList = stagesRaw
    .split(/[\n→|]/)
    .map((s) => s.replace(/^\d+\.\s*/, '').trim())
    .filter((s) => s.length > 0 && !/^#/.test(s));

  // Parse ACTIVE section entries
  const activeSectionMatch = markdown.match(/^## ACTIVE\n([\s\S]+?)(?=\n^## |\n^---)/im);
  const activeSection = activeSectionMatch ? activeSectionMatch[1] : '';

  const entrySections = activeSection.split(/^### /m);

  for (const entry of entrySections.slice(1)) {
    const lines = entry.split('\n');
    // Name is the first line, strip trailing labels
    const rawName = lines[0].replace(/—[^—]+$/, '').trim();
    const name = rawName;
    const body = lines.slice(1).join('\n');

    const stageRaw = extractField(body, 'Stage') ?? '';
    // Normalize stage: strip emoji, ⚠️ prefixes, extra notes
    const stage = stageRaw
      .replace(/[⚠️✅🔴🟡🟢]/g, '')
      .split('—')[0]
      .split('(')[0]
      .split('→')[0]
      .replace(/\s+/g, ' ')
      .trim();

    const lastActivityRaw = extractField(body, 'Last Activity');
    let lastContact: Date | null = null;
    if (lastActivityRaw) {
      const dateMatch = lastActivityRaw.match(
        /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:[,\s]+\d{4})?\b/i
      );
      if (dateMatch) {
        lastContact = parseDate(dateMatch[0]);
      }
    }

    const nextStep = extractField(body, 'Next Action') ?? extractField(body, 'Next action') ?? null;
    const notes = extractField(body, 'Notes') ?? null;
    const owner = extractField(body, 'Owner') ?? null;

    const type = inferType(name, `${body} ${lines[0]}`);

    leads.push({
      id: makeId(name),
      name,
      type,
      stage: stage || 'Unknown',
      lastContact,
      isStale: isStaleDate(lastContact),
      nextStep: nextStep ? nextStep.replace(/^⚠️\s*/, '').trim() : null,
      notes,
      owner,
    });
  }

  const valid = leads.length > 0;
  if (!valid) {
    console.warn('[pipeline] No leads parsed — possible format mismatch');
  }

  return {
    result: { data: leads, error: null, valid },
    stages: stageList.length > 0 ? stageList : ['Identified', 'Conversation Started', 'Interested', 'Waiting on Them', 'Waiting on Fritz', 'Confirmed', 'Completed', 'Dead'],
  };
}
