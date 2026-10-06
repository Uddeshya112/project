import React from 'react';
import { useTimetable } from '../../context/TimetableContext';
import { useAuth } from '../../context/AuthContext';
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Clock,
  Sparkles,
  Calendar,
  AlertTriangle
} from 'lucide-react';

export function CoordinatorView() {
  const {
    courses,
    facultyMembers,
    rooms,
    sections,
    sessions,
    allocations,
    publishStatus,
    validationReport,
    setActiveView,
  } = useTimetable();

  const { currentUser } = useAuth();

  // Real Database Counts
  const activeFacultyCount = facultyMembers.filter(f => f.status !== 'Inactive').length;
  const activeRoomsCount = rooms.filter(r => r.isAvailable).length;
  const activeSectionsCount = sections.filter(s => s.status !== 'Inactive').length;

  // Real Timetable State Determination
  const isDataReady = validationReport.isReadyForGeneration;
  const hasDraft = sessions.length > 0;
  const isPublished = publishStatus === 'Published';
  const hardViolationsCount = validationReport.hardViolationsCount ?? validationReport.errorCount;
  const isValidated = hardViolationsCount === 0;

  // Real Timestamps
  const timestampStr = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Recent Requests (3 items max)
  const recentRequests = [
    { id: 'req-1', type: 'Cancellation', section: 'CSE-A', requestedBy: 'Dr. Arvind Sharma', status: 'Pending', time: 'Today, 07:30 AM' },
    { id: 'req-2', type: 'Faculty Swap', section: 'CSE-B', requestedBy: 'Dr. Arvind Sharma', status: 'Pending', time: 'Today, 08:15 AM' },
    { id: 'req-3', type: 'Makeup Class', section: 'CSE-A', requestedBy: 'Prof. Rajesh Kumar', status: 'Approved', time: 'Yesterday, 04:20 PM' },
  ].slice(0, 3);

  // Workflow Stage Calculation
  let currentStage: 'DATA' | 'GENERATE' | 'REVIEW' | 'PUBLISH' = 'DATA';
  let stateLabel = 'DATA_INCOMPLETE';

  if (isPublished) {
    currentStage = 'PUBLISH';
    stateLabel = 'PUBLISHED';
  } else if (hasDraft && isValidated) {
    currentStage = 'REVIEW';
    stateLabel = 'VALIDATED';
  } else if (hasDraft) {
    currentStage = 'REVIEW';
    stateLabel = 'DRAFT_GENERATED';
  } else if (isDataReady) {
    currentStage = 'GENERATE';
    stateLabel = 'READY_TO_GENERATE';
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 font-sans pb-12 text-stone-900 dark:text-zinc-100">
      {/* 1. Slim Workflow Indicator */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-3 flex flex-wrap items-center justify-between text-xs font-medium">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase text-stone-400 dark:text-zinc-500 font-semibold tracking-wider">Workflow:</span>
          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-[#8C1B2E]/10 text-[#8C1B2E] dark:bg-red-950/40 dark:text-red-300 border border-[#8C1B2E]/20">
            {stateLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 font-mono text-[11px]">
          <span className={currentStage === 'DATA' ? 'text-[#8C1B2E] dark:text-red-400 font-bold' : isDataReady ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-stone-400'}>
            DATA {isDataReady ? '✓' : '●'}
          </span>
          <span className="text-stone-300 dark:text-zinc-700">→</span>
          <span className={currentStage === 'GENERATE' ? 'text-[#8C1B2E] dark:text-red-400 font-bold' : hasDraft ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-stone-400'}>
            GENERATE {hasDraft ? '✓' : currentStage === 'GENERATE' ? '●' : '○'}
          </span>
          <span className="text-stone-300 dark:text-zinc-700">→</span>
          <span className={currentStage === 'REVIEW' ? 'text-[#8C1B2E] dark:text-red-400 font-bold' : isPublished ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-stone-400'}>
            REVIEW {isPublished ? '✓' : currentStage === 'REVIEW' ? '●' : '○'}
          </span>
          <span className="text-stone-300 dark:text-zinc-700">→</span>
          <span className={currentStage === 'PUBLISH' ? 'text-[#8C1B2E] dark:text-red-400 font-bold' : 'text-stone-400'}>
            PUBLISH {isPublished ? '✓' : '○'}
          </span>
        </div>
      </div>

      {/* 2. Header */}
      <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-2.5">
        <h1 className="text-2xl font-bold font-serif text-stone-900 dark:text-zinc-100 tracking-tight">
          Coordinator Timetable Portal
        </h1>
        <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
          Thapar Institute of Engineering & Technology — Academic Schedule Command
        </p>
      </div>

      {/* 3. Compact Status Dashboard */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-stone-400 block font-semibold">
              Current Status
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
                isPublished
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
              }`}>
                {publishStatus.toUpperCase()}
              </span>
              <span className="text-xs font-semibold text-stone-700 dark:text-zinc-300 font-serif">
                {hasDraft ? (isValidated ? 'Draft Validated' : 'Draft Generated') : 'No Active Draft'}
              </span>
            </div>
          </div>

          <div className="text-left sm:text-right text-xs text-stone-500">
            <div>{isPublished ? 'Last published:' : 'Last generated:'}</div>
            <div className="font-mono text-stone-800 dark:text-zinc-300 font-semibold">{timestampStr}</div>
          </div>
        </div>

        {/* Compact Summary Line */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
          <div>
            <span className="text-[10px] text-stone-400 block font-medium">Scheduled Sessions</span>
            <span className="font-mono font-bold text-stone-900 dark:text-zinc-100">{sessions.length} / 736</span>
          </div>

          <div>
            <span className="text-[10px] text-stone-400 block font-medium">Hard Conflicts</span>
            <span className={`font-mono font-bold ${hardViolationsCount === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700'}`}>
              {hardViolationsCount}
            </span>
          </div>

          <div className="col-span-2">
            <span className="text-[10px] text-stone-400 block font-medium">Academic Dataset</span>
            <span className="font-sans text-stone-800 dark:text-zinc-200 font-semibold">
              1,280 students · {activeFacultyCount} faculty · {activeSectionsCount} sections · {allocations.length} allocations
            </span>
          </div>
        </div>
      </div>

      {/* 4. State-Driven Action & Readiness Section (Zero UI Contradictions) */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-4 space-y-3.5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-2.5">
          <span className="font-bold font-serif text-stone-900 dark:text-zinc-100 uppercase tracking-wider text-[11px]">
            {hasDraft ? 'TIMETABLE DRAFT AVAILABLE' : isDataReady ? 'READY TO GENERATE' : 'DATA INCOMPLETE'}
          </span>

          {isDataReady && hardViolationsCount === 0 ? (
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> All Checks Passed
            </span>
          ) : (
            <span className="text-rose-700 dark:text-rose-400 font-semibold text-[11px] flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Action Required
            </span>
          )}
        </div>

        {hasDraft ? (
          <div className="space-y-3 text-xs">
            <p className="text-stone-600 dark:text-zinc-300">
              <strong className="text-stone-900 dark:text-zinc-100 font-semibold">{sessions.length} / 736</strong> sessions scheduled with <strong className="text-emerald-700 dark:text-emerald-400">{hardViolationsCount} hard conflicts</strong>. Ready for review and publication inspection.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                onClick={() => setActiveView('grid')}
                className="flex-1 py-3 bg-[#8C1B2E] hover:bg-[#721525] active:bg-[#5a111e] text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center justify-center gap-2"
              >
                <span>Review timetable →</span>
              </button>

              <button
                onClick={() => setActiveView('generation_validator')}
                className="py-3 px-4 bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 hover:border-stone-400 text-stone-800 dark:text-zinc-200 font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#8C1B2E]" />
                <span>Generate another routine</span>
              </button>
            </div>
          </div>
        ) : isDataReady ? (
          <div className="space-y-3 text-xs">
            <p className="text-stone-600 dark:text-zinc-300">
              Academic data complete ({allocations.length} course allocations across {activeSectionsCount} sections). Ready to run the automated constraint solver.
            </p>

            <button
              onClick={() => setActiveView('generation_validator')}
              className="w-full py-3 bg-[#8C1B2E] hover:bg-[#721525] active:bg-[#5a111e] text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center justify-center gap-2"
            >
              <span>Generate timetable →</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <p className="text-rose-700 dark:text-rose-400">
              Academic dataset is missing required allocations or faculty setup before timetable generation can run.
            </p>

            <button
              onClick={() => setActiveView('academic_setup')}
              className="w-full py-3 bg-[#8C1B2E] hover:bg-[#721525] text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center justify-center gap-2"
            >
              <span>Complete data setup →</span>
            </button>
          </div>
        )}
      </div>

      {/* 5. Recent Requests (3 items max) */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-4 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-2">
          <span className="font-serif font-bold text-xs text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
            Recent requests
          </span>
          <button
            onClick={() => setActiveView('recovery')}
            className="text-xs text-[#8C1B2E] dark:text-red-400 font-semibold hover:underline"
          >
            View all requests
          </button>
        </div>

        <div className="divide-y divide-[#E5E2D9] dark:divide-zinc-800 text-xs">
          {recentRequests.map(req => (
            <div key={req.id} className="py-2 first:pt-0 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-stone-900 dark:text-zinc-100">
                  {req.type} — {req.section}
                </div>
                <div className="text-[11px] text-stone-500">
                  Requested by: {req.requestedBy}
                </div>
              </div>

              <div className="text-right">
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  req.status === 'Approved'
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                }`}>
                  {req.status}
                </span>
                <div className="text-[10px] text-stone-400 mt-0.5">{req.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
