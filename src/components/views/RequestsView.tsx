import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { useTimetable } from '../../context/TimetableContext';

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
};

export function RequestsView() {
  const { notifications, markNotificationRead } = useTimetable();
  const [savingId, setSavingId] = useState<string | null>(null);
  const requests = notifications.filter(item => ['makeup_request', 'approval_needed', 'cancellation'].includes(item.type));

  const markRead = async (id: string) => {
    setSavingId(id);
    try { await markNotificationRead(id); } finally { setSavingId(null); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <header className="border-b border-[#E5E2D9] pb-4 dark:border-zinc-800">
        <h1 className="text-2xl font-serif font-bold text-stone-900 dark:text-zinc-100 sm:text-3xl">Requests & Disruptions</h1>
        <p className="mt-1 text-xs text-stone-500 dark:text-zinc-400">Live request and cancellation notifications from the shared timetable.</p>
      </header>
      {requests.length === 0 ? (
        <div className="rounded-xl border border-[#E5E2D9] bg-[#FAF9F5] p-6 text-center text-xs text-stone-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          No incoming requests or class disruptions.
        </div>
      ) : requests.map(item => (
        <article key={item.id} className="flex flex-col justify-between gap-3 rounded-xl border border-[#E5E2D9] bg-[#FAF9F5] p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-semibold text-stone-900 dark:text-zinc-100">{item.title}</div>
            <p className="mt-1 text-xs text-stone-600 dark:text-zinc-400">{item.message}</p>
            <time className="mt-2 block text-[11px] text-stone-400">{formatTimestamp(item.timestamp)}</time>
          </div>
          {!item.read && <button type="button" onClick={() => void markRead(item.id)} disabled={savingId !== null} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E5E2D9] bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"><Check className="h-3.5 w-3.5" />{savingId === item.id ? 'Saving…' : 'Mark read'}</button>}
        </article>
      ))}
    </div>
  );
}
