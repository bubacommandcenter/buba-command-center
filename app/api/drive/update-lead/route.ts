import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchFileForUpdate, updateFileContent, invalidateFileCache } from '@/lib/drive';

// Mirrors the makeId function in lib/parsers/pipeline.ts
function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

/**
 * PATCH /api/drive/update-lead
 * Body: { leadId: string, nextStep: string }
 *
 * Finds the matching lead entry in collab_pipeline.md by ID (derived from name),
 * updates or creates the **Next Action:** field, and writes the file back to Drive.
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accessToken = (session as { accessToken?: string }).accessToken;
  if (!accessToken) {
    return NextResponse.json(
      { error: 'No access token in session. Please sign out and sign in again.' },
      { status: 401 }
    );
  }

  let leadId: string;
  let nextStep: string;
  try {
    const body = await request.json();
    leadId = body.leadId;
    nextStep = body.nextStep;
    if (!leadId || typeof nextStep !== 'string') throw new Error('invalid');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const { fileId, content } = await fetchFileForUpdate(accessToken, 'collab_pipeline.md');

    const lines = content.split('\n');
    const newLines: string[] = [];
    let matched = false;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const leadMatch = line.match(/^### (.+?)(?:\s+—|$)/);

      if (leadMatch) {
        const rawName = leadMatch[1].trim();
        const computedId = makeId(rawName);

        // Collect sub-lines until the next ### entry or end of file
        const subStart = i + 1;
        let j = subStart;
        while (j < lines.length && !/^###/.test(lines[j])) {
          j++;
        }

        const bodyLines = lines.slice(subStart, j);

        if (computedId === leadId) {
          // Found the lead! Now update or create the Next Action field
          let foundNextAction = false;
          const updatedBodyLines: string[] = [];

          for (const bodyLine of bodyLines) {
            if (/^\s*-\s*\*\*Next Action:\*\*/i.test(bodyLine)) {
              // Replace existing Next Action line
              updatedBodyLines.push(`- **Next Action:** ${nextStep}`);
              foundNextAction = true;
            } else {
              updatedBodyLines.push(bodyLine);
            }
          }

          // If no Next Action field was found, add it after the first field
          if (!foundNextAction && updatedBodyLines.length > 0) {
            // Insert after the first line (usually Stage or Contact)
            updatedBodyLines.splice(1, 0, `- **Next Action:** ${nextStep}`);
          }

          // Push the lead heading
          newLines.push(line);
          // Push updated body
          newLines.push(...updatedBodyLines);
          matched = true;
          i = j;
          continue;
        }

        // Not a match — push the lead heading and sub-lines unchanged
        newLines.push(line);
        for (const bodyLine of bodyLines) {
          newLines.push(bodyLine);
        }
        i = j;
        continue;
      }

      // Not a lead heading — push line as-is
      newLines.push(line);
      i++;
    }

    if (!matched) {
      return NextResponse.json({ error: 'Lead not found in file' }, { status: 404 });
    }

    const newContent = newLines.join('\n');

    try {
      await updateFileContent(accessToken, fileId, newContent);
    } catch (err: unknown) {
      const e = err as { code?: number; status?: number; message?: string };
      if (e.code === 409 || e.status === 409) {
        return NextResponse.json({ error: 'conflict' }, { status: 409 });
      }
      if (e.code === 401 || e.status === 401) {
        return NextResponse.json({ error: 'Token expired' }, { status: 401 });
      }
      throw err;
    }

    // Invalidate cache so next poll gets fresh data
    invalidateFileCache('collab_pipeline.md');

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const e = err as { code?: number; status?: number; message?: string };
    if (e.code === 401 || e.status === 401) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
