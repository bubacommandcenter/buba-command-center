'use client';

import { PipelineLead } from '@/lib/types';
import ErrorBanner from './ErrorBanner';

const TYPE_BADGE: Record<string, string> = {
  catering: 'bg-green-900 text-green-300',
  'office-drop': 'bg-blue-900 text-blue-300',
  influencer: 'bg-purple-900 text-purple-300',
  'pop-up': 'bg-orange-900 text-orange-300',
  other: 'bg-gray-800 text-gray-400',
};

function humanLastContact(d: Date | null): string {
  if (!d) return 'No date';
  const diffDays = Math.round(
    (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function LeadCard({ lead }: { lead: PipelineLead }) {
  return (
    <div
      className={`bg-gray-900 rounded-xl px-3 py-3 space-y-2 border ${
        lead.isStale ? 'border-amber-600' : 'border-gray-800'
      } min-w-[200px]`}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium text-white leading-tight line-clamp-2">
          {lead.name}
        </p>
        {lead.isStale && (
          <span className="text-amber-400 text-xs shrink-0 font-medium">⚠ Stale</span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            TYPE_BADGE[lead.type] ?? TYPE_BADGE.other
          }`}
        >
          {lead.type}
        </span>
        <span className="text-xs text-gray-500">
          {humanLastContact(lead.lastContact)}
        </span>
      </div>

      {lead.nextStep && (
        <p className="text-xs text-gray-400 line-clamp-2">{lead.nextStep}</p>
      )}
    </div>
  );
}

interface Props {
  leads: PipelineLead[];
  stages: string[];
  error: string | null;
}

export default function PipelinePanel({ leads, stages, error }: Props) {
  // Only show stages that have at least one lead
  const stagesWithLeads = stages.filter((stage) =>
    leads.some((l) => l.stage.toLowerCase() === stage.toLowerCase())
  );

  // Fallback: include all stages from leads if none matched
  const visibleStages =
    stagesWithLeads.length > 0
      ? stagesWithLeads
      : leads.map((l) => l.stage).filter((s, i, arr) => arr.indexOf(s) === i);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold tracking-widest uppercase text-gray-400">
          Pipeline
        </h2>
        <span className="text-xs text-gray-500">{leads.length} leads</span>
      </div>

      {error && <ErrorBanner message="Could not read collab_pipeline.md. Check file format." />}

      {!error && leads.length === 0 && (
        <p className="text-gray-500 text-sm">No pipeline leads found.</p>
      )}

      {!error && leads.length > 0 && (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3" style={{ minWidth: `${visibleStages.length * 220}px` }}>
            {visibleStages.map((stage) => {
              const stageLeads = leads.filter(
                (l) => l.stage.toLowerCase() === stage.toLowerCase()
              );
              return (
                <div key={stage} className="flex flex-col" style={{ width: '210px' }}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide truncate">
                      {stage}
                    </h3>
                    <span className="text-xs text-gray-600 ml-1">{stageLeads.length}</span>
                  </div>
                  <div className="space-y-2">
                    {stageLeads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} />
                    ))}
                    {stageLeads.length === 0 && (
                      <div className="h-16 rounded-xl border border-dashed border-gray-800" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
