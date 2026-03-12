'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import type { DashboardData } from '@/lib/types';
import TodayPanel from './TodayPanel';
import HorizonPanel from './HorizonPanel';
import PipelinePanel from './PipelinePanel';
import LoadingState from './LoadingState';
import ErrorBanner from './ErrorBanner';

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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold tracking-tight">BUBA</h1>
          <span className="text-xs text-gray-500 hidden sm:inline">Command Center</span>
        </div>

        <div className="flex items-center gap-3">
          {data?.fetchedAt && (
            <span className="text-xs text-gray-600 hidden sm:inline">
              {formatTime(data.fetchedAt)}
            </span>
          )}

          {refreshing && (
            <span className="inline-block w-4 h-4 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
          )}

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-40 px-2 py-1 rounded-lg border border-gray-800 hover:border-gray-600"
          >
            Refresh
          </button>

          {session?.user?.name && (
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {/* Drive-level error */}
      {fetchError && (
        <div className="px-4 pt-4">
          <ErrorBanner message={fetchError} />
        </div>
      )}

      {/* Main content */}
      {data && (
        <main className="p-4 flex flex-col lg:flex-row gap-4 lg:items-start">
          {/* TODAY — left sidebar on desktop, first on mobile */}
          <aside className="w-full lg:w-72 lg:shrink-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 h-full">
              <TodayPanel
                items={data.actionItems.data}
                error={data.actionItems.error}
              />
            </div>
          </aside>

          {/* Right column: Pipeline + Horizon */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* PIPELINE — second on mobile, top of right col on desktop */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <PipelinePanel
                leads={data.pipeline.data}
                stages={data.pipelineStages}
                error={data.pipeline.error}
              />
            </div>

            {/* HORIZON */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <HorizonPanel
                projects={data.projects.data}
                error={data.projects.error}
                isMobile={isMobile}
              />
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
