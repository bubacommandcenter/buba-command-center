import { NextResponse } from 'next/server';
import { auth } from '@/auth';

/**
 * GET /api/auth/token
 *
 * Temporary route — use once to extract your Google refresh token,
 * then add it to Vercel env vars as GOOGLE_REFRESH_TOKEN.
 *
 * Must be logged in. Returns the refresh token in plain JSON.
 */
export async function GET() {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Not logged in. Sign in first.' }, { status: 401 });
  }

  const refreshToken = (session as { refreshToken?: string }).refreshToken;

  if (!refreshToken) {
    return NextResponse.json(
      {
        error: 'No refresh token found in session.',
        fix: 'Sign out at /login, then sign back in. Google only returns the refresh token on first consent.',
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    refreshToken,
    next: 'Copy this value. Add it to Vercel → Project → Settings → Environment Variables as GOOGLE_REFRESH_TOKEN.',
  });
}
