'use client';

import { useState } from 'react';
import { PipelineLead } from '@/lib/types';
import ErrorBanner from './ErrorBanner';

// Collab type → emoji + badge color
const TYPE_META: Record<string, { emoji: string; color: string }> = {
  catering:      { emoji: '🍱', color: 'bg-green-500/15 text-green-400' },
  'office-drop': { emoji: '🍱', color: 'bg-blue-500/15 text-blue-400' },
  influencer:    { emoji: '📸', color: 'bg-purple-500/15 text-purple-400' },
  'pop-up':      { emoji: '🎉', color: 'bg-orange-500/15 text-orange-400' },
  other:         { emoji: '🤝', color: 'bg-white/10 text-white/50' },
};

// Stage → dot color
function stageDotColor(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes('waiting')) return 'bg-amber-400';
  if (s.includes('confirmed')) return 'bg-green-400';
  if (s.includes('conversation') || s.includes('interested')) return 'bg-blue-400';
  if (s.includes('completed')) return 'bg-white/20';
  if (s.includes('dead')) return 'bg-red-400/40';
  return 'bg-white/20';
}

function humanLastContact(d: Date | null): string {
  if (!d) return '–';
  const diffDays = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg
      className={`w-3 h-3 text-white/30 transition-transform duration-200 shrink-0 ${up ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function LeadCard({
  lead,
  isExpanded,
  onToggleExpand,
}: {
  lead: PipelineLead;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const meta = TYPE_META[lead.type] ?? TYPE_META.other;

  return (
    <button
      onClick={onToggleExpand}
      className={`w-full text-left rounded-xl px-3 py-3 space-y-2.5 border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
        lead.isStale
          ? 'bg-amber-500/[0.04] border-amber-500/30'
          : 'bg-white/[0.04] border-white/[0.07]'
      }`}
    >
      {/* Name + stale flag + chevron */}
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[13px] font-semibold text-white leading-snug ${!isExpanded ? 'line-clamp-2' : ''}`}>
          {lead.name}
        </p>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {lead.isStale && (
            <span className="text-[10px] font-bold text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded">
              STALE
            </span>
          )}
          <ChevronIcon up={isExpanded} />
        </div>
      </div>

      {/* Type + last contact */}
      <div className="flex items-center gap-2">
        <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${meta.color}`}>
          {meta.emoji} {lead.type}
        </span>
        <span className="text-[11px] text-white/35">
          {humanLastContact(lead.lastContact)}
        </span>
      </div>

      {/* Next step */}
      {lead.nextStep && (
        <p className={`text-[11px] text-white/50 leading-relaxed ${!isExpanded ? 'line-clamp-2' : ''}`}>
          {lead.nextStep}
        </p>
      )}

      {/* Notes — only visible when expanded */}
      {isExpanded && lead.notes && (
        <p className="text-[11px] text-white/35 leading-relaxed border-t border-white/[0.06] pt-2 mt-1">
          {lead.notes}
        </p>
      )}
    </button>
  );
}

interface Props {
  leads: PipelineLead[];
  stages: string[];
  error: string | null;
}

export default function PipelinePanel({ leads, stages, error }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Only show stages that have at least one lead
  const visibleStages = stages.filter((stage) =>
    leads.some((l) => l.stage.toLowerCase() === stage.toLowerCase())
  );

  const fallbackStages = leads
    .map((l) => l.stage)
    .filter((s, i, arr) => arr.indexOf(s) === i);

  const activeStages = visibleStages.length > 0 ? visibleStages : fallbackStages;

  const staleCount = leads.filter((l) => l.isStale).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🤝</span>
          <h2 className="text-sm font-semibold text-white">Pipeline</h2>
          {staleCount > 0 && (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
              {staleCount} stale
            </span>
          )}
        </div>
        <span className="text-xs text-white/30">{leads.length} leads</span>
      </div>

      {error && <ErrorBanner message="Could not read collab_pipeline.md. Check file format." />}

      {!error && leads.length === 0 && (
        <p className="text-white/30 text-sm">No pipeline leads found.</p>
      )}

      {!error && leads.length > 0 && (
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="flex gap-3" style={{ minWidth: `${activeStages.length * 230}px` }}>
            {activeStages.map((stage) => {
              const stageLeads = leads.filter(
                (l) => l.stage.toLowerCase() === stage.toLowerCase()
              );
              const dot = stageDotColor(stage);
              return (
                <div key={stage} className="flex flex-col" style={{ width: '220px' }}>
                  {/* Sticky column header */}
                  <div className="sticky top-0 z-10 flex items-center gap-2 mb-2.5 px-1 bg-[#0d1117] pb-1">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                    <h3 className="text-[11px] font-semibold text-white/60 uppercase tracking-wide truncate">
                      {stage}
                    </h3>
                    <span className="text-[11px] text-white/25 ml-auto">{stageLeads.length}</span>
                  </div>
                  {/* Scrollable card list */}
                  <div className="space-y-2 overflow-y-auto max-h-[600px] pr-0.5">
                    {stageLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        isExpanded={expandedId === lead.id}
                        onToggleExpand={() =>
                          setExpandedId(expandedId === lead.id ? null : lead.id)
                        }
                      />
                    ))}
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
