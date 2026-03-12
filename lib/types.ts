// Shared TypeScript types for BUBA Command Center

export type ActionItem = {
  id: string;
  title: string;
  owner: string | null;
  dueDate: Date | null;
  isOverdue: boolean;
  isDueToday: boolean;
  priority: 'high' | 'medium' | 'low' | null;
  context: string | null;
  status: 'open' | 'complete';
  project: string | null;
};

export type Project = {
  id: string;
  name: string;
  status: 'active' | 'on-hold' | 'complete' | 'blocked';
  priority: 'high' | 'medium' | 'low';
  startDate: Date | null;
  targetDate: Date | null;
  nextAction: string | null;
  owner: string | null;
  notes: string | null;
};

export type PipelineLead = {
  id: string;
  name: string;
  type: 'catering' | 'office-drop' | 'influencer' | 'pop-up' | 'other';
  stage: string;
  lastContact: Date | null;
  isStale: boolean;
  nextStep: string | null;
  notes: string | null;
  owner: string | null;
};

export type ParseResult<T> = {
  data: T[];
  error: string | null;
  valid: boolean;
};

export type DashboardData = {
  actionItems: ParseResult<ActionItem>;
  projects: ParseResult<Project>;
  pipeline: ParseResult<PipelineLead>;
  pipelineStages: string[];
  fetchedAt: string;
};
