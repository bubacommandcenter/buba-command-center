'use client';

export default function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-500/10 border border-red-500/25 px-4 py-3 text-sm text-red-400">
      {message}
    </div>
  );
}
