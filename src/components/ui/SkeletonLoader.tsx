import React from 'react';

interface WorkspaceSkeletonProps {
  label?: string;
}

/**
 * Doherty Threshold skeleton loader: gives immediate spatial structure while
 * session hydration or lazy workspace chunks finish loading.
 */
export function WorkspaceSkeleton({ label = 'Loading your workspace…' }: WorkspaceSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[60vh] w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6 motion-page-enter"
    >
      <div className="space-y-2 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div className="h-3 w-36 rounded-md motion-skeleton" />
        <div className="h-7 w-64 rounded-lg motion-skeleton" />
        <div className="h-3.5 w-80 max-w-full rounded-md motion-skeleton" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="p-4 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/60 space-y-2.5"
          >
            <div className="h-3 w-20 rounded motion-skeleton" />
            <div className="h-7 w-16 rounded-md motion-skeleton" />
            <div className="h-2.5 w-24 rounded motion-skeleton" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-56 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/60 p-4 space-y-3">
          <div className="h-4 w-44 rounded motion-skeleton" />
          <div className="h-10 w-full rounded-lg motion-skeleton" />
          <div className="h-10 w-full rounded-lg motion-skeleton" />
          <div className="h-10 w-5/6 rounded-lg motion-skeleton" />
        </div>
        <div className="h-56 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/60 p-4 space-y-3">
          <div className="h-4 w-32 rounded motion-skeleton" />
          <div className="h-24 w-full rounded-lg motion-skeleton" />
          <div className="h-9 w-full rounded-lg motion-skeleton" />
        </div>
      </div>

      <span className="sr-only">{label}</span>
    </div>
  );
}
