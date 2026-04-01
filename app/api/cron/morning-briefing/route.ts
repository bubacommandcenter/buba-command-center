import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';
import { fetchAllFilesServerSide } from '@/lib/drive-server';
import { parsePipeline } from '@/lib/parsers/pipeline';

const anthropic = new Anthropic();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

function todayShort(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

/** Extract only the OPEN section from action_items.md to keep context focused. */
function extractOpenActionItems(content: string): string {
  const completedIdx = content.indexOf('## COMPLETED');
  const openContent = completedIdx > 0 ? content.slice(0, completedIdx) : content;
  // Cap at 6000 chars
  return openContent.length > 6000 ? openContent.slice(0, 6000) + '\n...[truncated]' : openContent;
}

/** Extract only the ACTIVE section from collab_pipeline.md. */
function extractActivePipeline(content: string): string {
  const completedIdx = content.search(/^## CONFIRMED|^## COMPLETED|^## DEAD/m);
  const activeContent = completedIdx > 0 ? content.slice(0, completedIdx) : content;
  return activeContent.length > 5000 ? activeContent.slice(0, 5000) + '\n...[truncated]' : activeContent;
}

/** Extract only ACTIVE PROJECTS from projects.md. */
function extractActiveProjects(content: string): string {
  const completedIdx = content.search(/^## COMPLETED|^## KILLED/m);
  const activeContent = completedIdx > 0 ? content.slice(0, completedIdx) : content;
  return activeContent.length > 4000 ? activeContent.slice(0, 4000) + '\n...[truncated]' : activeContent;
}

/** Get the most recent 3 session entries from session_log.md. */
function extractRecentSessions(content: string): string {
  const entries = content.split('---').filter((s) => s.trim().startsWith('SESSION:'));
  const recent = entries.slice(0, 3).join('\n---\n');
  return recent.length > 2000 ? recent.slice(0, 2000) + '\n...[truncated]' : recent;
}

/** Extract the date from the most recent session log entry. */
function extractLastUpdatedDate(sessionLogContent: string): string {
  const match = sessionLogContent.match(/SESSION:\s*([\w]+\s+\d+,?\s*\d{4})/);
  return match ? match[1].trim() : 'unknown';
}

/** Compute cold leads from the pipeline (stale, non-dead). */
function computeColdLeads(pipelineContent: string): Array<{ name: string; daysAgo: number; nextStep: string | null }> {
  try {
    const { result } = parsePipeline(pipelineContent);
    const today = Date.now();
    return result.data
      .filter((l) => {
        const dead = l.stage.toLowerCase().includes('dead') || l.stage.toLowerCase().includes('complet');
        return !dead && l.isStale;
      })
      .map((l) => ({
        name: l.name,
        daysAgo: l.lastContact
          ? Math.round((today - l.lastContact.getTime()) / (1000 * 60 * 60 * 24))
          : 99,
        nextStep: l.nextStep,
      }))
      .sort((a, b) => b.daysAgo - a.daysAgo)
      .slice(0, 5);
  } catch {
    return [];
  }
}

// ─── Claude prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the chief of staff for Fritz, founder of BUBA Bureka — a kosher bureka bakery at 193 Bleecker St, NYC (opened April 2025). His partners: Gadi Peleg (operations) and Ben Siman Tov (marketing/social, ~500K Instagram).

You are generating Fritz's morning briefing. Your job is to make him more effective today.

Rules:
- Be ruthlessly specific. Reference real names, companies, and deadlines from the files.
- Be opinionated. Pick what matters most — do not list everything.
- Each top item must be a concrete action Fritz can START in under 5 minutes.
- The advisor question should surface something Fritz is avoiding or hasn't thought about today.
- Tone: direct, warm, like a trusted advisor who has read everything.
- Do NOT use vague language like "follow up on your leads" — name the specific person and situation.

Respond ONLY with valid JSON. No other text:
{
  "top_items": [
    "Specific action Fritz should take, naming the person and situation"
  ],
  "advisor_question": "One sharp question, max 160 chars",
  "projects_blocker": "One sentence on the single most urgent stalled or blocked project situation, or null"
}

top_items: exactly 3–5, ordered by urgency. Most critical first.`;

interface BriefingContent {
  top_items: string[];
  advisor_question: string;
  projects_blocker: string | null;
}

async function generateBriefingContent(
  fileContext: string,
  today: string
): Promise<BriefingContent> {
  const userMessage = `Today is ${today}.\n\n${fileContext}\n\nGenerate the morning briefing now.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned) as BriefingContent;
}

// ─── Email HTML ───────────────────────────────────────────────────────────────

function buildEmailHtml(
  content: BriefingContent,
  coldLeads: Array<{ name: string; daysAgo: number; nextStep: string | null }>,
  lastUpdated: string,
  dateLabel: string
): string {
  const topItemsHtml = content.top_items
    .map(
      (item, i) => `
      <tr>
        <td style="padding:0 0 14px 0;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="width:28px;vertical-align:top;padding-top:1px;">
                <span style="display:inline-block;width:22px;height:22px;background:#000000;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#ffffff;">${i + 1}</span>
              </td>
              <td style="font-size:15px;color:#111111;line-height:1.5;font-weight:500;">${escapeHtml(item)}</td>
            </tr>
          </table>
        </td>
      </tr>`
    )
    .join('');

  const coldLeadsHtml = coldLeads.length > 0
    ? coldLeads
        .map(
          (l) => `
          <tr>
            <td style="padding:0 0 10px 0;">
              <span style="font-size:14px;font-weight:600;color:#111111;">${escapeHtml(l.name)}</span>
              <span style="font-size:13px;color:#888888;margin-left:8px;">— ${l.daysAgo}d ago${l.nextStep ? ` · ${escapeHtml(l.nextStep.slice(0, 60))}${l.nextStep.length > 60 ? '…' : ''}` : ' · no next step'}</span>
            </td>
          </tr>`
        )
        .join('')
    : `<tr><td style="font-size:13px;color:#aaaaaa;padding-bottom:8px;">No stale leads right now. Nice.</td></tr>`;

  const projectsBlockerHtml = content.projects_blocker
    ? `
      <tr>
        <td style="padding:20px 0 0 0;border-top:1px solid #eeeeee;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999999;">ON THE RADAR</p>
          <p style="margin:0;font-size:14px;color:#555555;line-height:1.5;">${escapeHtml(content.projects_blocker)}</p>
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BUBA Morning Briefing</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
<tr><td align="center" style="padding:32px 16px;">

<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="padding:28px 32px 24px;border-bottom:1px solid #eeeeee;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999999;">BUBA Command Center</p>
      <p style="margin:0;font-size:22px;font-weight:700;color:#000000;">${escapeHtml(dateLabel)}</p>
    </td>
  </tr>

  <!-- Today section -->
  <tr>
    <td style="padding:24px 32px 8px;">
      <p style="margin:0 0 18px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999999;">TODAY</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${topItemsHtml}
      </table>
    </td>
  </tr>

  <!-- Cold leads -->
  <tr>
    <td style="padding:0 32px 24px;">
      <div style="height:1px;background:#eeeeee;margin:8px 0 20px;"></div>
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999999;">GOING COLD</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${coldLeadsHtml}
      </table>
    </td>
  </tr>

  <!-- Advisor question -->
  <tr>
    <td style="padding:0 32px 24px;">
      <div style="background:#f8f8f8;border-left:4px solid #000000;border-radius:0 8px 8px 0;padding:18px 20px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999999;">TODAY'S QUESTION</p>
        <p style="margin:0;font-size:16px;font-weight:500;color:#000000;line-height:1.6;">${escapeHtml(content.advisor_question)}</p>
      </div>
    </td>
  </tr>

  ${projectsBlockerHtml ? `<tr><td style="padding:0 32px 20px;">${projectsBlockerHtml}</td></tr>` : ''}

  <!-- Dashboard CTA -->
  <tr>
    <td style="padding:8px 32px 32px;text-align:center;border-top:1px solid #eeeeee;">
      <div style="height:20px;"></div>
      <a href="https://central-command-ruby.vercel.app" style="display:inline-block;padding:14px 32px;background:#000000;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;letter-spacing:0.3px;">Open Dashboard →</a>
      <p style="margin:20px 0 0;font-size:12px;color:#bbbbbb;">Files last updated ${escapeHtml(lastUpdated)} · Reply to this email or run Cowork to update</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Verify cron secret — Vercel Pro passes this automatically, or we check manually
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Validate required env vars
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json(
      { error: 'GOOGLE_REFRESH_TOKEN not set. Visit /api/auth/token while logged in.' },
      { status: 500 }
    );
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set.' }, { status: 500 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set.' }, { status: 500 });
  }

  // 1. Fetch all files from Drive (no Fritz login needed)
  let files: Array<{ name: string; content: string }>;
  try {
    files = await fetchAllFilesServerSide();
  } catch (err) {
    return NextResponse.json(
      { error: `Drive read failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files found in Drive folder.' }, { status: 404 });
  }

  const getFile = (name: string) => files.find((f) => f.name === name)?.content ?? '';

  // 2. Build focused context for Claude — extract only the relevant sections
  const actionItemsRaw = extractOpenActionItems(getFile('action_items.md'));
  const pipelineRaw = extractActivePipeline(getFile('collab_pipeline.md'));
  const projectsRaw = extractActiveProjects(getFile('projects.md'));
  const sessionLogRaw = extractRecentSessions(getFile('session_log.md'));
  const crmRaw = getFile('crm.md').slice(0, 2000);
  const decisionsRaw = getFile('decisions_log.md').slice(0, 1500);

  const fileContext = [
    `--- action_items.md (open items only) ---\n${actionItemsRaw}`,
    `--- collab_pipeline.md (active only) ---\n${pipelineRaw}`,
    `--- projects.md (active only) ---\n${projectsRaw}`,
    `--- session_log.md (recent sessions) ---\n${sessionLogRaw}`,
    `--- crm.md (excerpt) ---\n${crmRaw}`,
    `--- decisions_log.md (excerpt) ---\n${decisionsRaw}`,
  ].join('\n\n');

  // 3. Compute cold leads programmatically (more reliable than Claude doing date math)
  const coldLeads = computeColdLeads(getFile('collab_pipeline.md'));

  // 4. Get last-updated date from session log
  const lastUpdated = extractLastUpdatedDate(getFile('session_log.md'));

  // 5. Generate briefing content with Claude Sonnet
  const today = todayLabel();
  let briefing: BriefingContent;
  try {
    briefing = await generateBriefingContent(fileContext, today);
  } catch (err) {
    return NextResponse.json(
      { error: `AI generation failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  // 6. Build email HTML
  const emailHtml = buildEmailHtml(briefing, coldLeads, lastUpdated, todayLabel());
  const subject = `BUBA — ${todayShort()} · ${briefing.top_items.length} things need you today`;

  // 7. Send via Resend
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddress = process.env.RESEND_FROM ?? 'onboarding@resend.dev';

  try {
    await resend.emails.send({
      from: `BUBA Command Center <${fromAddress}>`,
      to: ['fritz@bubabureka.com'],
      subject,
      html: emailHtml,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Email send failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, subject, topItems: briefing.top_items.length });
}
