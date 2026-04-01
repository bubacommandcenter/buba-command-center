/**
 * Server-side Google Drive client.
 *
 * Uses GOOGLE_REFRESH_TOKEN stored as an env var — does NOT require Fritz
 * to be logged in. This is what makes autonomous features (morning email,
 * cron jobs) possible.
 *
 * Setup: Fritz visits /api/auth/token while logged in, copies the refresh
 * token, and adds it to Vercel env vars as GOOGLE_REFRESH_TOKEN.
 */

import { google } from 'googleapis';

const FOLDER_ID = process.env.DRIVE_FOLDER_ID!;

function getServerDriveClient() {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'GOOGLE_REFRESH_TOKEN is not set. Visit /api/auth/token while logged in to get it.'
    );
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
  );

  // The googleapis library automatically refreshes the access token
  // using the refresh token whenever needed.
  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return google.drive({ version: 'v3', auth });
}

const EXCLUDE_NAMES = /prompt|readme|setup/i;

/**
 * Fetch all .md files from the Drive folder for the morning briefing.
 * No Fritz session required.
 */
export async function fetchAllFilesServerSide(): Promise<Array<{ name: string; content: string }>> {
  const drive = getServerDriveClient();

  const listRes = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 50,
  });

  const files = (listRes.data.files ?? []).filter(
    (f) => f.name?.endsWith('.md') && !EXCLUDE_NAMES.test(f.name ?? '')
  );

  const results: Array<{ name: string; content: string }> = [];

  for (const file of files) {
    if (!file.id || !file.name) continue;
    try {
      const fileRes = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'text' }
      );
      const content =
        typeof fileRes.data === 'string' ? fileRes.data : JSON.stringify(fileRes.data);
      results.push({ name: file.name, content });
    } catch {
      // Skip unreadable files — briefing continues with what we have
      continue;
    }
  }

  return results;
}
