import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchMarkdownFiles } from '@/lib/drive';
import { parseActionItems } from '@/lib/parsers/action-items';
import { parseProjects } from '@/lib/parsers/projects';
import { parsePipeline } from '@/lib/parsers/pipeline';
import type { DashboardData } from '@/lib/types';

export async function GET() {
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

  let files: Awaited<ReturnType<typeof fetchMarkdownFiles>>;

  try {
    files = await fetchMarkdownFiles(accessToken);
  } catch (err) {
    return NextResponse.json(
      { error: `Google Drive unreachable: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  // Parse action items
  const actionItemsFile = files['action_items.md'];
  let actionItems: DashboardData['actionItems'];
  if (actionItemsFile.error) {
    actionItems = { data: [], error: actionItemsFile.error, valid: false };
  } else {
    try {
      actionItems = parseActionItems(actionItemsFile.content);
    } catch (err) {
      actionItems = {
        data: [],
        error: `Could not read action_items.md: ${(err as Error).message}`,
        valid: false,
      };
    }
  }

  // Parse projects
  const projectsFile = files['projects.md'];
  let projects: DashboardData['projects'];
  if (projectsFile.error) {
    projects = { data: [], error: projectsFile.error, valid: false };
  } else {
    try {
      projects = parseProjects(projectsFile.content);
    } catch (err) {
      projects = {
        data: [],
        error: `Could not read projects.md: ${(err as Error).message}`,
        valid: false,
      };
    }
  }

  // Parse pipeline
  const pipelineFile = files['collab_pipeline.md'];
  let pipeline: DashboardData['pipeline'];
  let pipelineStages: string[] = [];
  if (pipelineFile.error) {
    pipeline = { data: [], error: pipelineFile.error, valid: false };
  } else {
    try {
      const { result, stages } = parsePipeline(pipelineFile.content);
      pipeline = result;
      pipelineStages = stages;
    } catch (err) {
      pipeline = {
        data: [],
        error: `Could not read collab_pipeline.md: ${(err as Error).message}`,
        valid: false,
      };
    }
  }

  const response: DashboardData = {
    actionItems,
    projects,
    pipeline,
    pipelineStages,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
