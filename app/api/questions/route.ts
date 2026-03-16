import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchAllMarkdownFiles } from '@/lib/drive';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export type AiQuestion = {
  id: string;
  text: string;
  context: string;
  priority: 'high' | 'medium' | 'low';
  writeBack?: {
    fileName: string;
    entryName: string;
    fieldName: string;
  };
};

const SYSTEM_PROMPT = `You are the chief of staff for Fritz, the founder of BUBA — a fast-growing NYC food startup.

Your job is to review all of Fritz's operational files and generate exactly 5 sharp, specific questions that will:
- Surface commitments or follow-ups that are slipping
- Push important relationships and deals forward
- Clarify next steps on stalled or unclear work
- Identify decisions that need to be made
- Cover people, partners, leads, projects, and operations — not just the obvious files

Rules:
- Questions must reference SPECIFIC names, companies, projects, or situations — never generic
- Max 120 characters per question
- Tone: direct, warm, slightly informal — like a trusted advisor who has read everything
- Draw from ALL the files provided, not just the obvious ones
- Prioritize questions where a clear answer would actually move something forward

Respond with ONLY valid JSON in this exact format, no other text:
{
  "questions": [
    {
      "id": "kebab-case-slug",
      "text": "Specific question text?",
      "context": "FileName — Specific Name or Topic",
      "priority": "high",
      "writeBack": {
        "fileName": "exact-filename.md",
        "entryName": "Exact entry heading (text after ### )",
        "fieldName": "Field Name to update"
      }
    }
  ]
}

Only include writeBack if there is a specific, clear field in a specific entry that the answer should update. If the question is reflective or doesn't map to a single field, omit writeBack entirely.`;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accessToken = (session as { accessToken?: string }).accessToken;
  if (!accessToken) return NextResponse.json({ error: 'No access token' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  let files: Array<{ name: string; content: string }>;
  try {
    files = await fetchAllMarkdownFiles(accessToken);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read Drive files: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No markdown files found in Drive folder' }, { status: 404 });
  }

  // Build file context block — truncate large files to keep prompt focused
  const MAX_FILE_CHARS = 4000;
  const fileContext = files
    .map((f) => {
      const body = f.content.length > MAX_FILE_CHARS
        ? f.content.slice(0, MAX_FILE_CHARS) + '\n...[truncated]'
        : f.content;
      return `--- ${f.name} ---\n${body}`;
    })
    .join('\n\n');

  const userMessage = `Here are all of Fritz's operational files:\n\n${fileContext}\n\nGenerate 5 questions now.`;

  let raw: string;
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
    raw = response.content[0].type === 'text' ? response.content[0].text : '';
  } catch (err) {
    return NextResponse.json(
      { error: `AI generation failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  let questions: AiQuestion[];
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    questions = parsed.questions ?? [];
  } catch {
    return NextResponse.json(
      { error: 'AI returned invalid JSON', raw },
      { status: 500 }
    );
  }

  return NextResponse.json({ questions }, { headers: { 'Cache-Control': 'no-store' } });
}
