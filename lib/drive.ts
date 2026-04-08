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

// Tracks subfolder path -> folderId to avoid repeated lookups
const subfolderIdCache = new Map<string, string>(); // 'parentId/name' -> folderId

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

const PROFILE_NOTES_FILE = 'profile_notes.md';

/**
 * Append a Q&A entry to profile_notes.md (creates the file if it doesn't exist).
 * The file is picked up automatically by fetchAllMarkdownFiles on the next question generation.
 */
export async function appendProfileNote(
  accessToken: string,
  questionText: string,
  answerText: string,
  dateStr: string
): Promise<void> {
  const drive = getDriveClient(accessToken);

  // Check if the file already exists
  const listRes = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and name = '${PROFILE_NOTES_FILE}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  const existing = (listRes.data.files ?? [])[0];

  const newEntry = `**Q: ${questionText}**\nA: ${answerText}\n\n`;

  if (existing?.id) {
    // Read current content and append
    const fileRes = await drive.files.get(
      { fileId: existing.id, alt: 'media' },
      { responseType: 'text' }
    );
    const current = typeof fileRes.data === 'string' ? fileRes.data : JSON.stringify(fileRes.data);

    // Insert under a date section header — add header if it doesn't exist for this date
    const sectionHeader = `## ${dateStr}\n\n`;
    const newContent = current.includes(sectionHeader)
      ? current + newEntry
      : current.trimEnd() + '\n\n' + sectionHeader + newEntry;

    await drive.files.update({
      fileId: existing.id,
      media: { mimeType: 'text/plain', body: newContent },
    });
    fileIdMap.set(PROFILE_NOTES_FILE, existing.id);
    invalidateFileCache(PROFILE_NOTES_FILE);
  } else {
    // Create new file
    const initialContent = `# Profile Notes\n\nAnswers to AI-generated questions, used to build context for future sessions.\n\n## ${dateStr}\n\n${newEntry}`;
    const createRes = await drive.files.create({
      requestBody: {
        name: PROFILE_NOTES_FILE,
        parents: [FOLDER_ID],
        mimeType: 'text/plain',
      },
      media: { mimeType: 'text/plain', body: initialContent },
      fields: 'id',
    });
    if (createRes.data.id) {
      fileIdMap.set(PROFILE_NOTES_FILE, createRes.data.id);
    }
  }
}

async function findSubfolder(
  drive: ReturnType<typeof getDriveClient>,
  parentId: string,
  name: string
): Promise<string | null> {
  const key = `${parentId}/${name}`;
  if (subfolderIdCache.has(key)) return subfolderIdCache.get(key)!;
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  });
  const folder = (res.data.files ?? [])[0];
  if (!folder?.id) return null;
  subfolderIdCache.set(key, folder.id);
  return folder.id;
}

/**
 * Fetch all .md files from nested subfolders within FOLDER_ID.
 * subfolderPaths: e.g. [['collabs', 'active'], ['collabs', 'confirmed']]
 * Returns each file with its content and the folderPath it came from.
 */
export async function fetchFilesFromSubfolders(
  accessToken: string,
  subfolderPaths: string[][]
): Promise<Array<{ name: string; content: string; folderPath: string }>> {
  const drive = getDriveClient(accessToken);
  const results: Array<{ name: string; content: string; folderPath: string }> = [];

  for (const pathParts of subfolderPaths) {
    let currentId = FOLDER_ID;
    let valid = true;
    for (const part of pathParts) {
      const subfolderId = await findSubfolder(drive, currentId, part);
      if (!subfolderId) { valid = false; break; }
      currentId = subfolderId;
    }
    if (!valid) continue;

    const folderPath = pathParts.join('/');
    const listRes = await drive.files.list({
      q: `'${currentId}' in parents and trashed = false`,
      fields: 'files(id, name, modifiedTime)',
      pageSize: 50,
    });

    const mdFiles = (listRes.data.files ?? []).filter(f => f.name?.endsWith('.md'));

    for (const file of mdFiles) {
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
      results.push({ name: file.name, content, folderPath });
    }
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
