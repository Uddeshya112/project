import React, { useState } from 'react';
import { api } from '../../lib/api';
import type { OptimizationMetrics, SoftPenaltyBreakdown } from '../../lib/optimizationEngine';
import { Cpu, Play, AlertTriangle } from 'lucide-react';

/** One engine run from GET /api/timetable/benchmark. */
interface BenchmarkRun {
  isFeasible: boolean;
  statusMessage: string;
  metrics: OptimizationMetrics;
  sessions: number;
  softPenalty: SoftPenaltyBreakdown | null;
}
type BenchmarkResponse = Record<'fast' | 'balanced' | 'maximum', BenchmarkRun>;

const MODES = [
  {
    key: 'fast',
    title: 'Fast',
    budget: '300 ms time budget',
    tag: 'text-amber-700 dark:text-amber-400',
    description: 'Shortest optimisation budget: finds a feasible timetable and stops improving early.',
  },
  {
    key: 'balanced',
    title: 'Balanced',
    budget: '800 ms time budget',
    tag: 'text-sky-700 dark:text-cyan-400',
    description: 'Default trade-off between run time and soft-constraint quality.',
  },
  {
    key: 'maximum',
    title: 'Maximum Optimization',
    budget: '1500 ms time budget',
    tag: 'text-[#8C1B2E] dark:text-red-400',
    description: 'Longest local-search budget for the lowest soft-constraint penalty.',
  },
] as const;

const ms = (n: number) => `${Math.round(n * 10) / 10} ms`;
const num = (n: number) => n.toLocaleString();

export function SolverBenchmarkView() {
  const [result, setResult] = useState<BenchmarkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const runBenchmark = async () => {
    setIsRunning(true);
    setError(null);
    try {
      setResult(await api<BenchmarkResponse>('/api/timetable/benchmark'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The benchmark could not be run.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-[#8C1B2E] dark:text-red-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Cpu className="h-4 w-4" />
            <span>Core Algorithms · Scheduling Engine</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
            Scheduling Engine Benchmark
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 dark:text-zinc-400 mt-1 max-w-3xl leading-relaxed">
            Runs the server's scheduling engine (constraint search with forward checking, then local-search optimisation of soft penalties) on the current academic data in three time-budget modes and reports the measured results. Limited to one run every 10 seconds.
          </p>
        </div>

        <button
          onClick={runBenchmark}
          disabled={isRunning}
          className="px-4 py-2 bg-[#8C1B2E] hover:bg-[#731625] text-white rounded-lg text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 shrink-0"
        >
          <Play className="h-3.5 w-3.5" />
          <span>{isRunning ? 'Running…' : 'Run benchmark'}</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* One card per budget mode */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MODES.map(mode => {
          const run = result?.[mode.key];
          const rows: [string, string][] = run
            ? [
                ['Total wall clock', ms(run.metrics.totalTimeMs)],
                ['Compilation', ms(run.metrics.compilationTimeMs)],
                ['Feasibility search', ms(run.metrics.feasibilityTimeMs)],
                ['Optimisation', ms(run.metrics.optimizationTimeMs)],
                ['Sessions placed', num(run.sessions)],
                ['Backtracks', num(run.metrics.backtracksCount)],
                ['Constraint checks', num(run.metrics.constraintChecksCount)],
                ['Candidates evaluated', num(run.metrics.candidatesEvaluated)],
                ['Soft penalty (lower is better)', run.softPenalty ? num(Math.round(run.softPenalty.totalPenalty)) : '—'],
                ['Health score', `${run.metrics.healthScore}%`],
              ]
            : [];
          return (
            <div key={mode.key} className="p-5 rounded-xl border bg-[#FAF9F5] dark:bg-zinc-900 border-[#E5E2D9] dark:border-zinc-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-mono font-bold uppercase ${mode.tag}`}>{mode.budget}</span>
                {run && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold border ${
                      run.isFeasible
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                        : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                    }`}
                  >
                    {run.isFeasible ? 'Feasible' : 'Infeasible'}
                  </span>
                )}
              </div>
              <h3 className="font-serif font-bold text-base text-stone-900 dark:text-zinc-100">{mode.title}</h3>
              <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">{mode.description}</p>

              {run ? (
                <>
                  <p className="text-[11px] text-stone-500 dark:text-zinc-400 leading-relaxed">{run.statusMessage}</p>
                  <dl className="bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 divide-y divide-[#E5E2D9] dark:divide-zinc-800 text-xs">
                    {rows.map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between px-3 py-1.5">
                        <dt className="text-stone-500 dark:text-zinc-400">{label}</dt>
                        <dd className="font-mono font-semibold text-stone-900 dark:text-zinc-100 tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="text-[11px] text-stone-400 dark:text-zinc-500 italic">{isRunning ? 'Running…' : 'Not run yet.'}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
