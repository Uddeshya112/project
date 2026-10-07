import React, { useMemo, useState } from 'react';
import { Check, Inbox } from 'lucide-react';
import { useTimetable } from '../../context/TimetableContext';

export function RequestsView() {
  const { notifications, markNotificationRead } = useTimetable();
  const [filter, setFilter] = useState<'All' | 'Unread' | 'Read'>('All');
  const [markingId, setMarkingId] = useState<string | null>(null);

  const requests = useMemo(
    () => notifications.filter(n => n.type === 'makeup_request' || n.type === 'approval_needed'),
    [notifications],
  );
  const filtered = requests.filter(n => filter === 'All' || (filter === 'Unread' ? !n.read : n.read));
  const unreadCount = requests.filter(n => !n.read).length;

  const handleMarkRead = async (id: string) => {
    setMarkingId(id);
    await markNotificationRead(id);
    setMarkingId(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 font-sans pb-12">
      <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-[#8C1B2E] dark:text-red-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <Inbox className="h-4 w-4" aria-hidden="true" />
          <span>Operations</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
          Requests
        </h1>
        <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-1">
          Server-backed make-up requests and approval items. Changes are persisted to your account.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-stone-500 dark:text-zinc-400">
          {requests.length} request{requests.length === 1 ? '' : 's'} · {unreadCount} unread
        </div>
        <div className="flex bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 p-1 rounded-xl text-xs font-semibold">
          {(['All', 'Unread', 'Read'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filter === f
                  ? 'bg-[#8C1B2E] text-white shadow-xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl text-center">
          <Check className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
          <div className="text-sm font-bold text-stone-900 dark:text-zinc-100">No matching requests</div>
          <div className="text-xs text-stone-500 dark:text-zinc-400 mt-1">New requests will appear here automatically.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(n => (
            <div
              key={n.id}
              className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
            >
              <div className="space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-stone-900 dark:text-zinc-100 text-sm font-serif">{n.title}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    n.read
                      ? 'bg-stone-100 text-stone-600 border border-[#E5E2D9] dark:bg-zinc-800 dark:text-zinc-400'
                      : 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                  }`}>
                    {n.read ? 'Read' : 'New'}
                  </span>
                </div>
                <div className="text-stone-700 dark:text-zinc-300">{n.message}</div>
                <div className="text-[11px] text-stone-500 dark:text-zinc-400">{new Date(n.timestamp).toLocaleString()}</div>
              </div>

              {!n.read && (
                <button
                  onClick={() => handleMarkRead(n.id)}
                  disabled={markingId !== null}
                  className="shrink-0 px-3.5 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-stone-700 dark:text-zinc-300 text-xs font-semibold hover:border-stone-400 disabled:opacity-50 flex items-center gap-1"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{markingId === n.id ? 'Saving…' : 'Mark as read'}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
