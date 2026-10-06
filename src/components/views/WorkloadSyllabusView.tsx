import React from 'react';
import { useTimetable } from '../../context/TimetableContext';
import type { TimeSlot } from '../../types';
import {
  BarChart3,
  BookOpen,
  ShieldCheck,
  Info
} from 'lucide-react';

// Sample content shown until real data exists — edit freely.
const SAMPLE_EXAM_COUNTDOWN = 'Semester Exam in 21 Days';

function SampleBadge() {
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 border border-[#E5E2D9] dark:border-zinc-700 font-sans">
      Sample
    </span>
  );
}

/** Length of a period in hours from its "HH:MM" start/end (1 if unparseable). */
const slotHours = (slot?: TimeSlot) => {
  if (!slot) return 1;
  const mins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const h = (mins(slot.endTime) - mins(slot.startTime)) / 60;
  return Number.isFinite(h) && h > 0 ? h : 1;
};
const fmtHrs = (h: number) => `${Math.round(h * 10) / 10}`;

export function WorkloadSyllabusView() {
  const { academicYear, courses, facultyMembers, sessions } = useTimetable();

  const slotById = new Map(academicYear.timeSlots.map(t => [t.id, t]));
  // Weekly direct-teaching hours per faculty member, from the (non-cancelled) timetable sessions.
  const loadByFaculty = new Map<string, number>();
  for (const s of sessions) {
    if (s.status === 'Cancelled') continue;
    loadByFaculty.set(s.facultyId, (loadByFaculty.get(s.facultyId) ?? 0) + slotHours(slotById.get(s.timeSlotId)));
  }
  const overloadedCount = facultyMembers.filter(f => (loadByFaculty.get(f.id) ?? 0) > f.maxDirectTeachingHours).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-[#8C1B2E] dark:text-red-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <BarChart3 className="h-4 w-4" />
          <span>Academic Intelligence & Statutory Compliance</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
          Syllabus Progress & Faculty UGC Workload
        </h1>
        <p className="text-xs text-stone-600 dark:text-zinc-400 mt-1 max-w-3xl leading-relaxed">
          Syllabus progress per course, and each faculty member's weekly teaching load from the timetable compared with their teaching cap.
        </p>
      </div>

      {/* Syllabus Progress & Risk Breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-serif font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#8C1B2E] dark:text-red-400" />
            <span>Syllabus Completion & Exam Readiness Radar</span>
          </h2>
          <span className="text-xs text-stone-500 dark:text-zinc-400 font-mono flex items-center gap-1.5">
            {SAMPLE_EXAM_COUNTDOWN} <SampleBadge />
          </span>
        </div>

        {courses.length === 0 && (
          <div className="p-4 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl text-xs text-stone-500 dark:text-zinc-400 italic">
            No courses yet.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map(course => {
            const faculty = facultyMembers.find(f => f.id === course.primaryFacultyId);
            const remaining = Math.max(0, course.totalSemesterHours - course.completedHours);
            const completionPercent = course.totalSemesterHours > 0
              ? Math.min(100, Math.round((course.completedHours / course.totalSemesterHours) * 100))
              : 0;

            // Risk from cancelled (not yet recovered) hours
            let risk: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
            let riskNote = 'No cancelled hours';

            if (course.cancelledHours >= 2) {
              risk = 'RED';
              riskNote = `${course.cancelledHours}h cancelled — make-up classes needed`;
            } else if (course.cancelledHours === 1) {
              risk = 'YELLOW';
              riskNote = '1h cancelled — schedule a make-up class';
            }

            return (
              <div
                key={course.id}
                className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 space-y-4 shadow-xs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-[#8C1B2E] dark:text-red-400">
                      {course.code}
                    </span>
                    <h3 className="font-serif font-bold text-sm text-stone-900 dark:text-zinc-100 mt-0.5">{course.name}</h3>
                    <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-1">
                      Lead: {faculty?.name ?? 'Unassigned'}
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                      risk === 'RED'
                        ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30'
                        : risk === 'YELLOW'
                        ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
                    }`}
                  >
                    Risk: {risk}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-stone-500 dark:text-zinc-400">Completion</span>
                    <span className="text-stone-900 dark:text-zinc-100 font-bold">{completionPercent}%</span>
                  </div>
                  <div className="h-2 w-full bg-stone-200 dark:bg-zinc-950 rounded-full overflow-hidden border border-[#E5E2D9] dark:border-zinc-800">
                    <div
                      className={`h-full transition-all duration-500 ${
                        risk === 'RED' ? 'bg-[#8C1B2E]' : risk === 'YELLOW' ? 'bg-amber-600' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                </div>

                {/* Numbers Grid */}
                <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono pt-2 border-t border-[#E5E2D9] dark:border-zinc-800">
                  <div className="p-1.5 bg-white dark:bg-zinc-950/60 rounded border border-[#E5E2D9] dark:border-zinc-800">
                    <span className="text-stone-500 dark:text-zinc-500 block">Required</span>
                    <span className="text-stone-800 dark:text-zinc-200 font-bold">{course.totalSemesterHours}h</span>
                  </div>
                  <div className="p-1.5 bg-white dark:bg-zinc-950/60 rounded border border-[#E5E2D9] dark:border-zinc-800">
                    <span className="text-stone-500 dark:text-zinc-500 block">Done</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">{course.completedHours}h</span>
                  </div>
                  <div className="p-1.5 bg-white dark:bg-zinc-950/60 rounded border border-[#E5E2D9] dark:border-zinc-800">
                    <span className="text-stone-500 dark:text-zinc-500 block">Cancelled</span>
                    <span className="text-rose-700 dark:text-rose-400 font-bold">{course.cancelledHours}h</span>
                  </div>
                  <div className="p-1.5 bg-white dark:bg-zinc-950/60 rounded border border-[#E5E2D9] dark:border-zinc-800">
                    <span className="text-stone-500 dark:text-zinc-500 block">Remain</span>
                    <span className="text-amber-700 dark:text-amber-400 font-bold">{remaining}h</span>
                  </div>
                </div>

                <div className="text-[11px] text-stone-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Info className="h-3 w-3 shrink-0 text-stone-400 dark:text-zinc-500" />
                  <span>{riskNote}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* UGC Faculty Workload Matrix */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-6 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
          <div>
            <h2 className="text-base font-serif font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
              <ShieldCheck className={`h-5 w-5 ${overloadedCount ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span>UGC 2026 Faculty Direct Teaching Compliance</span>
            </h2>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
              Professors/Associate: 14 teaching hrs/wk · Assistant Professors: 16 teaching hrs/wk · Overall 40 hrs institutional
            </p>
          </div>

          {facultyMembers.length > 0 && sessions.length > 0 && (
            <span
              className={`text-xs font-mono px-3 py-1 rounded-full border font-semibold self-start sm:self-auto ${
                overloadedCount
                  ? 'text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
                  : 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
              }`}
            >
              {overloadedCount
                ? `${overloadedCount} of ${facultyMembers.length} faculty over their cap`
                : `All ${facultyMembers.length} faculty within their cap`}
            </span>
          )}
        </div>

        {sessions.length === 0 && (
          <div className="text-xs text-stone-500 dark:text-zinc-400 italic">
            No timetable yet — loads will appear once sessions are scheduled.
          </div>
        )}

        <div className="divide-y divide-[#E5E2D9] dark:divide-zinc-800">
          {facultyMembers.map(faculty => {
            const activeHours = loadByFaculty.get(faculty.id) ?? 0;
            const cap = faculty.maxDirectTeachingHours;
            const isOverloaded = activeHours > cap;
            const researchHours = (faculty.preferences?.protectedSlots ?? [])
              .filter(p => p.reason === 'Research')
              .reduce((n, p) => n + slotHours(slotById.get(p.periodId)), 0);

            return (
              <div key={faculty.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                <div className="w-64 shrink-0">
                  <div className="font-bold text-stone-900 dark:text-white text-sm">{faculty.name}</div>
                  <div className="text-stone-500 dark:text-zinc-400 text-[11px]">{faculty.designation} · {faculty.email}</div>
                </div>

                {/* Hours Metric Bar */}
                <div className="flex-1 max-w-md space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-stone-500 dark:text-zinc-400">Direct Teaching Load</span>
                    <span className="text-stone-800 dark:text-zinc-200 font-bold">
                      {fmtHrs(activeHours)} / {cap} hrs
                    </span>
                  </div>
                  <div className="h-2 w-full bg-stone-200 dark:bg-zinc-950 rounded-full overflow-hidden border border-[#E5E2D9] dark:border-zinc-800">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isOverloaded ? 'bg-[#8C1B2E]' : 'bg-stone-700 dark:bg-zinc-400'
                      }`}
                      style={{
                        width: `${cap > 0 ? Math.min(100, Math.round((activeHours / cap) * 100)) : activeHours > 0 ? 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 text-right">
                  <div>
                    <span className="text-stone-500 dark:text-zinc-400 block text-[10px]">Research Hours</span>
                    <span className="font-mono text-stone-800 dark:text-zinc-200 font-semibold">{fmtHrs(researchHours)} hrs (Protected)</span>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold font-mono ${
                      isOverloaded
                        ? 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20'
                    }`}
                  >
                    {isOverloaded ? 'Over Cap' : 'Within Cap'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
