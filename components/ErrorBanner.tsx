'use client';

export default function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  );
}
