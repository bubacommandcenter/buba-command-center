'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AiQuestion } from '@/app/api/questions/route';

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.13-3.36M20 15a9 9 0 01-14.13 3.36" />
    </svg>
  );
}

function QuestionCard({
  question,
  onAnswered,
}: {
  question: AiQuestion;
  onAnswered: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = answer.trim().length > 0 && !saving && !saved;

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    setSaving(true);
    setError(null);

    if (question.writeBack) {
      try {
        const res = await fetch('/api/drive/answer-question', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: question.writeBack.fileName,
            entryName: question.writeBack.entryName,
            fieldName: question.writeBack.fieldName,
            answer: answer.trim(),
          }),
        });

        if (res.status === 401) { window.location.href = '/login'; return; }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
      } catch (err) {
        setError((err as Error).message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSaved(true);
    onAnswered();
  }, [answer, canSave, question.writeBack, onAnswered]);

  const priorityDot =
    question.priority === 'high' ? 'bg-red-400/70'
    : question.priority === 'medium' ? 'bg-amber-400/60'
    : 'bg-white/20';

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot}`} />
        <span className="text-[10px] text-white/30 font-medium tracking-wide">{question.context}</span>
        {question.writeBack && (
          <span className="text-[10px] text-white/20 ml-auto">saves to {question.writeBack.fileName}</span>
        )}
      </div>

      <p className="text-[13px] text-white/75 leading-snug pl-3.5">{question.text}</p>

      {!saved ? (
        <div className="pl-3.5 space-y-2">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={question.writeBack ? 'Type answer to save to file…' : 'Type your answer…'}
            disabled={saving}
            rows={2}
            className="w-full px-2 py-1.5 text-[11px] bg-white/[0.07] border border-white/[0.12] rounded text-white placeholder-white/25 focus:outline-none focus:border-white/30 disabled:opacity-50 resize-none"
          />
          <div className="flex items-center justify-between">
            {error && <p className="text-[10px] text-red-400 flex-1 mr-2">{error}</p>}
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="ml-auto text-[10px] px-2.5 py-1 rounded bg-white/10 text-white/50 hover:bg-white/15 hover:text-white/70 disabled:opacity-30 transition-colors"
            >
              {saving ? 'Saving…' : question.writeBack ? 'Save to file' : 'Note it'}
            </button>
          </div>
        </div>
      ) : (
        <p className="pl-3.5 text-[11px] text-green-400/60">
          {question.writeBack ? 'Saved to file.' : 'Noted.'}
        </p>
      )}
    </div>
  );
}

interface Props {
  onRefetch?: () => void;
}

export default function QuestionPanel({ onRefetch }: Props) {
  const [questions, setQuestions] = useState<AiQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/questions');
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setQuestions(data.questions ?? []);
      setAnsweredCount(0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  const handleAnswered = useCallback(() => {
    setAnsweredCount((n) => n + 1);
    onRefetch?.();
  }, [onRefetch]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🤔</span>
          <h2 className="text-sm font-semibold text-white">Questions</h2>
          {!loading && questions.length > 0 && (
            <span className="text-[10px] font-bold text-white/40 bg-white/10 px-1.5 py-0.5 rounded">
              {questions.length - answeredCount > 0 ? questions.length - answeredCount : '✓'}
            </span>
          )}
        </div>
        <button
          onClick={loadQuestions}
          disabled={loading}
          className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors disabled:opacity-30"
          title="Regenerate questions"
        >
          <RefreshIcon spinning={loading} />
          {loading ? 'Thinking…' : 'Refresh'}
        </button>
      </div>

      {loading && (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-3 space-y-2.5 animate-pulse">
              <div className="h-2 w-24 bg-white/10 rounded" />
              <div className="h-3 w-full bg-white/10 rounded" />
              <div className="h-3 w-3/4 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="text-[12px] text-red-400/80 bg-red-500/[0.07] border border-red-500/20 rounded-lg px-3 py-2.5">
          {error.includes('ANTHROPIC_API_KEY')
            ? 'Add ANTHROPIC_API_KEY to your Vercel environment variables.'
            : error}
        </div>
      )}

      {!loading && !error && questions.length === 0 && (
        <p className="text-white/30 text-sm">No questions generated — try refreshing.</p>
      )}

      {!loading && !error && questions.length > 0 && (
        <div className="space-y-2.5">
          {questions.map((q) => (
            <QuestionCard key={q.id} question={q} onAnswered={handleAnswered} />
          ))}
        </div>
      )}
    </div>
  );
}
