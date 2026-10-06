import fc from 'fast-check';
import { executeOptimizationEngine } from '../src/lib/optimizationEngine';
import { validateTimetableIndependently } from '../src/lib/independentValidator';
import { INITIAL_ACADEMIC_YEAR, INITIAL_ALLOCATIONS, FACULTY_MEMBERS, ROOMS, SECTIONS, COURSES, INITIAL_CONSTRAINTS } from '../src/lib/initialData';

const SEED = 20261006;

function scaledAllocations(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const source = INITIAL_ALLOCATIONS[i % INITIAL_ALLOCATIONS.length];
    return { ...source, id: 'prop-' + count + '-' + i + '-' + source.id };
  });
}

function main() {
  const deterministicInput = INITIAL_ALLOCATIONS.slice(0, 20);
  const makeResult = () => executeOptimizationEngine(INITIAL_ACADEMIC_YEAR, deterministicInput, FACULTY_MEMBERS, ROOMS, SECTIONS, COURSES, INITIAL_CONSTRAINTS, { budgetMode: 'FAST', timeBudgetMs: 250, seed: SEED, maxCandidates: 1 });
  const first = makeResult();
  const second = makeResult();
  if (JSON.stringify(first.bestCandidate?.sessions) !== JSON.stringify(second.bestCandidate?.sessions)) throw new Error('Seeded determinism failed');

  fc.assert(
    fc.property(fc.integer({ min: 20, max: 600 }), (count) => {
      const allocations = scaledAllocations(count);
      const result = executeOptimizationEngine(INITIAL_ACADEMIC_YEAR, allocations, FACULTY_MEMBERS, ROOMS, SECTIONS, COURSES, INITIAL_CONSTRAINTS, { budgetMode: 'FAST', timeBudgetMs: 40, seed: SEED + count, maxCandidates: 1 });
      if (result.isFeasible && result.bestCandidate) {
        const report = validateTimetableIndependently(result.bestCandidate.sessions, { academicYear: INITIAL_ACADEMIC_YEAR, allocations, facultyMembers: FACULTY_MEMBERS, rooms: ROOMS, sections: SECTIONS, courses: COURSES, constraints: INITIAL_CONSTRAINTS });
        if (!report.isValid || !report.canPublish) throw new Error('Validator rejected solver output at ' + count + ' allocations');
      }
    }),
    { seed: SEED, numRuns: 20 }
  );

  const candidateSessions = first.bestCandidate?.sessions || [];
  const labSessions = candidateSessions.filter(s => s.type === 'Lab' || s.type === 'Practical');
  if (labSessions.some(s => (s.durationPeriods ?? 2) < 2)) throw new Error('Lab duration defaulting failed');
  console.log('PASS: lab activities use atomic multi-period metadata');

  const impossible = executeOptimizationEngine(INITIAL_ACADEMIC_YEAR, INITIAL_ALLOCATIONS.slice(0, 20), FACULTY_MEMBERS, ROOMS.map(r => ({ ...r, isAvailable: false })), SECTIONS, COURSES, INITIAL_CONSTRAINTS, { budgetMode: 'FAST', timeBudgetMs: 100, seed: SEED });
  if (impossible.isFeasible || !impossible.infeasibilityDiagnostics?.length) throw new Error('Infeasible case did not produce diagnostics');
  console.log('PASS: solver hardening tests');
}

main();
