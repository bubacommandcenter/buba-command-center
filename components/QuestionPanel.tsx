'use client';

import { useState, useCallback } from 'react';
import { Question, formatQuestionsForEmail } from '@/lib/questions';

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-4 12h6a2 2 0 002-2v-8a2 2 0 00-2-2h-6a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function QuestionCard({
  question,
  onRefetch,
}: {
  question: Question;
  onRefetch?: () => void;
}) {
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActionable = question.action.type === 'update-lead-nextstep';

  const handleSave = useCallback(async () => {
    if (question.action.type !== 'update-lead-nextstep') return;
    if (!editValue.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/drive/update-lead', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: question.action.leadId, nextStep: editValue.trim() }),
      });

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      }

      setSaved(true);
      onRefetch?.();
    } catch {
      setError("Couldn't save — try again");
    } finally {
      setIsSaving(false);
    }
  }, [question.action, editValue, onRefetch]);

  const priorityDot =
    question.priority === 'high'
      ? 'bg-red-400/70'
      : question.priority === 'medium'
      ? 'bg-amber-400/60'
      : 'bg-white/20';

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-3 space-y-2.5">
      {/* Context + priority */}
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot}`} />
        <span className="text-[10px] text-white/30 font-medium tracking-wide">{question.context}</span>
      </div>

      {/* Question text */}
      <p className="text-[13px] text-white/70 leading-snug pl-3.5">
        {question.text}
      </p>

      {/* Actionable: inline next-step input */}
      {isActionable && !saved && (
        <div className="pl-3.5 space-y-2">
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="Type next step..."
            disabled={isSaving}
            rows={2}
            className="w-full px-2 py-1.5 text-[11px] bg-white/10 border border-white/20 rounded text-white placeholder-white/30 focus:outline-none focus:border-white/40 disabled:opacity-50 resize-none"
          />
          <div className="flex items-center justify-between">
            {error && <p className="text-[10px] text-red-400">{error}</p>}
            <button
              onClick={handleSave}
              disabled={isSaving || !editValue.trim()}
              className="ml-auto text-[10px] px-2.5 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-40 transition-colors"
            >
              {isSaving ? 'Saving…' : 'Save next step'}
            </button>
          </div>
        </div>
      )}

      {/* Saved confirmation */}
      {isActionable && saved && (
        <p className="pl-3.5 text-[11px] text-green-400/70">Saved.</p>
      )}
    </div>
  );
}

interface Props {
  questions: Question[];
  onRefetch?: () => void;
}

export default function QuestionPanel({ questions, onRefetch }: Props) {
  const [copied, setCopied] = useState(false);

  if (questions.length === 0) return null;

  const handleCopy = () => {
    const text = formatQuestionsForEmail(questions);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🤔</span>
          <h2 className="text-sm font-semibold text-white">Questions</h2>
          <span className="text-[10px] font-bold text-white/40 bg-white/10 px-1.5 py-0.5 rounded">
            {questions.length}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors"
          title="Copy all as email"
        >
          <CopyIcon />
          {copied ? 'Copied!' : 'Copy for email'}
        </button>
      </div>

      {/* Questions list */}
      <div className="space-y-2.5">
        {questions.map((q) => (
          <QuestionCard key={q.id} question={q} onRefetch={onRefetch} />
        ))}
      </div>

      {/* Footer hint */}
      <p className="text-[10px] text-white/15 mt-3 pl-1">
        Answers to pipeline questions save directly. Others: copy and email yourself.
      </p>
    </div>
  );
}
