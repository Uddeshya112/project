import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import {
  FlaskConical,
  Play,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  GitBranch,
  Building,
  RotateCcw
} from 'lucide-react';

export function WhatIfSimulatorView() {
  const { whatIfSimulation, simulatedSessions, runWhatIfSimulation, applySimulation, health, rooms, facultyMembers, sessions } = useTimetable();

  const [activeScenario, setActiveScenario] = useState<string>('lab301-closure');
  const [simulationRunning, setSimulationRunning] = useState<boolean>(false);
  const [hasApplied, setHasApplied] = useState<boolean>(false);

  const labTarget = rooms.find(r => r.type === 'ComputerLab' || r.type === 'HardwareLab');
  const lectureTarget = rooms.find(r => r.type === 'LectureHall' || r.type === 'SeminarRoom');
  const scenarios = [
    {
      id: 'lab301-closure',
      title: (labTarget?.name || 'Computer Lab') + ' Emergency Maintenance',
      description: 'The selected computer laboratory is temporarily unavailable. The solver reassigns affected classes while preserving hard constraints.',
      target: labTarget?.name || 'Computer Lab',
    },
    {
      id: 'faculty-leave',
      title: 'Prof. Arvind Sharma Medical Leave',
      description: 'The selected faculty member is unavailable. Qualified substitute faculty are evaluated against real workload and timetable availability.',
      target: facultyMembers.find(f => f.name.toLowerCase().includes('arvind sharma'))?.name || 'Target Faculty',
    },
    {
      id: 'exam-block',
      title: (lectureTarget?.name || 'Lecture Hall') + ' Reserved',
      description: 'The selected lecture room is temporarily unavailable. The solver reassigns affected sessions while preserving capacity, equipment, faculty and cohort constraints.',
      target: lectureTarget?.name || 'Lecture Hall',
    },
  ];

  const handleRunSimulation = async () => {
    setSimulationRunning(true);
    try {
      await runWhatIfSimulation(activeScenario, scenarios.find(s => s.id === activeScenario)?.title);
    } finally {
      setSimulationRunning(false);
    }
  };

  const handleApply = async () => {
    const result = await applySimulation(activeScenario, scenarios.find(s => s.id === activeScenario)?.title);
    if (result.success) setHasApplied(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-[#8C1B2E] dark:text-red-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <FlaskConical className="h-4 w-4" />
          <span>Non-Destructive Hypothetical Sandbox</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
          Timetable Impact Analysis & What-If Simulator
        </h1>
        <p className="text-xs sm:text-sm text-stone-600 dark:text-zinc-400 mt-1 max-w-3xl leading-relaxed">
          Evaluate disruptions, facility outages, and policy changes safely. The system clones the master schedule, executes incremental constraint re-optimization, and quantifies the blast radius before any live schedule is altered.
        </p>
      </div>

      {/* Scenario Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {scenarios.map(s => {
          const isSelected = activeScenario === s.id;
          return (
            <button
              key={s.id}
              onClick={() => {
                setActiveScenario(s.id);
                setHasApplied(false);
              }}
              className={`text-left p-4 rounded-xl border transition-all ${
                isSelected
                  ? 'bg-red-50/70 border-[#8C1B2E] text-stone-900 dark:bg-red-950/20 dark:border-red-600 dark:text-zinc-100 shadow-xs'
                  : 'bg-[#FAF9F5] dark:bg-zinc-900 border-[#E5E2D9] dark:border-zinc-800 text-stone-700 dark:text-zinc-300 hover:border-stone-400'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-mono text-[#8C1B2E] dark:text-red-400">
                  SCENARIO
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-400 font-mono border border-[#E5E2D9] dark:border-zinc-700">
                  {s.target}
                </span>
              </div>
              <h3 className="font-serif font-bold text-sm text-stone-900 dark:text-zinc-100 mb-1.5">{s.title}</h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">{s.description}</p>
            </button>
          );
        })}
      </div>

      {/* Simulation Controls & Side-by-Side Comparison */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
          <div>
            <span className="text-[10px] font-mono text-[#8C1B2E] dark:text-red-400 font-semibold uppercase tracking-wider">
              Simulation Sandbox · Active Run
            </span>
            <h2 className="text-lg font-serif font-bold text-stone-900 dark:text-zinc-100 mt-0.5">
              {scenarios.find(s => s.id === activeScenario)?.title}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRunSimulation}
              disabled={simulationRunning}
              className="flex items-center gap-2 px-3.5 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-800 dark:text-zinc-200 border border-[#E5E2D9] dark:border-zinc-700 rounded-lg text-xs font-semibold transition-colors"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${simulationRunning ? 'animate-spin' : ''}`} />
              <span>Re-run Optimization</span>
            </button>

            <button
              onClick={handleApply}
              disabled={hasApplied}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-all ${
                hasApplied
                  ? 'bg-emerald-700 text-white cursor-default'
                  : 'bg-[#8C1B2E] hover:bg-[#731625] text-white active:scale-95'
              }`}
            >
              {hasApplied ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Applied to Working Draft</span>
                </>
              ) : (
                <>
                  <GitBranch className="h-3.5 w-3.5" />
                  <span>Apply to Working Draft</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quantified Impact Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <div className="p-3.5 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-1">Affected Classes</span>
            <span className="text-2xl font-bold font-mono text-stone-900 dark:text-zinc-100 tabular-nums">
              {whatIfSimulation.impact.affectedClassesCount}
            </span>
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 block mt-1">Out of {sessions.length} visible timetable sessions</span>
          </div>

          <div className="p-3.5 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-1">Required Room Changes</span>
            <span className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400 tabular-nums">
              {whatIfSimulation.impact.requiredRoomChanges}
            </span>
            <span className="text-[10px] text-amber-700/80 block mt-1">Server-selected compatible rooms</span>
          </div>

          <div className="p-3.5 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-1">New Hard Conflicts</span>
            <span className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
              {whatIfSimulation.impact.newHardConflicts}
            </span>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block mt-1">Strict Zero Maintained</span>
          </div>

          <div className="p-3.5 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-1">Schedule Stability</span>
            <span className="text-2xl font-bold font-mono text-[#8C1B2E] dark:text-red-400 tabular-nums">
              {whatIfSimulation.impact.stabilityScore}%
            </span>
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 block mt-1">Disruption penalty: {Math.round(100 - whatIfSimulation.impact.stabilityScore)}%</span>
          </div>

          <div className="p-3.5 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-1">Projected Health Score</span>
            <span className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
              {whatIfSimulation.impact.projectedHealthScore}
            </span>
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 block mt-1">Current: {health.overallScore}</span>
          </div>
        </div>

        {/* Server-generated schedule comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-950/80 border border-[#E5E2D9] dark:border-zinc-800 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-2">
              <span className="font-bold text-xs text-stone-800 dark:text-zinc-200">Current Timetable Snapshot</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-400 border border-[#E5E2D9] dark:border-zinc-700">
                {sessions.length} sessions
              </span>
            </div>
            <div className="text-xs text-stone-600 dark:text-zinc-400 space-y-2">
              <div>Affected classes: <strong>{whatIfSimulation.impact.affectedClassesCount}</strong></div>
              <div>Affected sections: <strong>{whatIfSimulation.impact.affectedSectionNames.length}</strong></div>
              <div>Affected faculty: <strong>{whatIfSimulation.impact.affectedFacultyNames.length}</strong></div>
              <div>Room changes required: <strong>{whatIfSimulation.impact.requiredRoomChanges}</strong></div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800/40 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-emerald-200 dark:border-emerald-800/40 pb-2">
              <span className="font-bold text-xs text-emerald-900 dark:text-emerald-300">Server-Generated Candidate</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 font-semibold">
                {whatIfSimulation.impact.newHardConflicts === 0 ? 'Feasible Solution Found' : 'Hard Conflicts Detected'}
              </span>
            </div>
            <div className="text-xs text-emerald-900 dark:text-emerald-200/90 space-y-2">
              <div>Candidate sessions: <strong>{simulatedSessions.length}</strong></div>
              <div>Projected health: <strong>{whatIfSimulation.impact.projectedHealthScore}</strong></div>
              <div>Changed class slots: <strong>{Math.max(0, whatIfSimulation.impact.affectedClassesCount + whatIfSimulation.impact.requiredRoomChanges)}</strong></div>
              {whatIfSimulation.impact.affectedSectionNames.length > 0 && (
                <div>Affected sections: <strong>{whatIfSimulation.impact.affectedSectionNames.slice(0, 4).join(', ')}</strong></div>
              )}
            </div>
          </div>
        </div>

        {/* Solver Recommended Next Actions */}
        <div className="p-4 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 space-y-2 text-xs shadow-xs">
          <span className="font-semibold text-stone-900 dark:text-zinc-200 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Optimization Solver Recommendation & Mitigation Strategy
          </span>
          <ul className="text-stone-600 dark:text-zinc-400 space-y-1 list-disc list-inside text-[11px] leading-relaxed">
            {whatIfSimulation.suggestedActions.map((action, idx) => (
              <li key={idx}>{action}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
