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
