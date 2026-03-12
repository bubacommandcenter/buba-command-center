'use client';

export default function LoadingState() {
  return (
    <div className="min-h-screen bg-gray-950 p-4 animate-pulse">
      <div className="h-10 bg-gray-800 rounded mb-6 w-64" />
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Today skeleton */}
        <div className="w-full lg:w-72 shrink-0 space-y-3">
          <div className="h-6 bg-gray-800 rounded w-32" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-800 rounded-xl" />
          ))}
        </div>
        {/* Main area skeleton */}
        <div className="flex-1 space-y-4">
          <div className="h-6 bg-gray-800 rounded w-40" />
          <div className="h-48 bg-gray-800 rounded-xl" />
          <div className="h-6 bg-gray-800 rounded w-40" />
          <div className="h-64 bg-gray-800 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
