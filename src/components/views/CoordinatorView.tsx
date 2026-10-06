import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import { useAuth } from '../../context/AuthContext';
import {
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

// Sample content shown until real requests exist — edit freely.
const SAMPLE_RECENT_REQUESTS = [
  { id: 'req-1', type: 'Cancellation', section: 'CSE-A', requestedBy: 'Dr. Arvind Sharma', status: 'Pending', time: 'Today, 07:30 AM' },
  { id: 'req-2', type: 'Faculty Swap', section: 'CSE-B', requestedBy: 'Dr. Arvind Sharma', status: 'Pending', time: 'Today, 08:15 AM' },
  { id: 'req-3', type: 'Makeup Class', section: 'CSE-A', requestedBy: 'Prof. Rajesh Kumar', status: 'Approved', time: 'Yesterday, 04:20 PM' },
];

const formatDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

export function CoordinatorView() {
  const {
    facultyMembers,
    rooms,
    sections,
    sessions,
    allocations,
    publishStatus,
    validationReport,
    health,
    versions,
    activeVersionNumber,
    academicYear,
    studentsCount,
    notifications,
    setActiveView,
    generateDualRoutinesAPI,
  } = useTimetable();

  const { currentUser } = useAuth();
  const canEdit = ['COORDINATOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(currentUser?.roleCode ?? '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Real Database Counts
  const activeFacultyCount = facultyMembers.filter(f => f.status !== 'Inactive').length;
  const activeRoomsCount = rooms.filter(r => r.isAvailable).length;
  const activeSectionsCount = sections.filter(s => s.status !== 'Inactive').length;

  // Real Timetable State Determination
  const activeVersion = versions.find(v => v.versionNumber === activeVersionNumber);
  // Hard violations of the working draft as measured by the server's validator when the version was saved.
  const hardViolationsCount = activeVersion?.hardViolationsCount ?? health.hardConstraintViolations;
  const requiredSessions = allocations.reduce((n, a) => n + a.hoursPerWeek, 0);
  const hasDraft = sessions.length > 0;
  const isPublished = publishStatus === 'Published';

  // 4 Core Readiness Checks
  const isDataComplete = allocations.length > 0 && activeSectionsCount > 0 && activeFacultyCount > 0 && activeRoomsCount > 0 && validationReport.errorCount === 0;
  const noHardConflicts = hardViolationsCount === 0;
  const facultyConfigured = activeFacultyCount > 0;
  const roomsConfigured = activeRoomsCount > 0;

  const generationAllowed = isDataComplete && validationReport.isReadyForGeneration;
  const allChecksPassed = generationAllowed && noHardConflicts;
  const isValidated = hasDraft && noHardConflicts;

  const timestampStr = formatDate(isPublished ? academicYear.publishedAt : activeVersion?.createdAt);

  // Generation Handler
  const handleGenerate = async () => {
    if (isGenerating || !canEdit || (!generationAllowed && !isPublished)) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const res = await generateDualRoutinesAPI();
      // Infeasible runs still return routines with diagnostics, which the generation page shows.
      if (res.routines.length > 0) {
        setActiveView('generation_validator');
      } else {
        setGenError(res.error || res.message || 'Failed to generate timetable.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Recent Requests (3 items max): real requests from notifications, else sample content.
  const realRequests = notifications
    .filter(n => n.type === 'makeup_request' || n.type === 'approval_needed')
    .slice(0, 3)
    .map(n => ({ id: n.id, title: n.title, detail: n.message, status: n.read ? 'Read' : 'New', time: formatDate(n.timestamp) }));
  const isSampleRequests = realRequests.length === 0;
  const recentRequests = isSampleRequests
    ? SAMPLE_RECENT_REQUESTS.map(r => ({ id: r.id, title: `${r.type} — ${r.section}`, detail: `Requested by: ${r.requestedBy}`, status: r.status, time: r.time }))
    : realRequests;

  // Workflow Stage Calculation
  let currentStage: 'DATA' | 'GENERATE' | 'REVIEW' | 'PUBLISH' = 'DATA';
  let stateLabel: 'DATA_INCOMPLETE' | 'READY_TO_GENERATE' | 'DRAFT_GENERATED' | 'VALIDATED' | 'PUBLISHED' = 'DATA_INCOMPLETE';

  if (isPublished) {
    currentStage = 'PUBLISH';
    stateLabel = 'PUBLISHED';
  } else if (hasDraft && isValidated) {
    currentStage = 'REVIEW';
    stateLabel = 'VALIDATED';
  } else if (hasDraft) {
    currentStage = 'REVIEW';
    stateLabel = 'DRAFT_GENERATED';
  } else if (generationAllowed) {
    currentStage = 'GENERATE';
    stateLabel = 'READY_TO_GENERATE';
  } else {
    currentStage = 'DATA';
    stateLabel = 'DATA_INCOMPLETE';
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
          <span className={currentStage === 'DATA' ? 'text-[#8C1B2E] dark:text-red-400 font-bold' : isDataComplete ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-stone-400'}>
            DATA {isDataComplete ? '✓' : '●'}
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
            <div>{isPublished ? 'Last published:' : 'Draft saved:'}</div>
            <div className="font-mono text-stone-800 dark:text-zinc-300 font-semibold">{timestampStr}</div>
          </div>
        </div>

        {/* Compact Summary Line */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
          <div>
            <span className="text-[10px] text-stone-400 block font-medium">Scheduled Sessions</span>
            <span className="font-mono font-bold text-stone-900 dark:text-zinc-100">{sessions.length} / {requiredSessions}</span>
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
              {studentsCount.toLocaleString()} students · {activeFacultyCount} faculty · {activeSectionsCount} sections · {allocations.length} allocations · {versions.length} versions
            </span>
          </div>
        </div>
      </div>

      {/* 4. State-Driven Action & Readiness Section (Zero UI Contradictions) */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-4 space-y-3.5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-2.5">
          <span className="font-bold font-serif text-stone-900 dark:text-zinc-100 uppercase tracking-wider text-[11px]">
            {isPublished
              ? 'PUBLISHED TIMETABLE ACTIVE'
              : hasDraft
              ? 'TIMETABLE DRAFT AVAILABLE'
              : generationAllowed
              ? 'READY TO GENERATE'
              : 'DATA INCOMPLETE'}
          </span>

          {allChecksPassed ? (
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> All Checks Passed
            </span>
          ) : (
            <span className="text-rose-700 dark:text-rose-400 font-semibold text-[11px] flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Action Required
            </span>
          )}
        </div>

        {/* 4 Backend Readiness Checklist Items */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs py-1">
          <div className="flex items-center gap-2">
            {isDataComplete ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className={isDataComplete ? 'text-stone-800 dark:text-zinc-200' : 'text-rose-700 dark:text-rose-400 font-medium'}>
              {isDataComplete ? `Data complete (${allocations.length} allocations, ${activeSectionsCount} sections)` : 'Data incomplete: missing allocations or active cohorts'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {noHardConflicts ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className={noHardConflicts ? 'text-stone-800 dark:text-zinc-200' : 'text-rose-700 dark:text-rose-400 font-medium'}>
              {noHardConflicts ? 'No hard conflicts' : `${hardViolationsCount} hard conflict(s) detected`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {facultyConfigured ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className={facultyConfigured ? 'text-stone-800 dark:text-zinc-200' : 'text-rose-700 dark:text-rose-400 font-medium'}>
              {facultyConfigured ? `Faculty configured (${activeFacultyCount} active faculty)` : 'No active faculty configured'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {roomsConfigured ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className={roomsConfigured ? 'text-stone-800 dark:text-zinc-200' : 'text-rose-700 dark:text-rose-400 font-medium'}>
              {roomsConfigured ? `Rooms & labs configured (${activeRoomsCount} spaces)` : 'Rooms & labs unconfigured'}
            </span>
          </div>
        </div>

        {/* Descriptive Text & Status Notice */}
        <div className="space-y-3 pt-2 border-t border-[#E5E2D9] dark:border-zinc-800 text-xs">
          {hasDraft ? (
            <p className="text-stone-600 dark:text-zinc-300">
              <strong className="text-stone-900 dark:text-zinc-100 font-semibold">{sessions.length} / {requiredSessions}</strong> sessions scheduled with <strong className={noHardConflicts ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{hardViolationsCount} hard conflicts</strong>. Ready for review or regeneration.
            </p>
          ) : generationAllowed ? (
            <p className="text-stone-600 dark:text-zinc-300">
              Academic data complete ({allocations.length} course allocations across {activeSectionsCount} sections). Ready to run the timetable generator.
            </p>
          ) : (
            <p className="text-rose-700 dark:text-rose-400">
              Academic dataset is missing required allocations or faculty setup before timetable generation can run.
            </p>
          )}

          {genError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{genError}</span>
            </div>
          )}

          {/* Action Buttons: Responsive full-width stacked on mobile, row on tablet/desktop */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            {/* Primary Action: Generate / Regenerate Timetable */}
            {!canEdit ? null : isPublished ? (
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full sm:w-auto flex-1 py-3 px-5 bg-[#8C1B2E] hover:bg-[#721525] active:bg-[#5a111e] disabled:bg-stone-300 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Generating timetable…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    <span>Generate New Draft</span>
                  </>
                )}
              </button>
            ) : generationAllowed ? (
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full sm:w-auto flex-1 py-3 px-5 bg-[#8C1B2E] hover:bg-[#721525] active:bg-[#5a111e] disabled:bg-stone-300 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Generating timetable…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    <span>Generate Timetable</span>
                  </>
                )}
              </button>
            ) : (
              <button
                disabled
                className="w-full sm:w-auto flex-1 py-3 px-5 bg-stone-200 dark:bg-zinc-800 text-stone-400 dark:text-zinc-500 font-bold text-xs rounded-lg cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Sparkles className="h-4 w-4 text-stone-400" />
                <span>Generate Timetable (Data Incomplete)</span>
              </button>
            )}

            {/* Secondary Action: Review timetable (shown whenever draft exists or published) */}
            {(hasDraft || isPublished) && (
              <button
                onClick={() => setActiveView('grid')}
                className="w-full sm:w-auto flex-1 py-3 px-5 bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 hover:border-stone-400 active:bg-stone-50 dark:active:bg-zinc-900 text-stone-800 dark:text-zinc-200 font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Review timetable →</span>
              </button>
            )}

            {/* If data incomplete and no draft exists, direct to setup */}
            {canEdit && !generationAllowed && !hasDraft && (
              <button
                onClick={() => setActiveView('academic_setup')}
                className="w-full sm:w-auto flex-1 py-3 px-5 bg-[#8C1B2E] hover:bg-[#721525] text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Complete data setup →</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 5. Recent Requests (3 items max) */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-4 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-2">
          <span className="font-serif font-bold text-xs text-stone-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
            Recent requests
            {isSampleRequests && (
              <span className="text-[10px] font-mono normal-case tracking-normal px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-[#E5E2D9] dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">
                Sample
              </span>
            )}
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
                  {req.title}
                </div>
                <div className="text-[11px] text-stone-500 line-clamp-1">
                  {req.detail}
                </div>
              </div>

              <div className="text-right">
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  req.status === 'Approved' || req.status === 'Read'
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
