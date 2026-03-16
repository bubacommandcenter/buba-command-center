// Google Drive API client — server-side only
import { google } from 'googleapis';

const FOLDER_ID = process.env.DRIVE_FOLDER_ID!;

const TARGET_FILES = [
  'action_items.md',
  'projects.md',
  'collab_pipeline.md',
] as const;

export type DriveFileContent = {
  name: string;
  content: string;
  error: string | null;
};

function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth });
}

// Simple in-memory cache: { fileId+modifiedTime -> content }
const contentCache = new Map<string, string>();

// Tracks fileName -> fileId so we can invalidate the cache after writes
const fileIdMap = new Map<string, string>();

/** Remove all cached content for a given file so the next poll fetches fresh data. */
export function invalidateFileCache(fileName: string): void {
  const fileId = fileIdMap.get(fileName);
  if (!fileId) return;
  Array.from(contentCache.keys())
    .filter((key) => key.startsWith(`${fileId}::`))
    .forEach((key) => contentCache.delete(key));
}

/**
 * Fetch the raw content of a single file by name, bypassing the cache.
 * Returns the fileId so the caller can pass it to updateFileContent.
 */
export async function fetchFileForUpdate(
  accessToken: string,
  fileName: string
): Promise<{ fileId: string; content: string }> {
  const drive = getDriveClient(accessToken);

  // Find the file ID (use cached value if available)
  let fileId = fileIdMap.get(fileName);

  if (!fileId) {
    const listRes = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name = '${fileName}' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1,
    });
    const files = listRes.data.files ?? [];
    if (files.length === 0 || !files[0].id) {
      throw new Error(`File "${fileName}" not found in Drive folder.`);
    }
    fileId = files[0].id;
    fileIdMap.set(fileName, fileId);
  }

  const fileRes = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' }
  );

  const content =
    typeof fileRes.data === 'string'
      ? fileRes.data
      : JSON.stringify(fileRes.data);

  return { fileId, content };
}

/** Write updated content back to a Drive file. */
export async function updateFileContent(
  accessToken: string,
  fileId: string,
  newContent: string
): Promise<void> {
  const drive = getDriveClient(accessToken);
  await drive.files.update({
    fileId,
    media: {
      mimeType: 'text/plain',
      body: newContent,
    },
  });
}

const EXCLUDE_NAMES = /prompt|readme|setup/i;

/** Fetch every .md file in the folder (excluding meta/prompt files). Used by the AI question engine. */
export async function fetchAllMarkdownFiles(
  accessToken: string
): Promise<Array<{ name: string; content: string }>> {
  const drive = getDriveClient(accessToken);

  const listRes = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, modifiedTime)',
    pageSize: 50,
  });

  const files = (listRes.data.files ?? []).filter(
    (f) => f.name?.endsWith('.md') && !EXCLUDE_NAMES.test(f.name ?? '')
  );

  const results: Array<{ name: string; content: string }> = [];

  for (const file of files) {
    if (!file.id || !file.name) continue;
    const cacheKey = `${file.id}::${file.modifiedTime ?? ''}`;
    let content: string;
    if (contentCache.has(cacheKey)) {
      content = contentCache.get(cacheKey)!;
    } else {
      try {
        const fileRes = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'text' }
        );
        content = typeof fileRes.data === 'string' ? fileRes.data : JSON.stringify(fileRes.data);
        contentCache.set(cacheKey, content);
        fileIdMap.set(file.name, file.id);
      } catch {
        continue;
      }
    }
    results.push({ name: file.name, content });
  }

  return results;
}

export async function fetchMarkdownFiles(
  accessToken: string
): Promise<Record<string, DriveFileContent>> {
  const drive = getDriveClient(accessToken);

  // List files in the folder matching our target names
  const listRes = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, modifiedTime)',
    pageSize: 50,
  });

  const files = listRes.data.files ?? [];

  const results: Record<string, DriveFileContent> = {};

  for (const target of TARGET_FILES) {
    const file = files.find((f) => f.name === target);

    if (!file || !file.id) {
      results[target] = {
        name: target,
        content: '',
        error: `File "${target}" not found in Drive folder.`,
      };
      continue;
    }

    // Keep fileName -> fileId mapping up to date for cache invalidation
    fileIdMap.set(target, file.id);

    const cacheKey = `${file.id}::${file.modifiedTime ?? ''}`;

    if (contentCache.has(cacheKey)) {
      results[target] = {
        name: target,
        content: contentCache.get(cacheKey)!,
        error: null,
      };
      continue;
    }

    try {
      const fileRes = await drive.files.get(
        { fileId: file.id!, alt: 'media' },
        { responseType: 'text' }
      );

      const content =
        typeof fileRes.data === 'string'
          ? fileRes.data
          : JSON.stringify(fileRes.data);

      contentCache.set(cacheKey, content);

      results[target] = { name: target, content, error: null };
    } catch (err) {
      results[target] = {
        name: target,
        content: '',
        error: `Failed to read "${target}": ${(err as Error).message}`,
      };
    }
  }

  return results;
}
