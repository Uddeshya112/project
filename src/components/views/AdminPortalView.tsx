import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import {
  Shield,
  Activity,
  Calendar,
  Layers,
  FlaskConical,
  Cpu,
  History,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Zap,
  Building,
  Users
} from 'lucide-react';

import { TimetableGridView } from './TimetableGridView';
import { RecoveryEngineView } from './RecoveryEngineView';
import { WhatIfSimulatorView } from './WhatIfSimulatorView';
import { SolverBenchmarkView } from './SolverBenchmarkView';
import { GovernanceView } from './GovernanceView';
import { AuthGovernanceView } from './AuthGovernanceView';

export function AdminPortalView() {
  const {
    health,
    makeupTasks,
    sessions,
    versions,
    rooms,
    facultyMembers,
    sections,
    courses,
    setActiveView,
  } = useTimetable();

  const [activeWorkflow, setActiveWorkflow] = useState<'operations' | 'planning' | 'governance' | 'system'>('operations');
  const [subView, setSubView] = useState<'overview' | 'grid' | 'recovery' | 'whatif' | 'solvers' | 'audit' | 'rbac'>('overview');

  const pendingMakeups = makeupTasks.filter(m => m.status !== 'Scheduled');
  const cancelledSessions = sessions.filter(s => s.status === 'Cancelled');

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-[#8C1B2E] dark:text-red-400 text-xs font-semibold tracking-wider mb-0.5">
            <Shield className="h-4 w-4" />
            <span>Academic Administration & Governance</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
            Admin Console
          </h1>
          <p className="text-xs text-stone-600 dark:text-zinc-400 mt-0.5">
            Overview of university rooms, timetable approvals, and user accounts.
          </p>
        </div>

        {/* Workflow Switcher Tabs */}
        <div className="flex bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 p-1 rounded-xl text-xs font-medium">
          <button
            onClick={() => {
              setActiveWorkflow('operations');
              setSubView('overview');
            }}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeWorkflow === 'operations'
                ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                : 'text-stone-700 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => {
              setActiveWorkflow('governance');
              setSubView('audit');
            }}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeWorkflow === 'governance'
                ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                : 'text-stone-700 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
            }`}
          >
            Approvals
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {subView === 'overview' && (
        <div className="space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-[#FAF9F5] dark:bg-zinc-900/50 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-1 shadow-xs">
              <span className="text-xs text-stone-500 dark:text-zinc-400 font-medium">Total Faculty</span>
              <div className="text-2xl font-bold font-serif text-stone-900 dark:text-zinc-100">{facultyMembers.length}</div>
              <span className="text-[11px] text-stone-500 dark:text-zinc-400">Active Teachers</span>
            </div>

            <div className="p-4 bg-[#FAF9F5] dark:bg-zinc-900/50 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-1 shadow-xs">
              <span className="text-xs text-stone-500 dark:text-zinc-400 font-medium">Total Courses</span>
              <div className="text-2xl font-bold font-serif text-stone-900 dark:text-zinc-100">{courses.length}</div>
              <span className="text-[11px] text-stone-500 dark:text-zinc-400">Active Offerings</span>
            </div>

            <div className="p-4 bg-[#FAF9F5] dark:bg-zinc-900/50 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-1 shadow-xs">
              <span className="text-xs text-stone-500 dark:text-zinc-400 font-medium">Classrooms & Labs</span>
              <div className="text-2xl font-bold font-serif text-stone-900 dark:text-zinc-100">{rooms.length}</div>
              <span className="text-[11px] text-stone-500 dark:text-zinc-400">Turing & Academic Blocks</span>
            </div>

            <div className="p-4 bg-[#FAF9F5] dark:bg-zinc-900/50 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-1 shadow-xs">
              <span className="text-xs text-stone-500 dark:text-zinc-400 font-medium">Timetable Health</span>
              <div className="text-2xl font-bold font-serif text-emerald-700 dark:text-emerald-400">{health.overallScore}%</div>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">No Clashes</span>
            </div>
          </div>

          {/* Quick Action Navigation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={() => setActiveView('grid')}
              className="p-4 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl cursor-pointer hover:border-[#8C1B2E] transition-all shadow-xs space-y-2 group"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-900 dark:text-zinc-100 text-sm group-hover:text-[#8C1B2E] transition-colors">View Full Master Timetable</span>
                <ArrowRight className="h-4 w-4 text-stone-400 group-hover:text-[#8C1B2E] transition-colors" />
              </div>
              <p className="text-xs text-stone-600 dark:text-zinc-400">
                Inspect weekly class schedules across all sections, teachers, and rooms.
              </p>
            </div>

            <div
              onClick={() => setActiveView('governance')}
              className="p-4 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl cursor-pointer hover:border-[#8C1B2E] transition-all shadow-xs space-y-2 group"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-900 dark:text-zinc-100 text-sm group-hover:text-[#8C1B2E] transition-colors">Approvals & Timetable Status</span>
                <ArrowRight className="h-4 w-4 text-stone-400 group-hover:text-[#8C1B2E] transition-colors" />
              </div>
              <p className="text-xs text-stone-600 dark:text-zinc-400">
                Review timetable drafts, check approval status, and publish schedules.
              </p>
            </div>
          </div>
        </div>
      )}

      {subView === 'grid' && <TimetableGridView />}
      {subView === 'audit' && <GovernanceView />}
    </div>
  );
}
