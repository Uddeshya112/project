import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import { useAuth } from '../../context/AuthContext';
import { History, Lock, RotateCcw, FileCheck2, Layers } from 'lucide-react';

export function GovernanceView() {
  const { versions, auditLogs, sessions, courses, academicYear, activeVersionNumber, restoreVersion } = useTimetable();
  const { currentUser } = useAuth();
  const canEdit = ['COORDINATOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(currentUser?.roleCode ?? '');
  const [restoring, setRestoring] = useState<number | null>(null);

  const lockedSessions = sessions.filter(s => s.isLocked);
  const slotLabel = (id: string) => academicYear.timeSlots.find(t => t.id === id)?.label ?? id;

  const handleRestore = async (versionNumber: number) => {
    setRestoring(versionNumber);
    await restoreVersion(versionNumber);
    setRestoring(null);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-[#8C1B2E] dark:text-red-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <History className="h-4 w-4" />
          <span>Governance & Version Control</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
          Timetable Versioning, Locks & Audit Trail
        </h1>
        <p className="text-xs sm:text-sm text-stone-600 dark:text-zinc-400 mt-1 max-w-3xl leading-relaxed">
          Every timetable change is saved as a version with an audit record (who, what, when). Lock important sessions and restore an earlier version if needed.
        </p>
      </div>

      {/* Grid: Version History and Timetable Locks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Version Control Timeline */}
        <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <h3 className="text-sm font-serif font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#8C1B2E] dark:text-red-400" />
              <span>Timetable Version History</span>
            </h3>
            <span className="text-xs font-mono text-stone-500 dark:text-zinc-400">
              {versions.length} Versions Stored
            </span>
          </div>

          <div className="space-y-3">
            {versions.length === 0 && (
              <div className="text-center p-6 text-stone-400 dark:text-zinc-500 text-xs italic">
                No timetable versions yet. Generate a timetable to create the first one.
              </div>
            )}

            {versions.map(ver => {
              const isCurrent = ver.versionNumber === activeVersionNumber;

              return (
                <div
                  key={ver.versionNumber}
                  className={`p-4 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-emerald-50/70 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800/40 shadow-xs'
                      : 'bg-white dark:bg-zinc-950/60 border-[#E5E2D9] dark:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-stone-900 dark:text-zinc-100 text-xs">{ver.versionLabel}</span>
                      {isCurrent && (
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30">
                          Working Draft
                        </span>
                      )}
                      {ver.isPublished && (
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[#8C1B2E]/10 text-[#8C1B2E] border border-[#8C1B2E]/20 dark:text-red-300">
                          Published
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                      Health {ver.healthScore}%
                    </span>
                  </div>

                  <p className="text-xs text-stone-600 dark:text-zinc-300 mb-2 leading-relaxed">
                    {ver.changeSummary}
                  </p>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-zinc-400 pt-2 border-t border-[#E5E2D9] dark:border-zinc-800/80">
                    <div>
                      <span>Author: {ver.createdByName ?? ver.createdBy}</span>
                      <span className="mx-1.5">·</span>
                      <span className="font-mono">{new Date(ver.createdAt).toLocaleDateString()}</span>
                      <span className="mx-1.5">·</span>
                      <span>{ver.sessionsCount ?? 0} sessions</span>
                    </div>

                    {!isCurrent && canEdit && (
                      <button
                        onClick={() => handleRestore(ver.versionNumber)}
                        disabled={restoring !== null}
                        className="flex items-center gap-1 text-xs text-[#8C1B2E] hover:text-[#731625] dark:text-red-400 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>{restoring === ver.versionNumber ? 'Restoring…' : 'Restore This Version'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timetable Locks */}
        <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <h3 className="text-sm font-serif font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
              <Lock className="h-4 w-4 text-[#8C1B2E] dark:text-red-400" />
              <span>Pinned Assignments & Locks</span>
            </h3>
            <span className="text-xs font-mono text-stone-500 dark:text-zinc-400">
              {lockedSessions.length} Active Pins
            </span>
          </div>

          <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
            Locked sessions are kept fixed when the timetable is regenerated. Lock or unlock sessions from the timetable grid.
          </p>

          <div className="space-y-2.5">
            {lockedSessions.map(session => (
              <div
                key={session.id}
                className="p-3 bg-white dark:bg-zinc-950/70 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-[#8C1B2E] dark:text-red-400" />
                    <span>
                      {courses.find(c => c.id === session.courseId)?.code ?? session.courseId} ({session.day} {slotLabel(session.timeSlotId)})
                    </span>
                  </div>
                  {session.lockReason && (
                    <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">{session.lockReason}</div>
                  )}
                </div>

                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-50 text-[#8C1B2E] border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900 font-semibold">
                  Locked
                </span>
              </div>
            ))}

            {lockedSessions.length === 0 && (
              <div className="text-center p-6 text-stone-400 dark:text-zinc-500 text-xs italic">
                No locked sessions. The generator may move any assignment.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-950/50">
          <div>
            <h3 className="text-sm font-serif font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-[#8C1B2E] dark:text-red-400" />
              <span>Audit Log</span>
            </h3>
            <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
              Most recent changes recorded by the server.
            </p>
          </div>
          <span className="text-xs font-mono text-stone-500 dark:text-zinc-400">{auditLogs.length} Records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E5E2D9] dark:border-zinc-800 bg-[#F4F2EC] dark:bg-zinc-950/80 text-stone-600 dark:text-zinc-400 font-mono">
                <th className="p-3.5 font-semibold">Timestamp</th>
                <th className="p-3.5 font-semibold">Actor / User</th>
                <th className="p-3.5 font-semibold">Action</th>
                <th className="p-3.5 font-semibold">Entity Type</th>
                <th className="p-3.5 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E2D9] dark:divide-zinc-800">
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-stone-400 dark:text-zinc-500 italic">
                    No audit records yet.
                  </td>
                </tr>
              )}
              {auditLogs.map(log => (
                <tr key={log.id} className="hover:bg-white dark:hover:bg-zinc-800/40 transition-colors bg-white dark:bg-zinc-900">
                  <td className="p-3.5 font-mono text-stone-500 dark:text-zinc-400 text-[11px] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3.5 font-medium text-stone-900 dark:text-zinc-200 whitespace-nowrap">
                    {log.userName}
                  </td>
                  <td className="p-3.5 font-mono">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 font-semibold border border-[#E5E2D9] dark:border-zinc-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-3.5 text-stone-500 dark:text-zinc-400 font-mono text-[11px]">
                    {log.entityType} ({log.entityId})
                  </td>
                  <td className="p-3.5 text-stone-700 dark:text-zinc-300 leading-relaxed">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
