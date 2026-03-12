# BUBA Command Center — Setup Guide

**No terminal required. All steps done in the browser.**

---

## What you need before starting

- A Google account (the one you'll log in with)
- Your three markdown files on Google Drive:
  - `action_items.md`
  - `projects.md`
  - `collab_pipeline.md`
- A GitHub account (free)
- A Vercel account (free, sign in with GitHub)

---

## Step 1 — Put your files in a Google Drive folder

1. Go to [drive.google.com](https://drive.google.com)
2. Create a folder called **BUBA Command Center**
3. Upload your three markdown files into that folder
4. Open the folder — copy the folder ID from the URL:
   `https://drive.google.com/drive/folders/`**`THIS_PART_IS_THE_ID`**
5. Save that ID — you'll need it in Step 3

---

## Step 2 — Set up Google OAuth credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project** (top left) → **New Project** → name it `BUBA Command Center` → **Create**
3. In the left menu: **APIs & Services** → **Library**
   - Search for **Google Drive API** → click it → **Enable**
4. In the left menu: **APIs & Services** → **OAuth consent screen**
   - User type: **External** → **Create**
   - App name: `BUBA Command Center`
   - User support email: your email
   - Developer contact: your email
   - Click **Save and Continue** through all steps
   - On the **Test users** step, add your Google email → **Save and Continue**
5. In the left menu: **APIs & Services** → **Credentials**
   - Click **+ Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: `BUBA Command Center`
   - Authorized redirect URIs — add:
     ```
     https://YOUR-VERCEL-URL.vercel.app/api/auth/callback/google
     ```
     (You'll update this after Step 3 — for now add a placeholder)
   - Click **Create**
6. Copy the **Client ID** and **Client Secret** — save them somewhere safe

---

## Step 3 — Deploy to Vercel

1. Go to [github.com](https://github.com) and create a new repository called `buba-command-center`
2. Upload all the project files to that repository (or use GitHub Desktop)
3. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo
4. In **Environment Variables**, add these (all required):

   | Variable | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | From Step 2 |
   | `GOOGLE_CLIENT_SECRET` | From Step 2 |
   | `NEXTAUTH_SECRET` | Any random string (e.g. open [randomkeygen.com](https://randomkeygen.com) and copy a 256-bit key) |
   | `NEXTAUTH_URL` | Your Vercel URL (e.g. `https://buba-command-center.vercel.app`) |
   | `DRIVE_FOLDER_ID` | The folder ID from Step 1 |

5. Click **Deploy**
6. Copy your Vercel URL (e.g. `https://buba-command-center.vercel.app`)

---

## Step 4 — Update Google OAuth redirect URI

1. Go back to Google Cloud Console → **APIs & Services** → **Credentials**
2. Click your OAuth 2.0 Client ID
3. Under **Authorized redirect URIs**, replace the placeholder with:
   ```
   https://YOUR-VERCEL-URL.vercel.app/api/auth/callback/google
   ```
4. Click **Save**

---

## Step 5 — Sign in and verify

1. Visit your Vercel URL
2. Click **Sign in with Google**
3. You'll see a Google warning ("app not verified") — click **Advanced** → **Go to BUBA Command Center (unsafe)**
   - This warning disappears after you submit the app for Google verification (optional, not required for personal use)
4. Grant Drive read access
5. Dashboard loads with your three panels

---

## Updating your files

The dashboard reads directly from Google Drive. To update what it shows:

1. Edit any of the three markdown files in Google Drive
2. Wait up to 5 minutes (auto-refresh interval) or click **Refresh** on the dashboard

---

## Troubleshooting

**"Could not reach Google Drive"**
- Check that your `DRIVE_FOLDER_ID` is correct in Vercel settings
- Make sure the Google Drive API is enabled in Google Cloud Console

**"Could not read [filename]"**
- The file name must match exactly: `action_items.md`, `projects.md`, `collab_pipeline.md`
- Make sure the files are in the correct Drive folder

**Gantt chart not showing**
- Gantt only shows on desktop (screens 1024px+). On mobile you'll see a list view instead.

**Token/auth errors**
- Sign out and sign back in to refresh your Google access token
