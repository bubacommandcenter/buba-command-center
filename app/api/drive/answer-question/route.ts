import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchFileForUpdate, updateFileContent, invalidateFileCache } from '@/lib/drive';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accessToken = (session as { accessToken?: string }).accessToken;
  if (!accessToken) return NextResponse.json({ error: 'No access token' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { fileName, entryName, fieldName, answer } = body ?? {};

  if (!fileName || !entryName || !fieldName || answer == null) {
    return NextResponse.json(
      { error: 'fileName, entryName, fieldName, and answer are required' },
      { status: 400 }
    );
  }

  let fileId: string;
  let content: string;
  try {
    ({ fileId, content } = await fetchFileForUpdate(accessToken, fileName));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read file: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  // Find the section for this entry (### entryName ... next ### or end of file)
  const entryPattern = new RegExp(
    `(^### ${escapeRegex(entryName)}[^\\n]*\\n)([\\s\\S]*?)(?=^### |\\z)`,
    'mi'
  );
  const entryMatch = content.match(entryPattern);

  if (!entryMatch) {
    return NextResponse.json(
      { error: `Entry "${entryName}" not found in ${fileName}` },
      { status: 404 }
    );
  }

  const entryHeader = entryMatch[1];
  const entryBody = entryMatch[2];

  // Try to replace an existing field line
  const fieldPattern = new RegExp(
    `(^- \\*\\*${escapeRegex(fieldName)}:\\*\\*\\s*)(.+)$`,
    'mi'
  );

  let newEntryBody: string;
  if (fieldPattern.test(entryBody)) {
    // Replace existing field
    newEntryBody = entryBody.replace(fieldPattern, `$1${answer}`);
  } else {
    // Add field after the first field line, or at the start of the body
    const firstFieldLine = entryBody.match(/^- \*\*[^*]+:\*\*/m);
    if (firstFieldLine && firstFieldLine.index != null) {
      const insertAt = entryBody.indexOf('\n', firstFieldLine.index) + 1;
      newEntryBody =
        entryBody.slice(0, insertAt) +
        `- **${fieldName}:** ${answer}\n` +
        entryBody.slice(insertAt);
    } else {
      newEntryBody = `- **${fieldName}:** ${answer}\n` + entryBody;
    }
  }

  const newContent = content.replace(entryPattern, entryHeader + newEntryBody);

  try {
    await updateFileContent(accessToken, fileId, newContent);
    invalidateFileCache(fileName);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not write file: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
