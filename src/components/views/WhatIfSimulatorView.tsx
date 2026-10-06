import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import {
  FlaskConical,
  CheckCircle2,
  Send
} from 'lucide-react';

// Sample content shown until real data exists — edit freely.
const SAMPLE_SCENARIOS = [
  {
    id: 'lab301-closure',
    title: 'Lab 301 Emergency Hardware Maintenance (3 Days)',
    description: 'Main CS computer lab undergoes urgent GPU rack thermal servicing. 14 laboratory and lecture sessions must be rerouted.',
    target: 'Lab 301',
  },
  {
    id: 'faculty-leave',
    title: 'Prof. Arvind Sharma Medical Leave (1 Week)',
    description: 'Primary DBMS instructor unavailable for 5 working days. Substitute assignments are evaluated against weekly teaching caps.',
    target: 'Prof. Arvind Sharma',
  },
  {
    id: 'exam-block',
    title: 'Auditorium 101 Reserved for GATE Mock Exams',
    description: 'High-capacity lecture hall blocked on Wednesday & Thursday. Impact on large combined lectures evaluated.',
    target: 'Auditorium 101',
  },
];
const SAMPLE_BASELINE = [
  { course: 'CS501 Operating Systems Lab', slot: 'Mon 13:00 · Lab 301' },
  { course: 'CS503 Network Security Lab', slot: 'Tue 14:00 · Lab 301' },
  { course: 'EC501 VLSI Simulation Lab', slot: 'Wed 10:00 · Lab 301' },
];
const SAMPLE_CANDIDATE = [
  { course: 'CS501 Operating Systems Lab', slot: 'Mon 13:00 · Rerouted to Lab 302' },
  { course: 'CS503 Network Security Lab', slot: 'Tue 14:00 · Rerouted to Lab 302' },
  { course: 'EC501 VLSI Simulation Lab', slot: 'Wed 10:00 · Shifted to Thu 14:00' },
];

function SampleBadge() {
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 border border-[#E5E2D9] dark:border-zinc-700 normal-case tracking-normal">
      Sample
    </span>
  );
}

export function WhatIfSimulatorView() {
  const { whatIfSimulation, applySimulation, health } = useTimetable();

  const [activeScenario, setActiveScenario] = useState<string>(SAMPLE_SCENARIOS[0].id);
  const [sending, setSending] = useState(false);
  const [sentScenario, setSentScenario] = useState<string | null>(null);
  const hasSent = sentScenario === activeScenario;

  const handleSend = async () => {
    setSending(true);
    const r = await applySimulation(SAMPLE_SCENARIOS.find(s => s.id === activeScenario)?.title);
    setSending(false);
    if (r.success) setSentScenario(activeScenario);
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
          Explore disruptions, facility outages, and policy changes. The scenarios and impact figures below are illustrative samples; sending one to the coordinator asks for a review and does not change the live timetable.
        </p>
      </div>

      {/* Scenario Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SAMPLE_SCENARIOS.map(s => {
          const isSelected = activeScenario === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveScenario(s.id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                isSelected
                  ? 'bg-red-50/70 border-[#8C1B2E] text-stone-900 dark:bg-red-950/20 dark:border-red-600 dark:text-zinc-100 shadow-xs'
                  : 'bg-[#FAF9F5] dark:bg-zinc-900 border-[#E5E2D9] dark:border-zinc-800 text-stone-700 dark:text-zinc-300 hover:border-stone-400'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-mono text-[#8C1B2E] dark:text-red-400 flex items-center gap-1.5">
                  SCENARIO <SampleBadge />
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
            <span className="text-[10px] font-mono text-[#8C1B2E] dark:text-red-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              Selected Scenario · Projected Impact <SampleBadge />
            </span>
            <h2 className="text-lg font-serif font-bold text-stone-900 dark:text-zinc-100 mt-0.5">
              {SAMPLE_SCENARIOS.find(s => s.id === activeScenario)?.title}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSend}
              disabled={sending || hasSent}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-all disabled:opacity-80 ${
                hasSent
                  ? 'bg-emerald-700 text-white cursor-default'
                  : 'bg-[#8C1B2E] hover:bg-[#731625] text-white active:scale-95'
              }`}
            >
              {hasSent ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Sent for review</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>{sending ? 'Sending…' : 'Send to coordinator for review'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Projected Impact Metrics (sample) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <div className="p-3.5 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-1">Affected Classes</span>
            <span className="text-2xl font-bold font-mono text-stone-900 dark:text-zinc-100 tabular-nums">
              {whatIfSimulation.impact.affectedClassesCount}
            </span>
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 block mt-1">Sample projection</span>
          </div>

          <div className="p-3.5 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-1">Required Room Changes</span>
            <span className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400 tabular-nums">
              {whatIfSimulation.impact.requiredRoomChanges}
            </span>
            <span className="text-[10px] text-amber-700/80 block mt-1">Reassigned to Lab 302</span>
          </div>

          <div className="p-3.5 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-1">New Hard Conflicts</span>
            <span className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
              {whatIfSimulation.impact.newHardConflicts}
            </span>
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 block mt-1">Sample projection</span>
          </div>

          <div className="p-3.5 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-1">Schedule Stability</span>
            <span className="text-2xl font-bold font-mono text-[#8C1B2E] dark:text-red-400 tabular-nums">
              {whatIfSimulation.impact.stabilityScore}%
            </span>
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 block mt-1">Sample projection</span>
          </div>

          <div className="p-3.5 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-1">Projected Health Score</span>
            <span className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
              {whatIfSimulation.impact.projectedHealthScore}
            </span>
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 block mt-1">Current draft: {health.overallScore}</span>
          </div>
        </div>

        {/* Side-by-Side Schedule Comparison (sample) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-950/80 border border-[#E5E2D9] dark:border-zinc-800 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-2">
              <span className="font-bold text-xs text-stone-800 dark:text-zinc-200">Current Schedule (Baseline)</span>
              <SampleBadge />
            </div>
            <ul className="text-xs text-stone-600 dark:text-zinc-400 space-y-2">
              {SAMPLE_BASELINE.map(row => (
                <li key={row.course} className="flex items-center justify-between">
                  <span>{row.course}</span>
                  <span className="font-mono text-stone-800 dark:text-zinc-300">{row.slot}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800/40 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-emerald-200 dark:border-emerald-800/40 pb-2">
              <span className="font-bold text-xs text-emerald-900 dark:text-emerald-300">Simulated Candidate</span>
              <SampleBadge />
            </div>
            <ul className="text-xs text-emerald-900 dark:text-emerald-200/90 space-y-2">
              {SAMPLE_CANDIDATE.map(row => (
                <li key={row.course} className="flex items-center justify-between">
                  <span>{row.course}</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">{row.slot}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Suggested Next Actions (sample) */}
        <div className="p-4 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 space-y-2 text-xs shadow-xs">
          <span className="font-semibold text-stone-900 dark:text-zinc-200 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Suggested Mitigation Strategy <SampleBadge />
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
