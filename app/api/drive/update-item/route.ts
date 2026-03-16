import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchFileForUpdate, updateFileContent, invalidateFileCache } from '@/lib/drive';

// Mirrors the makeId function in lib/parsers/action-items.ts
function makeId(title: string, dueRaw: string | null): string {
  return `${title.slice(0, 30)}-${dueRaw ?? 'none'}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
}

/**
 * PATCH /api/drive/update-item
 * Body: { itemId: string, completed: boolean }
 *
 * Finds the matching checkbox line in action_items.md by re-deriving its id,
 * flips - [ ] to - [x] or vice-versa, and writes the file back to Drive.
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

  let itemId: string;
  let completed: boolean;
  try {
    const body = await request.json();
    itemId = body.itemId;
    completed = body.completed;
    if (!itemId || typeof completed !== 'boolean') throw new Error('invalid');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const { fileId, content } = await fetchFileForUpdate(accessToken, 'action_items.md');

    const lines = content.split('\n');
    const newLines: string[] = [];
    let matched = false;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const titleMatch = line.match(/^(-\s+\[)[ xX](\]\s+\*\*(.+?)\*\*.*)/);

      if (titleMatch) {
        const rawTitle = titleMatch[3];

        // Collect sub-lines to find Due:
        const subStart = i + 1;
        let j = subStart;
        while (j < lines.length) {
          const sub = lines[j];
          if (/^-\s+\[[ xX]\]/.test(sub) || /^#/.test(sub) || /^---/.test(sub)) break;
          j++;
        }

        const fullText = lines.slice(subStart, j).join('\n');

        let dueRaw: string | null = null;
        const dueMatch =
          fullText.match(/(?:^|\n)\s*-?\s*\*?Due:\*?\s*(.+?)(?:\n|$)/i) ??
          fullText.match(/Due:\s*(.+?)(?:\n|$)/i);
        if (dueMatch) dueRaw = dueMatch[1].trim();
        if (!dueRaw) {
          if (/overdue/i.test(rawTitle)) dueRaw = 'OVERDUE';
          else if (/today/i.test(rawTitle)) dueRaw = 'TODAY';
        }

        const computedId = makeId(rawTitle, dueRaw);

        if (computedId === itemId) {
          // Flip the checkbox
          const newStatus = completed ? 'x' : ' ';
          newLines.push(line.replace(/^(-\s+\[)[ xX](\].*)/, `$1${newStatus}$2`));
          // Push sub-lines unchanged
          for (let k = subStart; k < j; k++) {
            newLines.push(lines[k]);
          }
          matched = true;
          i = j;
          continue;
        }

        // Not a match — push line and advance; sub-lines will be pushed naturally
      }

      newLines.push(line);
      i++;
    }

    if (!matched) {
      return NextResponse.json({ error: 'Item not found in file' }, { status: 404 });
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
    invalidateFileCache('action_items.md');

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const e = err as { code?: number; status?: number; message?: string };
    if (e.code === 401 || e.status === 401) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
