import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import { GeneratedCandidate } from '../../lib/optimizationEngine';
import { IndependentValidationReport } from '../../lib/independentValidator';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Clock,
  ArrowRight,
  RotateCcw,
  Calendar,
  Layers,
  Building2,
  Users,
  Eye,
  Sliders,
  Check,
  Send
} from 'lucide-react';

export function GenerateTimetablePage() {
  const {
    academicYear,
    allocations,
    facultyMembers,
    rooms,
    sections,
    courses,
    constraints,
    validationReport,
    runValidation,
    generateMultiCandidateTimetables,
    applyCandidateAsDraft,
    publishMasterTimetable,
    publishStatus,
    setActiveView,
  } = useTimetable();

  // Generator Settings State
  const [budgetMode, setBudgetMode] = useState<'FAST' | 'BALANCED' | 'MAXIMUM_OPTIMIZATION'>('BALANCED');
  const [timeBudgetMs, setTimeBudgetMs] = useState<number>(1000);
  const [numCandidates, setNumCandidates] = useState<number>(3);

  // Execution State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationOutput, setGenerationOutput] = useState<{
    candidates: GeneratedCandidate[];
    validationReports: IndependentValidationReport[];
    diagnostics?: string[];
  } | null>(null);

  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(0);
  const [publishFeedback, setPublishFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const activeCoursesCount = courses.filter(c => c.status !== 'Archived').length;
  const allocatedCoursesCount = new Set(allocations.map(a => a.courseId)).size;
  const activeFacultyCount = facultyMembers.filter(f => f.status !== 'Inactive').length;
  const activeRoomsCount = rooms.filter(r => r.isAvailable).length;
  const activeSectionsCount = sections.filter(s => s.status !== 'Inactive').length;
  const totalSubgroupsCount = sections.reduce((acc, s) => acc + (s.subSections?.length || 0), 0);

  const handleStartGeneration = () => {
    setIsGenerating(true);
    setGenerationOutput(null);
    setPublishFeedback(null);

    setTimeout(() => {
      const result = generateMultiCandidateTimetables({
        budgetMode,
        timeBudgetMs,
        maxCandidates: numCandidates,
        seed: Math.floor(Math.random() * 10000) + 100,
      });

      setGenerationOutput({
        candidates: result.candidates,
        validationReports: result.validationReports,
        diagnostics: result.diagnostics,
      });
      setSelectedCandidateIdx(0);
      setIsGenerating(false);
    }, 400);
  };

  const handleSelectAndApply = (idx: number) => {
    if (!generationOutput || !generationOutput.candidates[idx]) return;
    setSelectedCandidateIdx(idx);
    applyCandidateAsDraft(generationOutput.candidates[idx]);
  };

  const handlePublishCurrent = () => {
    const res = publishMasterTimetable('Dean Academic Affairs');
    if (res.success) {
      setPublishFeedback({
        success: true,
        message: 'Master timetable officially published! Live matrix synchronized across all Student, Faculty, and Room portals.',
      });
    } else {
      setPublishFeedback({
        success: false,
        message: res.error || 'Failed to publish timetable: hard violations detected.',
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[#8C1B2E]/10 dark:bg-red-500/10 text-[#8C1B2E] dark:text-red-400">
              <Sparkles className="h-5 w-5" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
              Timetable Generation Machine
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-1">
            Constraint Satisfaction, Soft Optimization, and Independent Verification Engine
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500 dark:text-zinc-400">Lifecycle Status:</span>
          <span className="px-2.5 py-1 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-md text-xs font-semibold text-stone-800 dark:text-zinc-200 shadow-2xs">
            {publishStatus}
          </span>
        </div>
      </div>

      {/* STEP 1: Pre-Generation Readiness & Academic Setup Audit */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
          <div>
            <span className="text-xs font-bold font-serif uppercase tracking-wider text-[#8C1B2E] dark:text-red-400">
              Phase 1 · Master Setup Verification
            </span>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
              Validates institutional data integrity, teacher availability, room capacity, and cohort definitions
            </p>
          </div>

          <div className="flex items-center gap-2">
            {validationReport.isReadyForGeneration ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5" /> Setup Verified · Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-rose-50 text-rose-800 border border-rose-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                <XCircle className="h-3.5 w-3.5" /> {validationReport.errorCount} Blocking Errors
              </span>
            )}
            <button
              onClick={() => runValidation()}
              className="p-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100"
              title="Re-run master data audit"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Setup Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs text-center">
          <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
            <span className="text-[11px] text-stone-500 block">Working Days</span>
            <span className="font-semibold text-stone-900 dark:text-zinc-100">{academicYear.workingDays?.length || 5} days</span>
          </div>

          <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
            <span className="text-[11px] text-stone-500 block">Courses Allocated</span>
            <span className="font-semibold text-stone-900 dark:text-zinc-100">{allocatedCoursesCount} / {activeCoursesCount}</span>
          </div>

          <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
            <span className="text-[11px] text-stone-500 block">Active Faculty</span>
            <span className="font-semibold text-stone-900 dark:text-zinc-100">{activeFacultyCount} instructors</span>
          </div>

          <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
            <span className="text-[11px] text-stone-500 block">Rooms & Labs</span>
            <span className="font-semibold text-stone-900 dark:text-zinc-100">{activeRoomsCount} facilities</span>
          </div>

          <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
            <span className="text-[11px] text-stone-500 block">Student Groups</span>
            <span className="font-semibold text-[#8C1B2E] dark:text-red-400">{activeSectionsCount} sections</span>
          </div>

          <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
            <span className="text-[11px] text-stone-500 block">Lab Subgroups</span>
            <span className="font-semibold text-stone-900 dark:text-zinc-100">{totalSubgroupsCount} cohorts</span>
          </div>
        </div>
      </div>

      {/* STEP 2: Generation Engine Parameters */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 space-y-4 shadow-xs">
        <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
          <span className="text-xs font-bold font-serif uppercase tracking-wider text-[#8C1B2E] dark:text-red-400">
            Phase 2 · Search & Optimization Settings
          </span>
          <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
            Configure search depth, time budget, and number of candidate timetable options to compile
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="text-stone-700 dark:text-zinc-300 font-medium block mb-1">
              Optimization Quality
            </label>
            <select
              value={budgetMode}
              onChange={e => setBudgetMode(e.target.value as any)}
              className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
            >
              <option value="FAST">Fast Feasibility (Quick Verification)</option>
              <option value="BALANCED">Balanced (MRV + Penalty Minimization)</option>
              <option value="MAXIMUM_OPTIMIZATION">Thorough Local Search (Best Gaps & Utilization)</option>
            </select>
          </div>

          <div>
            <label className="text-stone-700 dark:text-zinc-300 font-medium block mb-1">
              Time Budget Limit
            </label>
            <select
              value={timeBudgetMs}
              onChange={e => setTimeBudgetMs(Number(e.target.value))}
              className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
            >
              <option value={300}>Auto (Fast ~300ms)</option>
              <option value={1000}>1 Second</option>
              <option value={3000}>3 Seconds</option>
              <option value={5000}>5 Seconds</option>
            </select>
          </div>

          <div>
            <label className="text-stone-700 dark:text-zinc-300 font-medium block mb-1">
              Candidate Timetable Options
            </label>
            <select
              value={numCandidates}
              onChange={e => setNumCandidates(Number(e.target.value))}
              className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
            >
              <option value={1}>1 Option</option>
              <option value={3}>3 Options (Recommended for Review)</option>
              <option value={5}>5 Options</option>
            </select>
          </div>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#E5E2D9] dark:border-zinc-800">
          <span className="text-[11px] text-stone-500">
            Bitset search algorithm guarantees 100% collision-free assignments. Every candidate is independently re-validated.
          </span>

          <button
            onClick={handleStartGeneration}
            disabled={isGenerating || !validationReport.isReadyForGeneration}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-semibold shadow-xs transition-all ${
              !isGenerating && validationReport.isReadyForGeneration
                ? 'bg-[#8C1B2E] hover:bg-[#731625] text-white cursor-pointer'
                : 'bg-stone-200 text-stone-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed'
            }`}
          >
            {isGenerating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Generating & Validating...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Execute Generation Engine</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* STEP 3: Multi-Candidate Generated Timetable Options */}
      {generationOutput && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <div>
              <h2 className="font-serif text-lg font-bold text-stone-900 dark:text-zinc-100">
                Generated Candidate Timetables ({generationOutput.candidates.length})
              </h2>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
                Each candidate was independently audited and verified against hard and soft constraints
              </p>
            </div>

            <button
              onClick={() => setActiveView('grid')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 hover:border-stone-400 rounded-lg text-xs font-semibold text-stone-700 dark:text-zinc-300 shadow-2xs transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Open Master Matrix</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {generationOutput.candidates.map((cand, idx) => {
              const valReport = generationOutput.validationReports[idx];
              const isSelected = selectedCandidateIdx === idx;

              return (
                <div
                  key={cand.candidateId}
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
                          Option {idx + 1}
                        </span>
                        {idx === 0 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                            Recommended
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-stone-400 block mt-0.5">
                        Seed #{cand.seed} · {cand.scheduledHours} sessions
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-stone-400 block">Health Score</span>
                      <span className="font-serif font-bold text-lg text-[#8C1B2E] dark:text-red-400 leading-none">
                        {cand.healthScore}
                        <span className="text-xs text-stone-400 font-normal">/100</span>
                      </span>
                    </div>
                  </div>

                  {/* Independent Validator Seal */}
                  <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-950/60 border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="h-4 w-4" />
                      <span>Hard Violations</span>
                    </span>
                    <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                      {valReport ? valReport.hardViolationsCount : 0} Conflicts
                    </strong>
                  </div>

                  {/* Soft Objective Breakdown */}
                  <div className="space-y-1.5 text-[11px] border-t border-[#E5E2D9] dark:border-zinc-800/80 pt-2.5">
                    <div className="flex justify-between text-stone-600 dark:text-zinc-400">
                      <span>Faculty Gaps Penalty:</span>
                      <strong className="font-mono text-stone-800 dark:text-zinc-200">
                        {cand.softPenalty.facultyGapsPenalty}
                      </strong>
                    </div>
                    <div className="flex justify-between text-stone-600 dark:text-zinc-400">
                      <span>Consecutive Limit Penalty:</span>
                      <strong className="font-mono text-stone-800 dark:text-zinc-200">
                        {cand.softPenalty.facultyConsecutivePenalty}
                      </strong>
                    </div>
                    <div className="flex justify-between text-stone-600 dark:text-zinc-400">
                      <span>Room Capacity Fit:</span>
                      <strong className="font-mono text-stone-800 dark:text-zinc-200">
                        {cand.softPenalty.roomCapacityFitPenalty}
                      </strong>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <button
                      onClick={() => handleSelectAndApply(idx)}
                      className={`w-full py-2 rounded-lg text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-[#8C1B2E] text-white shadow-xs'
                          : 'bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 text-stone-700 dark:text-zinc-300 hover:text-stone-900'
                      }`}
                    >
                      {isSelected ? '✓ Selected as Working Draft' : 'Select Option'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Publishing Gate Section */}
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-serif text-sm font-bold text-stone-900 dark:text-zinc-100">
                  Institutional Master Publication Gate
                </h3>
              </div>
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                Approving publishes this timetable directly to all student timetables, faculty portals, and classroom rosters.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setActiveView('grid')}
                className="px-3.5 py-2 bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 hover:border-stone-400 rounded-lg text-xs font-semibold text-stone-700 dark:text-zinc-300 shadow-2xs transition-colors"
              >
                Inspect in Grid First
              </button>

              <button
                onClick={handlePublishCurrent}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Approve & Publish to Campus</span>
              </button>
            </div>
          </div>

          {/* Publish Feedback Alert */}
          {publishFeedback && (
            <div
              className={`p-4 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
                publishFeedback.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-300'
                  : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-red-950/20 dark:border-red-800/40 dark:text-red-300'
              }`}
            >
              {publishFeedback.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
              )}
              <div>
                <div className="font-bold">{publishFeedback.success ? 'Published & Live' : 'Publication Blocked'}</div>
                <div className="mt-0.5">{publishFeedback.message}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
