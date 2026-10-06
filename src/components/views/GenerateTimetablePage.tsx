import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import { useAuth } from '../../context/AuthContext';
import type { ClassSession, GenerationRoutine } from '../../types';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  Eye,
  Send,
} from 'lucide-react';

/** The server also returns the solver's status text and infeasibility diagnostics for each routine. */
type Routine = GenerationRoutine & { statusMessage?: string; diagnostics?: string[] };

const show = (n?: number) => (n == null ? '—' : Math.round(n * 10) / 10);
const sessionKey = (s: ClassSession) => `${s.courseId}|${s.sectionId}|${s.subSectionId ?? ''}|${s.type}|${s.day}|${s.timeSlotId}`;

export function GenerateTimetablePage() {
  const {
    academicYear,
    allocations,
    facultyMembers,
    rooms,
    sections,
    validationReport,
    generateDualRoutinesAPI,
    selectRoutineAPI,
    latestGeneratedRoutines,
    publishMasterTimetable,
    updatePublishStatus,
    publishStatus,
    activeVersionNumber,
    setActiveView,
  } = useTimetable();
  const { currentUser } = useAuth();
  const isAdmin = ['COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(currentUser?.roleCode ?? '');
  const canEdit = isAdmin || currentUser?.roleCode === 'COORDINATOR';

  const [isGenerating, setIsGenerating] = useState(false);
  const [busyVersion, setBusyVersion] = useState<number | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; title: string; message: string } | null>(null);

  const routines = (latestGeneratedRoutines ?? []) as Routine[];

  const activeFacultyCount = facultyMembers.filter(f => f.status !== 'Inactive').length;
  const activeRoomsCount = rooms.filter(r => r.isAvailable).length;
  const activeSectionsCount = sections.filter(s => s.status !== 'Inactive').length;
  const totalSubgroupsCount = sections.reduce((acc, s) => acc + (s.subSections?.length || 0), 0);
  const openChecks = validationReport.items.filter(i => i.status !== 'Passed');

  // How different the first two routines are: sessions of A that sit in the same day/slot in B.
  const [routineA, routineB] = routines;
  const overlap = routineA?.sessions.length && routineB
    ? (() => {
        const inB = new Set(routineB.sessions.map(sessionKey));
        const same = routineA.sessions.filter(s => inB.has(sessionKey(s))).length;
        return { total: routineA.sessions.length, same, different: routineA.sessions.length - same };
      })()
    : null;

  const handleStartGeneration = async () => {
    setIsGenerating(true);
    setFeedback(null);
    const res = await generateDualRoutinesAPI();
    setIsGenerating(false);
    if (!res.success) {
      setFeedback({
        success: false,
        title: 'Generation failed',
        message: res.error || res.message || 'No feasible timetable was found. See the diagnostics for each routine below.',
      });
    }
  };

  const handleSelectAndApply = async (routine: Routine) => {
    if (routine.versionNumber == null) return;
    setBusyVersion(routine.versionNumber);
    await selectRoutineAPI(routine.versionNumber);
    setBusyVersion(null);
  };

  const handlePublishCurrent = async () => {
    setIsPublishing(true);
    setFeedback(null);
    const res = await publishMasterTimetable();
    setIsPublishing(false);
    setFeedback(
      res.success
        ? { success: true, title: 'Published', message: `Version ${activeVersionNumber} is now the published timetable for students and faculty.` }
        : { success: false, title: 'Publication blocked', message: res.error || 'Publishing failed.' },
    );
  };

  const handleSendForReview = async () => {
    setIsPublishing(true);
    await updatePublishStatus('Review');
    setIsPublishing(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#8C1B2E]/10 text-[#8C1B2E] dark:text-red-400">
              <Sparkles className="h-5 w-5" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
              Generate Timetable
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-1">
            Academic Year {academicYear.yearLabel} · Automated Timetable Generator
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500 dark:text-zinc-400">Current Status:</span>
          <span className="px-3 py-1 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg text-xs font-semibold text-stone-800 dark:text-zinc-200 shadow-2xs">
            {publishStatus}
          </span>
        </div>
      </div>

      {/* 4-Step Process Header Bar */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-around gap-2 text-xs font-semibold">
        <div className="flex items-center gap-2 text-[#8C1B2E] dark:text-red-400 font-bold">
          <span className="w-5 h-5 rounded-full bg-[#8C1B2E] text-white flex items-center justify-center text-[10px]">1</span>
          <span>Academic Data</span>
        </div>
        <ArrowRight className="h-3 w-3 text-stone-300 dark:text-zinc-600 hidden sm:block" />
        <div className={`flex items-center gap-2 ${isGenerating || routines.length ? 'text-[#8C1B2E] dark:text-red-400 font-bold' : 'text-stone-500 dark:text-zinc-400'}`}>
          <span className="w-5 h-5 rounded-full bg-stone-200 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 flex items-center justify-center text-[10px]">2</span>
          <span>Generate</span>
        </div>
        <ArrowRight className="h-3 w-3 text-stone-300 dark:text-zinc-600 hidden sm:block" />
        <div className={`flex items-center gap-2 ${routines.length ? 'text-[#8C1B2E] dark:text-red-400 font-bold' : 'text-stone-500 dark:text-zinc-400'}`}>
          <span className="w-5 h-5 rounded-full bg-stone-200 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 flex items-center justify-center text-[10px]">3</span>
          <span>Review Options</span>
        </div>
        <ArrowRight className="h-3 w-3 text-stone-300 dark:text-zinc-600 hidden sm:block" />
        <div className={`flex items-center gap-2 ${publishStatus === 'Published' ? 'text-emerald-700 font-bold' : 'text-stone-500 dark:text-zinc-400'}`}>
          <span className="w-5 h-5 rounded-full bg-stone-200 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 flex items-center justify-center text-[10px]">4</span>
          <span>Publish</span>
        </div>
      </div>

      {/* STEP 1: Academic Data Readiness Summary */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
          <div>
            <h3 className="text-sm font-bold font-serif text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
              Step 1 — Academic Data Readiness
            </h3>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
              Summary of sections, subgroups, faculty, rooms, and course allocations configured for generation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {validationReport.isReadyForGeneration ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ready for generation
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-rose-50 text-rose-800 border border-rose-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800">
                <XCircle className="h-3.5 w-3.5" /> {validationReport.errorCount} Issues to Resolve
              </span>
            )}
            <button
              onClick={() => setShowChecks(v => !v)}
              className="p-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100"
              title="Show readiness checks"
              aria-label="Show readiness checks"
              aria-expanded={showChecks}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {showChecks && (
          <div className="p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 text-xs space-y-1.5">
            <div className="font-semibold text-stone-800 dark:text-zinc-200">
              {validationReport.passedCount} passed · {validationReport.warningCount} warnings · {validationReport.errorCount} errors
            </div>
            {openChecks.length === 0 ? (
              <div className="text-emerald-700 dark:text-emerald-400">All readiness checks passed.</div>
            ) : (
              <ul className="space-y-1">
                {openChecks.map(item => (
                  <li key={item.id} className="flex items-start gap-1.5">
                    {item.status === 'Error' ? (
                      <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <span className="text-stone-700 dark:text-zinc-300">
                      <strong>{item.title}:</strong> {item.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Readiness Compact Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs text-center">
          <div className="p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 space-y-0.5">
            <span className="text-[11px] text-stone-500 block">Sections</span>
            <span className="font-bold text-base text-stone-900 dark:text-zinc-100">{activeSectionsCount}</span>
          </div>

          <div className="p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 space-y-0.5">
            <span className="text-[11px] text-stone-500 block">Subgroups</span>
            <span className="font-bold text-base text-stone-900 dark:text-zinc-100">{totalSubgroupsCount}</span>
          </div>

          <div className="p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 space-y-0.5">
            <span className="text-[11px] text-stone-500 block">Faculty</span>
            <span className="font-bold text-base text-stone-900 dark:text-zinc-100">{activeFacultyCount}</span>
          </div>

          <div className="p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 space-y-0.5">
            <span className="text-[11px] text-stone-500 block">Rooms & Labs</span>
            <span className="font-bold text-base text-stone-900 dark:text-zinc-100">{activeRoomsCount}</span>
          </div>

          <div className="col-span-2 sm:col-span-1 p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 space-y-0.5">
            <span className="text-[11px] text-stone-500 block">Course Allocations</span>
            <span className="font-bold text-base text-[#8C1B2E] dark:text-red-400">{allocations.length}</span>
          </div>
        </div>
      </div>

      {/* STEP 2: Generation */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 space-y-4 shadow-xs">
        <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
          <h3 className="text-sm font-bold font-serif text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
            Step 2 — Timetable Generator
          </h3>
          <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
            Runs the solver on the server and produces a student-focused and a faculty-focused routine.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-[11px] text-stone-500">
            Every routine is checked by an independent validator. Locked sessions are kept fixed when the timetable is regenerated.
          </span>

          <button
            onClick={handleStartGeneration}
            disabled={isGenerating || !canEdit || !validationReport.isReadyForGeneration}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-bold shadow-md transition-all ${
              !isGenerating && canEdit && validationReport.isReadyForGeneration
                ? 'bg-[#8C1B2E] hover:bg-[#721525] text-white cursor-pointer'
                : 'bg-stone-200 text-stone-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed'
            }`}
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Generating Draft Timetable...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-amber-300" />
                <span>Generate Draft Timetable</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* STEP 3: Review generated routines */}
      {routines.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <div>
              <h3 className="text-sm font-bold font-serif text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
                Step 3 — Review Generated Options ({routines.length})
              </h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
                Select the routine to use as the working draft.
              </p>
            </div>

            <button
              onClick={() => setActiveView('grid')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 hover:border-stone-400 rounded-lg text-xs font-semibold text-stone-700 dark:text-zinc-300 shadow-2xs transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Inspect Grid Matrix</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {routines.map((routine, idx) => {
              const letter = String.fromCharCode(65 + idx);
              const isSelected = routine.versionNumber != null && routine.versionNumber === activeVersionNumber;
              const { validation: v, metrics: m } = routine;
              const reasons = v.blockingReasons?.length ? v.blockingReasons : routine.diagnostics ?? [];

              return (
                <div
                  key={routine.id}
                  className={`bg-[#FAF9F5] dark:bg-zinc-900 border rounded-xl p-4.5 space-y-3.5 transition-all shadow-xs relative ${
                    isSelected
                      ? 'border-[#8C1B2E] ring-2 ring-[#8C1B2E]/20'
                      : 'border-[#E5E2D9] dark:border-zinc-800 hover:border-stone-400'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-serif font-bold text-sm text-stone-900 dark:text-zinc-100">
                          Routine {letter} — {routine.label}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                            Working draft
                          </span>
                        )}
                      </div>
                      {routine.description && (
                        <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-1 leading-snug">{routine.description}</p>
                      )}
                      <span className="text-[11px] font-mono font-semibold text-stone-700 dark:text-zinc-300 block mt-1.5">
                        {routine.sessions.length} / {routine.sessions.length + v.unscheduled} sessions scheduled
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-stone-400 block font-medium">Quality Index</span>
                      <span className="font-serif font-bold text-lg text-[#8C1B2E] dark:text-red-400 leading-none">
                        {routine.healthScore}
                        <span className="text-xs text-stone-400 font-normal">/100</span>
                      </span>
                    </div>
                  </div>

                  {!v.valid && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 dark:bg-red-950/20 dark:border-red-800/40 dark:text-red-300 text-[11px] space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {routine.statusMessage || 'This routine is not feasible.'}
                      </div>
                      {v.unscheduled > 0 && <div>{v.unscheduled} required session(s) could not be placed.</div>}
                      {reasons.length > 0 && (
                        <ul className="list-disc list-inside space-y-0.5">
                          {reasons.slice(0, 8).map((r, i) => <li key={i}>{r}</li>)}
                          {reasons.length > 8 && <li>+{reasons.length - 8} more</li>}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Metrics Breakdown */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono p-2.5 rounded-lg bg-white dark:bg-zinc-950/60 border border-[#E5E2D9] dark:border-zinc-800">
                    <div>
                      <span className="text-[10px] text-stone-400 block font-sans">Hard Conflicts</span>
                      <strong className={v.hardViolations === 0 ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-rose-700 dark:text-rose-400 font-bold'}>
                        {v.hardViolations}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-stone-400 block font-sans">Student Gaps</span>
                      <strong className="text-stone-800 dark:text-zinc-200">{m.studentGaps} hrs</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-stone-400 block font-sans">Faculty Gaps</span>
                      <strong className="text-stone-800 dark:text-zinc-200">{m.facultyGaps} hrs</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-stone-400 block font-sans">Same Course/Day</span>
                      <strong className="text-stone-800 dark:text-zinc-200">{show(m.sameCourseSameDayCount)}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-stone-400 block font-sans">Consecutive Lec.</span>
                      <strong className="text-stone-800 dark:text-zinc-200">{show(m.sameCourseConsecutiveCount)}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-stone-400 block font-sans">Avg/Max Student Load</span>
                      <strong className="text-stone-800 dark:text-zinc-200">
                        {show(m.avgStudentDailyLoad)} / {show(m.maxStudentDailyLoad)}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-stone-400 block font-sans">Avg/Max Faculty Load</span>
                      <strong className="text-stone-800 dark:text-zinc-200">
                        {show(m.avgFacultyDailyLoad)} / {show(m.maxFacultyDailyLoad)}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-stone-400 block font-sans">Room / Lab Util.</span>
                      <strong className="text-stone-800 dark:text-zinc-200">
                        {Math.round(m.roomUtilization)}% / {Math.round(m.labUtilization)}%
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-stone-400 block font-sans">Course Day Dist.</span>
                      <strong className="text-stone-800 dark:text-zinc-200">
                        {m.courseDistributionQualityRate == null ? '—' : `${show(m.courseDistributionQualityRate)}%`}
                      </strong>
                    </div>
                  </div>

                  {canEdit && (
                    <button
                      onClick={() => handleSelectAndApply(routine)}
                      disabled={routine.versionNumber == null || busyVersion !== null || isSelected}
                      className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all disabled:cursor-not-allowed ${
                        isSelected
                          ? 'bg-[#8C1B2E] text-white shadow-xs'
                          : 'bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 text-stone-700 dark:text-zinc-300 hover:text-stone-900 disabled:opacity-50'
                      }`}
                    >
                      {isSelected
                        ? '✓ Selected as Working Draft'
                        : routine.versionNumber == null
                        ? 'No timetable to apply'
                        : busyVersion === routine.versionNumber
                        ? 'Applying…'
                        : `Select & apply Routine ${letter}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Distinctness Comparison Summary */}
          {overlap && (
            <div className="p-3.5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl text-xs space-y-1.5 shadow-2xs font-mono">
              <div className="flex items-center justify-between font-serif font-bold text-stone-900 dark:text-zinc-100 font-sans border-b border-[#E5E2D9] dark:border-zinc-800 pb-1.5">
                <span>Routine A vs Routine B</span>
                <span className="text-stone-700 dark:text-zinc-300 font-bold">
                  {((overlap.different / overlap.total) * 100).toFixed(1)}% Distinct
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-0.5 text-stone-600 dark:text-zinc-400 text-[11px]">
                <div>Sessions (A): <strong>{overlap.total}</strong></div>
                <div>Same Slot in B: <strong>{overlap.same}</strong></div>
                <div>Different Slot: <strong>{overlap.different}</strong></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: Publish Gate (applies to the current working draft) */}
      {activeVersionNumber != null && (
        <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-serif text-sm font-bold text-stone-900 dark:text-zinc-100">
                Step 4 — Master Publication
              </h3>
            </div>
            <p className="text-xs text-stone-500 dark:text-zinc-400">
              {isAdmin
                ? `Publishes working draft V${activeVersionNumber} to student schedules and faculty rosters.`
                : 'The Dean / College Admin approves and publishes the timetable. Mark the working draft for review when it is ready.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setActiveView('grid')}
              className="px-3.5 py-2 bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 hover:border-stone-400 rounded-lg text-xs font-semibold text-stone-700 dark:text-zinc-300 shadow-2xs transition-colors"
            >
              Inspect Grid Matrix
            </button>

            {isAdmin ? (
              <button
                onClick={handlePublishCurrent}
                disabled={isPublishing}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{isPublishing ? 'Publishing…' : 'Publish Timetable'}</span>
              </button>
            ) : canEdit ? (
              <button
                onClick={handleSendForReview}
                disabled={isPublishing || publishStatus === 'Review'}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#8C1B2E] hover:bg-[#721525] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{publishStatus === 'Review' ? 'In Review' : 'Mark Ready for Review'}</span>
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Feedback (generation or publication) */}
      {feedback && (
        <div
          role="status"
          className={`p-4 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
            feedback.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-300'
              : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-red-950/20 dark:border-red-800/40 dark:text-red-300'
          }`}
        >
          {feedback.success ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
          )}
          <div>
            <div className="font-bold">{feedback.title}</div>
            <div className="mt-0.5">{feedback.message}</div>
          </div>
        </div>
      )}
    </div>
  );
}
