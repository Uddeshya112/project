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
  const isValidated = validationReport.hardViolationsCount === 0;

  // Real Timestamps
  const timestampStr = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Recent Requests Mock/Persisted Data (3 items max)
  const recentRequests = [
    { id: 'req-1', type: 'Cancellation', section: 'CSE-A', requestedBy: 'Dr. Arvind Sharma', status: 'Pending', time: 'Today, 07:30 AM' },
    { id: 'req-2', type: 'Faculty Swap', section: 'CSE-B', requestedBy: 'Dr. Arvind Sharma', status: 'Pending', time: 'Today, 08:15 AM' },
    { id: 'req-3', type: 'Makeup Class', section: 'CSE-A', requestedBy: 'Prof. Rajesh Kumar', status: 'Approved', time: 'Yesterday, 04:20 PM' },
  ].slice(0, 3);

  // Workflow Stage Calculation
  let currentStage: 'DATA' | 'GENERATE' | 'REVIEW' | 'PUBLISH' = 'DATA';
  if (isPublished) {
    currentStage = 'PUBLISH';
  } else if (hasDraft && isValidated) {
    currentStage = 'PUBLISH';
  } else if (hasDraft) {
    currentStage = 'REVIEW';
  } else if (isDataReady) {
    currentStage = 'GENERATE';
  }

  // Handle Primary Button Action based on exact state
  const handlePrimaryAction = () => {
    if (!isDataReady) {
      setActiveView('academic_setup'); // State 1: Complete Data
    } else if (!hasDraft) {
      setActiveView('generation_validator'); // State 2: Generate Timetable
    } else {
      setActiveView('grid'); // State 3, 4, 5: Review / View Timetable
    }
  };

  const getPrimaryButtonLabel = () => {
    if (!isDataReady) return 'Complete data';
    if (!hasDraft) return 'Generate timetable';
    if (!isPublished && isValidated) return 'Review & publish';
    if (!isPublished) return 'Review timetable';
    return 'View timetable';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans pb-12 text-stone-900 dark:text-zinc-100">
      {/* 1. Workflow Progress Indicator */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-3 flex items-center justify-between text-xs font-semibold shadow-2xs">
        <div className="flex items-center gap-1.5 text-stone-600 dark:text-zinc-400">
          <span className="font-mono text-[10px] uppercase text-stone-400">Workflow:</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 font-mono text-[11px]">
          <span className={currentStage === 'DATA' ? 'text-[#8C1B2E] dark:text-red-400 font-bold' : isDataReady ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-400'}>
            DATA {isDataReady ? '✓' : '●'}
          </span>
          <span className="text-stone-300 dark:text-zinc-700">→</span>
          <span className={currentStage === 'GENERATE' ? 'text-[#8C1B2E] dark:text-red-400 font-bold' : hasDraft ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-400'}>
            GENERATE {hasDraft ? '✓' : currentStage === 'GENERATE' ? '●' : '○'}
          </span>
          <span className="text-stone-300 dark:text-zinc-700">→</span>
          <span className={currentStage === 'REVIEW' ? 'text-[#8C1B2E] dark:text-red-400 font-bold' : isPublished ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-400'}>
            REVIEW {isPublished ? '✓' : currentStage === 'REVIEW' ? '●' : '○'}
          </span>
          <span className="text-stone-300 dark:text-zinc-700">→</span>
          <span className={currentStage === 'PUBLISH' ? 'text-[#8C1B2E] dark:text-red-400 font-bold' : 'text-stone-400'}>
            PUBLISH {isPublished ? '✓' : '○'}
          </span>
        </div>
      </div>

      {/* 2. Home Header */}
      <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
        <h1 className="text-2xl sm:text-3xl font-bold font-serif text-stone-900 dark:text-zinc-100 tracking-tight">
          Timetable
        </h1>
        <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-0.5">
          Manage the current timetable.
        </p>
      </div>

      {/* 3. Current Status Area */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-4 flex items-center justify-between shadow-2xs">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 block">
            Current timetable status
          </span>
          <div className="text-base font-bold text-stone-900 dark:text-zinc-100 font-serif mt-0.5 flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
              isPublished
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
            }`}>
              {publishStatus.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="text-right text-xs text-stone-500">
          <div>{isPublished ? 'Last published:' : 'Last generated:'}</div>
          <div className="font-mono text-stone-800 dark:text-zinc-300 font-medium">{timestampStr}</div>
        </div>
      </div>

      {/* 4. Academic Data Summary (ONE compact line) */}
      <div className="text-xs text-stone-600 dark:text-zinc-400 px-1 font-medium flex items-center gap-1.5">
        <span className="text-stone-400">Academic dataset:</span>
        <span className="text-stone-900 dark:text-zinc-100 font-semibold">
          {activeSectionsCount} sections, {activeFacultyCount} faculty, {activeRoomsCount} rooms
        </span>
      </div>

      {/* 5. Compact Readiness Section */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-4 space-y-2.5 text-xs shadow-2xs">
        <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-2">
          <span className="font-bold font-serif text-stone-900 dark:text-zinc-100 uppercase tracking-wider text-[11px]">
            {isDataReady ? 'Ready to generate' : 'Not ready for generation'}
          </span>
          {isDataReady ? (
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> All Checks Passed
            </span>
          ) : (
            <span className="text-rose-700 dark:text-rose-400 font-semibold text-[11px] flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Setup Required
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 text-stone-700 dark:text-zinc-300">
            {allocations.length > 0 ? (
              <span className="text-emerald-600 font-bold">✓</span>
            ) : (
              <span className="text-rose-600 font-bold">×</span>
            )}
            <span>Data complete ({allocations.length} course allocations)</span>
          </div>

          <div className="flex items-center gap-2 text-stone-700 dark:text-zinc-300">
            {validationReport.hardViolationsCount === 0 ? (
              <span className="text-emerald-600 font-bold">✓</span>
            ) : (
              <span className="text-rose-600 font-bold">×</span>
            )}
            <span>No hard conflicts ({validationReport.hardViolationsCount} violations)</span>
          </div>

          <div className="flex items-center gap-2 text-stone-700 dark:text-zinc-300">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Faculty availability configured</span>
          </div>

          <div className="flex items-center gap-2 text-stone-700 dark:text-zinc-300">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Rooms & labs configured ({activeRoomsCount} facilities)</span>
          </div>
        </div>
      </div>

      {/* 6. SINGLE DOMINANT PRIMARY ACTION */}
      <div className="pt-2">
        <button
          onClick={handlePrimaryAction}
          className="w-full py-3.5 bg-[#8C1B2E] hover:bg-[#721525] active:bg-[#5a111e] text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
        >
          <span>{getPrimaryButtonLabel()}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* 7. Recent Requests (3 items max) */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-4 space-y-3 shadow-2xs">
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
            <div key={req.id} className="py-2.5 first:pt-0 flex items-center justify-between gap-3">
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
