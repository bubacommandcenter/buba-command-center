'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import type { DashboardData } from '@/lib/types';
import TodayPanel from './TodayPanel';
import HorizonPanel from './HorizonPanel';
import PipelinePanel from './PipelinePanel';
import LoadingState from './LoadingState';
import ErrorBanner from './ErrorBanner';
import NudgeBanner from './NudgeBanner';
import QuestionPanel from './QuestionPanel';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function Dashboard() {
  const { data: session } = useSession();
  const isMobile = useIsMobile();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setFetchError(null);

    try {
      const res = await fetch('/api/drive/files');
      if (res.status === 401) {
        // Session expired — redirect to login
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const json: DashboardData = await res.json();

      // Revive Date objects from JSON strings
      json.actionItems.data = json.actionItems.data.map((item) => ({
        ...item,
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
      }));
      json.projects.data = json.projects.data.map((p) => ({
        ...p,
        startDate: p.startDate ? new Date(p.startDate) : null,
        targetDate: p.targetDate ? new Date(p.targetDate) : null,
      }));
      json.pipeline.data = json.pipeline.data.map((l) => ({
        ...l,
        lastContact: l.lastContact ? new Date(l.lastContact) : null,
      }));

      setData(json);
    } catch (err) {
      setFetchError(`Could not reach Google Drive. Retrying in 5 minutes. (${(err as Error).message})`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // Polling
  useEffect(() => {
    const id = setInterval(() => fetchData(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  if (loading) return <LoadingState />;

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#030712]/95 backdrop-blur border-b border-white/[0.07] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">BUBA</h1>
          <span className="text-xs text-white/30 font-medium hidden sm:inline">Command Center</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-white/40 hidden sm:inline">{todayLabel}</span>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            aria-label="Refresh"
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/80 transition-colors disabled:opacity-30"
          >
            <svg
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.13-3.36M20 15a9 9 0 01-14.13 3.36" />
            </svg>
            {data?.fetchedAt && (
              <span className="hidden sm:inline">{formatTime(data.fetchedAt)}</span>
            )}
          </button>

          {session?.user?.name && (
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs text-white/25 hover:text-white/50 transition-colors"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {/* Drive-level error */}
      {fetchError && (
        <div className="px-5 pt-4">
          <ErrorBanner message={fetchError} />
        </div>
      )}

      {/* Nudge banner */}
      {data && (
        <NudgeBanner
          actionItems={data.actionItems.data}
          leads={data.pipeline.data}
          projects={data.projects.data}
        />
      )}

      {/* Main content */}
      {data && (
        <main className="p-4 sm:p-5 flex flex-col lg:flex-row gap-4 lg:items-start">
          {/* TODAY — left sidebar on desktop, first on mobile */}
          <aside className="w-full lg:w-72 lg:shrink-0 lg:sticky lg:top-[57px] lg:max-h-[calc(100vh-73px)] lg:overflow-y-auto">
            <div className="bg-[#0d1117] border border-white/[0.08] rounded-2xl p-5 h-full">
              <TodayPanel
                items={data.actionItems.data}
                error={data.actionItems.error}
                onRefetch={() => fetchData(true)}
                fetchedAt={data.fetchedAt}
              />
            </div>
          </aside>

          {/* Right column: Pipeline + Horizon */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="bg-[#0d1117] border border-white/[0.08] rounded-2xl p-5">
              <PipelinePanel
                leads={data.pipeline.data}
                stages={data.pipelineStages}
                error={data.pipeline.error}
                fetchedAt={data.fetchedAt}
              />
            </div>

            <div className="bg-[#0d1117] border border-white/[0.08] rounded-2xl p-5">
              <HorizonPanel
                projects={data.projects.data}
                error={data.projects.error}
                isMobile={isMobile}
                fetchedAt={data.fetchedAt}
              />
            </div>

            <div className="bg-[#0d1117] border border-white/[0.08] rounded-2xl p-5">
              <QuestionPanel onRefetch={() => fetchData(true)} />
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
