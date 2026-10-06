// Scheduling engine checks against the sample dataset. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeOptimizationEngine, type EngineOptions } from '../src/lib/optimizationEngine';
import { validateTimetableIndependently } from '../src/lib/independentValidator';
import { INITIAL_ACADEMIC_YEAR as AY, INITIAL_CONSTRAINTS as CN } from '../src/lib/initialData';
import { buildDemoDataset } from '../src/server/demoData';
import type { ClassSession, CourseAllocation, Faculty } from '../src/types';

const d = buildDemoDataset();
const totalHours = (al: CourseAllocation[]) => al.reduce((n, a) => n + a.hoursPerWeek, 0);
const run = (opts: EngineOptions = {}, al = d.allocations, fa: Faculty[] = d.facultyMembers) =>
  executeOptimizationEngine(AY, al, fa, d.rooms, d.sections, d.courses, CN, { budgetMode: 'FAST', seed: 1337, ...opts });
const key = (s: ClassSession) => `${s.courseId}|${s.sectionId}|${s.subSectionId ?? ''}|${s.day}|${s.timeSlotId}`;
const ctx = { academicYear: AY, allocations: d.allocations, facultyMembers: d.facultyMembers, rooms: d.rooms, sections: d.sections, courses: d.courses, constraints: CN };

test('schedules every allocated hour with zero hard violations', () => {
  const r = run();
  assert.equal(r.isFeasible, true, r.infeasibilityDiagnostics?.join(' | ') || 'no diagnostic');
  assert.equal(r.bestCandidate!.sessions.length, totalHours(d.allocations));
  assert.equal(validateTimetableIndependently(r.bestCandidate!.sessions, ctx).hardViolationsCount, 0);
});

test('local search lowers the soft penalty and keeps hard constraints', () => {
  const fast = run();
  const tuned = run({ budgetMode: 'BALANCED', maxCandidates: 1, timeBudgetMs: 1500 });
  assert.ok(tuned.bestCandidate!.softPenalty.totalPenalty < fast.bestCandidate!.softPenalty.totalPenalty, 'penalty should improve');
  assert.equal(validateTimetableIndependently(tuned.bestCandidate!.sessions, ctx).hardViolationsCount, 0);
});

test('health score is not pinned to a floor at realistic size', () => {
  const h = run().bestCandidate!.healthScore;
  assert.ok(h > 10 && h <= 100, `health ${h}`);
});

test('candidates are genuinely different and the seed matters, yet runs are deterministic', () => {
  const r = run({ budgetMode: 'BALANCED', maxCandidates: 3, timeBudgetMs: 1500 });
  assert.ok(r.allCandidates.length >= 2);
  const first = new Set(r.allCandidates[0].sessions.map(key));
  assert.ok(r.allCandidates[1].sessions.filter((s) => !first.has(key(s))).length > 50);

  const a = run({ seed: 1 }).bestCandidate!.sessions.map(key);
  const b = run({ seed: 98765 }).bestCandidate!.sessions.map(key);
  assert.notDeepEqual(a, b);
  assert.deepEqual(run({ seed: 42 }).bestCandidate!.sessions, run({ seed: 42 }).bestCandidate!.sessions);
});

test('an odd-hour lab is scheduled instead of failing the whole run', () => {
  const i = d.allocations.findIndex((a) => a.sessionType === 'Lab');
  const odd = d.allocations.map((a, j) => (j === i ? { ...a, hoursPerWeek: 3 } : a));
  const r = run({}, odd);
  assert.equal(r.isFeasible, true);
  assert.equal(r.bestCandidate!.sessions.length, totalHours(odd));
});

test('faculty protected slots are never used, including after local search', () => {
  const slot = run().bestCandidate!.sessions[0];
  const prot = d.facultyMembers.map((f) => ({
    ...f,
    preferences: { ...f.preferences, protectedSlots: [{ day: slot.day, periodId: slot.timeSlotId, reason: 'Research' as const }] },
  }));
  const r = run({ budgetMode: 'MAXIMUM_OPTIMIZATION', timeBudgetMs: 1500 }, d.allocations, prot);
  assert.equal(r.isFeasible, true);
  assert.equal(r.bestCandidate!.sessions.filter((s) => s.day === slot.day && s.timeSlotId === slot.timeSlotId).length, 0);
});

test('locked sessions stay exactly where they were pinned', () => {
  const base = run().bestCandidate!.sessions;
  const pinned = base.filter((s) => s.type === 'Lecture').slice(0, 20);
  const r = run({ seed: 777, budgetMode: 'BALANCED', timeBudgetMs: 1000, fixedSessions: pinned });
  const out = new Set(r.bestCandidate!.sessions.map((s) => `${key(s)}|${s.roomId}`));
  for (const p of pinned) assert.ok(out.has(`${key(p)}|${p.roomId}`), `pinned ${key(p)} moved`);
  assert.equal(r.bestCandidate!.sessions.filter((s) => s.isLocked).length, pinned.length);
});

test('impossible input is reported with a diagnostic, not a silent failure', () => {
  const al = [...d.allocations, { ...d.allocations[0], id: 'too-big', hoursPerWeek: 60 }];
  const r = run({}, al);
  assert.equal(r.isFeasible, false);
  assert.ok((r.infeasibilityDiagnostics ?? []).length > 0);
});
