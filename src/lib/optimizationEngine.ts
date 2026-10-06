import {
  ClassSession,
  Room,
  Faculty,
  StudentSection,
  Course,
  CourseAllocation,
  AcademicConstraint,
  AcademicYearConfig,
  DayOfWeek,
  ValidationReport,
} from '../types';
import { validateTimetableIndependently } from './independentValidator';

/**
 * High-Performance Timetable Optimization Engine
 * - Phase A: Constraint Satisfaction (MRV + Forward Checking + Bitset Hard Constraints)
 * - Phase B: Local Search Soft Constraint Penalty Minimization
 * - Deterministic Seeded PRNG
 * - Infeasibility Pre-Compilation Diagnostics
 * - Multi-Candidate Search & Performance Instrumentation
 */

export type BudgetMode = 'FAST' | 'BALANCED' | 'MAXIMUM_OPTIMIZATION';
export type OptimizationProfile = 'STUDENT_FOCUSED' | 'FACULTY_FOCUSED' | 'BALANCED';

export interface EngineOptions {
  budgetMode?: BudgetMode;
  optimizationProfile?: OptimizationProfile;
  timeBudgetMs?: number; // Max time limit for optimization
  seed?: number; // Deterministic seed
  maxCandidates?: number; // Number of top candidate schedules to generate
}

export interface SoftPenaltyBreakdown {
  facultyGapsPenalty: number;
  facultyConsecutivePenalty: number;
  studentGapsPenalty: number;
  studentWorkloadImbalancePenalty: number;
  courseDistributionPenalty: number;
  roomCapacityFitPenalty: number;
  facultyPreferenceBonus: number;
  totalPenalty: number;
}

export interface OptimizationMetrics {
  compilationTimeMs: number;
  feasibilityTimeMs: number;
  optimizationTimeMs: number;
  totalTimeMs: number;
  candidatesEvaluated: number;
  candidatesPruned: number;
  backtracksCount: number;
  constraintChecksCount: number;
  hardConstraintViolations: number;
  healthScore: number;
}

export interface GeneratedCandidate {
  candidateId: string;
  seed: number;
  sessions: ClassSession[];
  hardConstraintViolations: number;
  softPenalty: SoftPenaltyBreakdown;
  healthScore: number; // 0-100
  scheduledHours: number;
  totalRequestedHours: number;
  unscheduledAllocations: CourseAllocation[];
}

export interface EngineResult {
  success: boolean;
  isFeasible: boolean;
  statusMessage: string;
  infeasibilityDiagnostics?: string[];
  metrics: OptimizationMetrics;
  bestCandidate?: GeneratedCandidate;
  allCandidates: GeneratedCandidate[];
}

// ---------------------------------------------------------------------------
// Seeded Pseudo-Random Number Generator (Xorshift32) for Determinism
// ---------------------------------------------------------------------------
class SeededPRNG {
  private state: number;

  constructor(seed: number = 1337) {
    this.state = seed === 0 ? 1337 : seed;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x;
    return (x >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

// ---------------------------------------------------------------------------
// Internal Compiled Scheduling Problem Representation
// ---------------------------------------------------------------------------
interface SlotRef {
  slotIdx: number; // 0 .. totalSlots-1
  dayIdx: number;  // 0 .. numDays-1
  periodIdx: number; // 0 .. numPeriods-1
  day: DayOfWeek;
  timeSlotId: string;
}

interface InternalAllocation {
  allocIdx: number;
  allocation: CourseAllocation;
  course: Course;
  faculty: Faculty;
  section: StudentSection;
  facultyIdx: number;
  sectionIdx: number;
  subSectionIdx?: number;
  requiredHours: number;
  sessionType: string;
  candidateRooms: number[]; // roomIdx array
  feasibleSlotIndices: number[]; // slotIdx array where faculty & room prerequisites allow assignment
  feasibleLabBlocks?: [number, number][]; // [slot1, slot2] pairs for 2-hour atomic labs
}

interface CompiledProblem {
  allocations: InternalAllocation[];
  slots: SlotRef[];
  rooms: Room[];
  faculty: Faculty[];
  sections: StudentSection[];
  totalSubSections: number;
  subSectionIdMap: Map<string, number>;
  totalSlots: number;
  numDays: number;
  numPeriodsPerDay: number;
  lunchSlotIndices: Set<number>;
  infeasibilityReasons: string[];
}

// ---------------------------------------------------------------------------
// 1. Pre-Generation Compilation & Infeasibility Analysis
// ---------------------------------------------------------------------------
export function compileSchedulingProblem(
  academicYear: AcademicYearConfig,
  allocations: CourseAllocation[],
  facultyMembers: Faculty[],
  rooms: Room[],
  sections: StudentSection[],
  courses: Course[],
  constraints: AcademicConstraint[]
): CompiledProblem {
  const infeasibilityReasons: string[] = [];

  const workingDays: DayOfWeek[] = (academicYear.workingDays && academicYear.workingDays.length > 0)
    ? academicYear.workingDays
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const teachingSlots = (academicYear.timeSlots || []).filter(ts => !ts.isBreak);
  const numDays = workingDays.length;
  const numPeriodsPerDay = teachingSlots.length;
  const totalSlots = numDays * numPeriodsPerDay;

  const slots: SlotRef[] = [];
  const lunchSlotIndices = new Set<number>();

  let slotCounter = 0;
  for (let d = 0; d < numDays; d++) {
    for (let p = 0; p < numPeriodsPerDay; p++) {
      const slot = teachingSlots[p];
      const slotIdx = slotCounter++;
      slots.push({
        slotIdx,
        dayIdx: d,
        periodIdx: p,
        day: workingDays[d],
        timeSlotId: slot.id,
      });

      if (slot.isLunch || slot.id === academicYear.lunchPeriodId) {
        lunchSlotIndices.add(slotIdx);
      }
    }
  }

  const activeRooms = rooms.filter(r => r.isAvailable);
  const activeFaculty = facultyMembers.filter(f => f.status !== 'Inactive');
  const activeSections = sections.filter(s => s.status !== 'Inactive');

  // Fast entity ID maps
  const facultyMap = new Map<string, number>();
  activeFaculty.forEach((f, idx) => facultyMap.set(f.id, idx));

  const sectionMap = new Map<string, number>();
  activeSections.forEach((s, idx) => sectionMap.set(s.id, idx));

  const subSectionIdMap = new Map<string, number>();
  let subSecCounter = 0;
  activeSections.forEach(s => {
    (s.subSections || []).forEach(sub => {
      subSectionIdMap.set(sub.id, subSecCounter++);
    });
  });

  const compiledAllocations: InternalAllocation[] = [];

  // Section Total Hours Capacity Check
  const sectionHoursAccumulator = new Map<string, number>();

  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];
    const course = courses.find(c => c.id === alloc.courseId);
    const faculty = activeFaculty.find(f => f.id === alloc.facultyId);
    const section = activeSections.find(s => s.id === alloc.sectionId);

    if (!course || !faculty || !section) {
      infeasibilityReasons.push(
        `Allocation ${alloc.id}: Missing valid course (${alloc.courseId}), faculty (${alloc.facultyId}), or section (${alloc.sectionId}).`
      );
      continue;
    }

    const facIdx = facultyMap.get(faculty.id)!;
    const secIdx = sectionMap.get(section.id)!;
    const subSecIdx = alloc.subSectionId ? subSectionIdMap.get(alloc.subSectionId) : undefined;
    const subSectionObj = alloc.subSectionId ? (section.subSections || []).find(sub => sub.id === alloc.subSectionId) : undefined;

    // Accumulate total section load for whole-class lectures; subgroups share time slots concurrently
    if (!alloc.subSectionId) {
      const currentSecHours = (sectionHoursAccumulator.get(section.id) || 0) + alloc.hoursPerWeek;
      sectionHoursAccumulator.set(section.id, currentSecHours);
    }

    // Find candidate rooms capable of holding this allocation
    const candidateRoomsIndices: number[] = [];
    activeRooms.forEach((r, rIdx) => {
      const isLabType = alloc.sessionType === 'Lab' && (r.type === 'ComputerLab' || r.type === 'HardwareLab');
      const isLectureType = alloc.sessionType !== 'Lab' && (r.type === 'LectureHall' || r.type === 'SeminarRoom' || r.type === 'TutorialRoom');
      
      const requiredCapacity = subSectionObj ? subSectionObj.studentCount : (alloc.subSectionId ? Math.ceil(section.studentCount / 2) : section.studentCount);
      if ((isLabType || isLectureType) && r.capacity >= requiredCapacity) {
        candidateRoomsIndices.push(rIdx);
      }
    });

    if (candidateRoomsIndices.length === 0) {
      infeasibilityReasons.push(
        `Course ${course.code} (${alloc.sessionType}) for ${section.name}: Required capacity ${section.studentCount} exceeds all available ${alloc.sessionType === 'Lab' ? 'laboratory' : 'lecture'} rooms.`
      );
    }

    // Determine feasible timeslots for this allocation (excluding faculty unavailable/protected slots)
    const feasibleSlotIndices: number[] = [];
    for (const slotRef of slots) {
      if (lunchSlotIndices.has(slotRef.slotIdx)) continue; // Protected lunch period

      // Check faculty protected/unavailable slots
      const isFacUnavailable = faculty.preferences?.protectedSlots?.some(
        ps => ps.day === slotRef.day && ps.periodId === slotRef.timeSlotId
      );

      if (!isFacUnavailable) {
        feasibleSlotIndices.push(slotRef.slotIdx);
      }
    }

    if (feasibleSlotIndices.length < alloc.hoursPerWeek) {
      infeasibilityReasons.push(
        `Course ${course.code} (${faculty.name}): Requires ${alloc.hoursPerWeek} weekly teaching slots, but only ${feasibleSlotIndices.length} available slots exist after faculty unavailability filters.`
      );
    }

    // Compute 2-hour contiguous lab blocks for Lab/Practical allocations
    const feasibleLabBlocks: [number, number][] = [];
    if (alloc.sessionType === 'Lab' || alloc.sessionType === 'Practical') {
      const slotMap = new Map<number, SlotRef>();
      slots.forEach(s => slotMap.set(s.slotIdx, s));

      for (let s1Idx = 0; s1Idx < slots.length - 1; s1Idx++) {
        const s1 = slots[s1Idx];
        const s2 = slots[s1Idx + 1];
        if (!s1 || !s2) continue;
        if (!feasibleSlotIndices.includes(s1.slotIdx) || !feasibleSlotIndices.includes(s2.slotIdx)) continue;
        if (s1.day !== s2.day) continue;
        if (lunchSlotIndices.has(s1.slotIdx) || lunchSlotIndices.has(s2.slotIdx)) continue;

        // Continuity check: Ensure no break/lunch between s1 and s2
        const ts1 = academicYear.timeSlots?.find(t => t.id === s1.timeSlotId);
        const ts2 = academicYear.timeSlots?.find(t => t.id === s2.timeSlotId);
        if (ts1 && ts2) {
          if (ts1.endTime !== ts2.startTime && ts1.periodNumber + 1 !== ts2.periodNumber) continue;
        } else {
          if (s2.periodIdx !== s1.periodIdx + 1) continue;
        }

        feasibleLabBlocks.push([s1.slotIdx, s2.slotIdx]);
      }
    }

    compiledAllocations.push({
      allocIdx: i,
      allocation: alloc,
      course,
      faculty,
      section,
      facultyIdx: facIdx,
      sectionIdx: secIdx,
      subSectionIdx: subSecIdx,
      requiredHours: alloc.hoursPerWeek,
      sessionType: alloc.sessionType,
      candidateRooms: candidateRoomsIndices,
      feasibleSlotIndices,
      feasibleLabBlocks,
    });
  }

  // Verify total section teaching hours vs total available slot capacity
  const maxAvailableNonLunchSlots = totalSlots - lunchSlotIndices.size;
  for (const [secId, totalHours] of sectionHoursAccumulator.entries()) {
    const sec = activeSections.find(s => s.id === secId);
    if (totalHours > maxAvailableNonLunchSlots) {
      infeasibilityReasons.push(
        `Section ${sec?.name || secId}: Total required weekly course hours (${totalHours} hrs) exceeds total available weekly teaching slots (${maxAvailableNonLunchSlots} hrs).`
      );
    }
  }

  // Verify total faculty teaching hours vs total available slot capacity
  const facultyHoursAccumulator = new Map<string, number>();
  compiledAllocations.forEach(ca => {
    const cur = facultyHoursAccumulator.get(ca.faculty.id) || 0;
    facultyHoursAccumulator.set(ca.faculty.id, cur + ca.requiredHours);
  });

  for (const [facId, totalFacHours] of facultyHoursAccumulator.entries()) {
    const fac = activeFaculty.find(f => f.id === facId);
    if (totalFacHours > maxAvailableNonLunchSlots) {
      infeasibilityReasons.push(
        `Faculty ${fac?.name || facId}: Total assigned teaching hours (${totalFacHours} hrs) exceeds total available weekly teaching slots (${maxAvailableNonLunchSlots} hrs).`
      );
    }
  }

  // Verify total required laboratory hours vs available lab room slot capacity
  const labAllocations = compiledAllocations.filter(ca => ca.sessionType === 'Lab');
  let totalRequiredLabHours = 0;
  labAllocations.forEach(ca => { totalRequiredLabHours += ca.requiredHours; });

  const totalLabCapacitySlots = activeRooms.filter(r => r.type === 'ComputerLab' || r.type === 'HardwareLab').length * maxAvailableNonLunchSlots;
  if (totalRequiredLabHours > totalLabCapacitySlots) {
    infeasibilityReasons.push(
      `Laboratory Infrastructure Shortage: Total required laboratory hours (${totalRequiredLabHours} hrs) exceeds total available laboratory room capacity (${totalLabCapacitySlots} slot-hours).`
    );
  }

  return {
    allocations: compiledAllocations,
    slots,
    rooms: activeRooms,
    faculty: activeFaculty,
    sections: activeSections,
    totalSubSections: subSecCounter,
    subSectionIdMap,
    totalSlots,
    numDays,
    numPeriodsPerDay,
    lunchSlotIndices,
    infeasibilityReasons,
  };
}

// ---------------------------------------------------------------------------
// 2. High-Performance Bitset Search Engine
// ---------------------------------------------------------------------------
export function executeOptimizationEngine(
  academicYear: AcademicYearConfig,
  allocations: CourseAllocation[],
  facultyMembers: Faculty[],
  rooms: Room[],
  sections: StudentSection[],
  courses: Course[],
  constraints: AcademicConstraint[],
  options: EngineOptions = {}
): EngineResult {
  const startTime = performance.now();
  const mode = options.budgetMode || 'BALANCED';
  const timeBudgetMs = options.timeBudgetMs || (mode === 'FAST' ? 300 : mode === 'BALANCED' ? 800 : 2000);
  const seed = options.seed ?? 1337;
  const maxCandidates = options.maxCandidates || 3;

  const prng = new SeededPRNG(seed);

  // Phase 0: Problem Compilation
  const compileStart = performance.now();
  const problem = compileSchedulingProblem(
    academicYear,
    allocations,
    facultyMembers,
    rooms,
    sections,
    courses,
    constraints
  );
  const compilationTimeMs = Number((performance.now() - compileStart).toFixed(2));

  // If mathematically unfeasible from compilation check
  if (problem.infeasibilityReasons.length > 0) {
    return {
      success: false,
      isFeasible: false,
      statusMessage: `Infeasibility detected during problem compilation (${problem.infeasibilityReasons.length} blocking issues found).`,
      infeasibilityDiagnostics: problem.infeasibilityReasons,
      metrics: {
        compilationTimeMs,
        feasibilityTimeMs: 0,
        optimizationTimeMs: 0,
        totalTimeMs: Number((performance.now() - startTime).toFixed(2)),
        candidatesEvaluated: 0,
        candidatesPruned: 0,
        backtracksCount: 0,
        constraintChecksCount: 0,
        hardConstraintViolations: problem.infeasibilityReasons.length,
        healthScore: 0,
      },
      allCandidates: [],
    };
  }

  // Instrumentation counters
  let constraintChecksCount = 0;
  let backtracksCount = 0;
  let candidatesPruned = 0;
  let candidatesEvaluated = 0;

  const numFaculty = problem.faculty.length;
  const numRooms = problem.rooms.length;
  const numSections = problem.sections.length;
  const totalSlots = problem.totalSlots;

  // Occupancy Bitset State Structures for Instant Bitwise Collision Checks
  // Using BigInt arrays for up to 64 slots, or Uint32Array chunks
  // For totalSlots <= 64, BigInt bitmasks give nanosecond 1-instruction collision checks!
  const facultyOccupancy = new Array<bigint>(numFaculty).fill(0n);
  const roomOccupancy = new Array<bigint>(numRooms).fill(0n);
  const sectionWholeOccupancy = new Array<bigint>(numSections).fill(0n);
  const subSectionOccupancy = new Array<bigint>(Math.max(1, problem.totalSubSections)).fill(0n);
  const sectionSubgroupCounts = Array.from({ length: numSections }, () => new Int16Array(totalSlots));

  // Schedule Grid: slotIdx -> { allocIdx, roomIdx } | null
  const scheduleAssignments = new Array<{ allocIdx: number; roomIdx: number } | null>(totalSlots).fill(null);

  // Tracking hours assigned per allocation
  const allocHoursAssigned = new Array<number>(problem.allocations.length).fill(0);
  const allocAssignedSlots = Array.from({ length: problem.allocations.length }, () => [] as { slotIdx: number; roomIdx: number }[]);

  // Phase A: Feasibility Backtracking Search
  const feasibilityStart = performance.now();

  // MRV Ordering: Sort allocations by domain tightness (fewest feasible slots / required hours ratio)
  const searchAllocOrder = [...problem.allocations].sort((a, b) => {
    // Labs first (strictest room requirements)
    if (a.sessionType === 'Lab' && b.sessionType !== 'Lab') return -1;
    if (b.sessionType === 'Lab' && a.sessionType !== 'Lab') return 1;

    const domainRatioA = a.feasibleSlotIndices.length / Math.max(1, a.requiredHours);
    const domainRatioB = b.feasibleSlotIndices.length / Math.max(1, b.requiredHours);
    return domainRatioA - domainRatioB;
  });

  const candidatesFound: GeneratedCandidate[] = [];

  function solvePhaseA(allocOrderIdx: number): boolean {
    if (performance.now() - startTime > timeBudgetMs) {
      return false; // Time limit
    }

    if (allocOrderIdx >= searchAllocOrder.length) {
      // Complete Feasible Assignment Reached!
      candidatesEvaluated++;
      const candidate = buildCandidateFromState(
        candidatesFound.length + 1,
        prng.range(1000, 9999),
        problem,
        allocAssignedSlots,
        options.optimizationProfile || 'BALANCED'
      );

      const validation = validateTimetableIndependently(candidate.sessions, {
        academicYear,
        allocations,
        facultyMembers,
        rooms,
        sections,
        courses,
        constraints,
      });
      candidate.hardConstraintViolations = validation.hardViolationsCount;
      if (!validation.isValid || !validation.canPublish) {
        candidatesPruned++;
        return false;
      }
      candidatesFound.push(candidate);

      if (mode === 'FAST' || candidatesFound.length >= maxCandidates) {
        return true; // Stop Phase A
      }
      return false; // Continue search for additional distinct candidates
    }

    const currentAlloc = searchAllocOrder[allocOrderIdx];
    const hoursNeeded = currentAlloc.requiredHours - allocHoursAssigned[currentAlloc.allocIdx];

    if (hoursNeeded === 0) {
      return solvePhaseA(allocOrderIdx + 1);
    }

    const facIdx = currentAlloc.facultyIdx;
    const secIdx = currentAlloc.sectionIdx;
    const isSubgroupAlloc = currentAlloc.subSectionIdx !== undefined;

    const isLabAlloc =
      (currentAlloc.sessionType === 'Lab' || currentAlloc.sessionType === 'Practical') &&
      Boolean(currentAlloc.feasibleLabBlocks && currentAlloc.feasibleLabBlocks.length > 0);

    if (isLabAlloc) {
      // Branch 1: Atomic 2-Hour Lab Block Scheduling
      const candidateBlocks = [...currentAlloc.feasibleLabBlocks!];
      if (candidatesFound.length > 0) {
        for (let i = candidateBlocks.length - 1; i > 0; i--) {
          const j = Math.floor(prng.next() * (i + 1));
          [candidateBlocks[i], candidateBlocks[j]] = [candidateBlocks[j], candidateBlocks[i]];
        }
      }

      for (const [s1, s2] of candidateBlocks) {
        const blockBit = (1n << BigInt(s1)) | (1n << BigInt(s2));
        constraintChecksCount += 2;

        // 1. Bitwise Hard Constraint Check: Faculty Busy?
        if ((facultyOccupancy[facIdx] & blockBit) !== 0n) {
          candidatesPruned++;
          continue;
        }

        // 2. Bitwise Hard Constraint Check: Student Cohort / Subgroup Busy?
        if (isSubgroupAlloc) {
          const subSecIdx = currentAlloc.subSectionIdx!;
          if ((sectionWholeOccupancy[secIdx] & blockBit) !== 0n || (subSectionOccupancy[subSecIdx] & blockBit) !== 0n) {
            candidatesPruned++;
            continue;
          }
        } else {
          if (
            (sectionWholeOccupancy[secIdx] & blockBit) !== 0n ||
            sectionSubgroupCounts[secIdx][s1] > 0 ||
            sectionSubgroupCounts[secIdx][s2] > 0
          ) {
            candidatesPruned++;
            continue;
          }
        }

        // 3. Find Available Compatible Room for both s1 and s2
        let chosenRoomIdx = -1;
        for (const rIdx of currentAlloc.candidateRooms) {
          constraintChecksCount += 2;
          if ((roomOccupancy[rIdx] & blockBit) === 0n) {
            chosenRoomIdx = rIdx;
            break;
          }
        }

        if (chosenRoomIdx === -1) {
          candidatesPruned++;
          continue;
        }

        // Apply 2-hour assignment
        facultyOccupancy[facIdx] |= blockBit;
        roomOccupancy[chosenRoomIdx] |= blockBit;
        if (isSubgroupAlloc) {
          subSectionOccupancy[currentAlloc.subSectionIdx!] |= blockBit;
          sectionSubgroupCounts[secIdx][s1]++;
          sectionSubgroupCounts[secIdx][s2]++;
        } else {
          sectionWholeOccupancy[secIdx] |= blockBit;
        }

        allocHoursAssigned[currentAlloc.allocIdx] += 2;
        allocAssignedSlots[currentAlloc.allocIdx].push(
          { slotIdx: s1, roomIdx: chosenRoomIdx },
          { slotIdx: s2, roomIdx: chosenRoomIdx }
        );

        const success = solvePhaseA(allocOrderIdx);
        if (success) return true;

        // Backtrack
        backtracksCount++;
        facultyOccupancy[facIdx] &= ~blockBit;
        roomOccupancy[chosenRoomIdx] &= ~blockBit;
        if (isSubgroupAlloc) {
          subSectionOccupancy[currentAlloc.subSectionIdx!] &= ~blockBit;
          sectionSubgroupCounts[secIdx][s1]--;
          sectionSubgroupCounts[secIdx][s2]--;
        } else {
          sectionWholeOccupancy[secIdx] &= ~blockBit;
        }

        allocHoursAssigned[currentAlloc.allocIdx] -= 2;
        allocAssignedSlots[currentAlloc.allocIdx].pop();
        allocAssignedSlots[currentAlloc.allocIdx].pop();
      }

      return false;
    } else {
      // Branch 2: Single-Hour Lecture / Tutorial Scheduling (with 1-lecture/day/course distribution)
      let candidateSlots = [...currentAlloc.feasibleSlotIndices];
      if (candidatesFound.length > 0) {
        for (let i = candidateSlots.length - 1; i > 0; i--) {
          const j = Math.floor(prng.next() * (i + 1));
          [candidateSlots[i], candidateSlots[j]] = [candidateSlots[j], candidateSlots[i]];
        }
      }

      // Track days already assigned for this allocation
      const assignedDays = new Set<number>();
      for (const item of allocAssignedSlots[currentAlloc.allocIdx]) {
        assignedDays.add(problem.slots[item.slotIdx].dayIdx);
      }

      // Profile-guided heuristic slot ordering
      const activeProfile = options.optimizationProfile || 'BALANCED';
      if (activeProfile === 'STUDENT_FOCUSED') {
        candidateSlots.sort((a, b) => {
          const refA = problem.slots[a];
          const refB = problem.slots[b];
          const dayAAssigned = assignedDays.has(refA.dayIdx) ? 1 : 0;
          const dayBAssigned = assignedDays.has(refB.dayIdx) ? 1 : 0;
          if (dayAAssigned !== dayBAssigned) return dayAAssigned - dayBAssigned;

          // Adjacency to section's existing slots on that day
          let minDistA = 99;
          let minDistB = 99;
          for (let sIdx = 0; sIdx < totalSlots; sIdx++) {
            if ((sectionWholeOccupancy[secIdx] & (1n << BigInt(sIdx))) !== 0n) {
              const sRef = problem.slots[sIdx];
              if (sRef.dayIdx === refA.dayIdx) {
                minDistA = Math.min(minDistA, Math.abs(sRef.periodIdx - refA.periodIdx));
              }
              if (sRef.dayIdx === refB.dayIdx) {
                minDistB = Math.min(minDistB, Math.abs(sRef.periodIdx - refB.periodIdx));
              }
            }
          }
          const scoreA = minDistA === 1 ? 0 : minDistA === 99 ? 2 : minDistA + 1;
          const scoreB = minDistB === 1 ? 0 : minDistB === 99 ? 2 : minDistB + 1;
          return scoreA - scoreB;
        });
      } else if (activeProfile === 'FACULTY_FOCUSED') {
        candidateSlots.sort((a, b) => {
          const refA = problem.slots[a];
          const refB = problem.slots[b];

          // Adjacency to faculty's existing slots on that day
          let minDistA = 99;
          let minDistB = 99;
          for (let sIdx = 0; sIdx < totalSlots; sIdx++) {
            if ((facultyOccupancy[facIdx] & (1n << BigInt(sIdx))) !== 0n) {
              const sRef = problem.slots[sIdx];
              if (sRef.dayIdx === refA.dayIdx) {
                minDistA = Math.min(minDistA, Math.abs(sRef.periodIdx - refA.periodIdx));
              }
              if (sRef.dayIdx === refB.dayIdx) {
                minDistB = Math.min(minDistB, Math.abs(sRef.periodIdx - refB.periodIdx));
              }
            }
          }
          const scoreA = minDistA === 1 ? 0 : minDistA === 99 ? 2 : minDistA + 1;
          const scoreB = minDistB === 1 ? 0 : minDistB === 99 ? 2 : minDistB + 1;
          return scoreA - scoreB;
        });
      }

      for (const slotIdx of candidateSlots) {
        const slotRef = problem.slots[slotIdx];
        const dayIdx = slotRef.dayIdx;

        // Rule: Max 1 lecture of the same course on the same day (unless required hours > numDays)
        if (assignedDays.has(dayIdx) && currentAlloc.requiredHours <= problem.numDays) {
          continue;
        }

        // Rule: If multiple lectures of the same course must happen on the same day, they cannot be consecutive!
        if (assignedDays.has(dayIdx)) {
          const prevAssignedPeriods = allocAssignedSlots[currentAlloc.allocIdx]
            .map(item => problem.slots[item.slotIdx])
            .filter(s => s.dayIdx === dayIdx)
            .map(s => s.periodIdx);
          if (prevAssignedPeriods.some(p => Math.abs(p - slotRef.periodIdx) === 1)) {
            continue;
          }
        }

        const slotBit = 1n << BigInt(slotIdx);
        constraintChecksCount++;

        // 1. Bitwise Hard Constraint Check: Faculty Busy?
        if ((facultyOccupancy[facIdx] & slotBit) !== 0n) {
          candidatesPruned++;
          continue;
        }

        // 2. Bitwise Hard Constraint Check: Student Cohort / Subgroup Busy?
        if (isSubgroupAlloc) {
          const subSecIdx = currentAlloc.subSectionIdx!;
          if ((sectionWholeOccupancy[secIdx] & slotBit) !== 0n || (subSectionOccupancy[subSecIdx] & slotBit) !== 0n) {
            candidatesPruned++;
            continue;
          }
        } else {
          if ((sectionWholeOccupancy[secIdx] & slotBit) !== 0n || sectionSubgroupCounts[secIdx][slotIdx] > 0) {
            candidatesPruned++;
            continue;
          }
        }

        // 3. Find Available Compatible Room
        let chosenRoomIdx = -1;
        for (const rIdx of currentAlloc.candidateRooms) {
          constraintChecksCount++;
          if ((roomOccupancy[rIdx] & slotBit) === 0n) {
            chosenRoomIdx = rIdx;
            break;
          }
        }

        if (chosenRoomIdx === -1) {
          candidatesPruned++;
          continue;
        }

        // Apply Assignment
        facultyOccupancy[facIdx] |= slotBit;
        roomOccupancy[chosenRoomIdx] |= slotBit;
        if (isSubgroupAlloc) {
          subSectionOccupancy[currentAlloc.subSectionIdx!] |= slotBit;
          sectionSubgroupCounts[secIdx][slotIdx]++;
        } else {
          sectionWholeOccupancy[secIdx] |= slotBit;
        }

        allocHoursAssigned[currentAlloc.allocIdx]++;
        allocAssignedSlots[currentAlloc.allocIdx].push({ slotIdx, roomIdx: chosenRoomIdx });

        const success = solvePhaseA(allocOrderIdx);
        if (success) return true;

        // Backtrack
        backtracksCount++;
        facultyOccupancy[facIdx] &= ~slotBit;
        roomOccupancy[chosenRoomIdx] &= ~slotBit;
        if (isSubgroupAlloc) {
          subSectionOccupancy[currentAlloc.subSectionIdx!] &= ~slotBit;
          sectionSubgroupCounts[secIdx][slotIdx]--;
        } else {
          sectionWholeOccupancy[secIdx] &= ~slotBit;
        }

        allocHoursAssigned[currentAlloc.allocIdx]--;
        allocAssignedSlots[currentAlloc.allocIdx].pop();
      }

      return false;
    }
  }

  // Execute Phase A Feasibility Search
  solvePhaseA(0);
  const feasibilityTimeMs = Number((performance.now() - feasibilityStart).toFixed(2));

  // Phase B: Local Search Soft Constraint Optimization (if budget allows and feasible solution exists)
  const optimizationStart = performance.now();
  if (candidatesFound.length > 0 && mode !== 'FAST') {
    optimizeCandidatesPhaseB(
      candidatesFound,
      problem,
      prng,
      timeBudgetMs - (performance.now() - startTime),
      options.optimizationProfile || 'BALANCED'
    );
  }
  const optimizationTimeMs = Number((performance.now() - optimizationStart).toFixed(2));

  const totalTimeMs = Number((performance.now() - startTime).toFixed(2));

  // Sort candidates by lowest soft penalty (highest quality)
  candidatesFound.sort((a, b) => b.healthScore - a.healthScore);

  const bestCandidate = candidatesFound[0];

  return {
    success: candidatesFound.length > 0,
    isFeasible: candidatesFound.length > 0,
    statusMessage: candidatesFound.length > 0
      ? `Successfully generated ${candidatesFound.length} feasible, conflict-free timetable candidate(s) in ${totalTimeMs} ms.`
      : `Search space exhausted within ${timeBudgetMs} ms budget without finding 100% hard-constraint solution.`,
    metrics: {
      compilationTimeMs,
      feasibilityTimeMs,
      optimizationTimeMs,
      totalTimeMs,
      candidatesEvaluated,
      candidatesPruned,
      backtracksCount,
      constraintChecksCount,
      hardConstraintViolations: bestCandidate ? bestCandidate.hardConstraintViolations : problem.allocations.length,
      healthScore: bestCandidate ? bestCandidate.healthScore : 0,
    },
    bestCandidate,
    allCandidates: candidatesFound,
  };
}

// ---------------------------------------------------------------------------
// 3. Helper: Build Candidate Object & Evaluate Soft Constraints
// ---------------------------------------------------------------------------
function buildCandidateFromState(
  candidateNum: number,
  seed: number,
  problem: CompiledProblem,
  allocAssignedSlots: { slotIdx: number; roomIdx: number }[][],
  profile: OptimizationProfile = 'BALANCED'
): GeneratedCandidate {
  const sessions: ClassSession[] = [];
  let scheduledHours = 0;
  let sessionCounter = 1;

  for (let i = 0; i < problem.allocations.length; i++) {
    const internalAlloc = problem.allocations[i];
    const assigned = allocAssignedSlots[internalAlloc.allocIdx];

    for (const item of assigned) {
      const slotRef = problem.slots[item.slotIdx];
      const room = problem.rooms[item.roomIdx];

      sessions.push({
        id: `sess-cand${candidateNum}-${sessionCounter++}`,
        courseId: internalAlloc.course.id,
        facultyId: internalAlloc.faculty.id,
        sectionId: internalAlloc.section.id,
        subSectionId: internalAlloc.allocation.subSectionId,
        roomId: room.id,
        day: slotRef.day,
        timeSlotId: slotRef.timeSlotId,
        type: internalAlloc.sessionType as any,
        status: 'Planned',
        version: 1,
      });

      scheduledHours++;
    }
  }

  const totalRequestedHours = problem.allocations.reduce((sum, a) => sum + a.requiredHours, 0);
  const softPenalty = calculateSoftPenalties(sessions, problem, profile);

  // Health Score: 100 - softPenalty.totalPenalty, clamped to [10, 100]
  const healthScore = Math.max(10, Math.min(100, Math.round(100 - softPenalty.totalPenalty)));

  return {
    candidateId: `cand-v${candidateNum}`,
    seed,
    sessions,
    hardConstraintViolations: 0, // Phase A guarantees 0 hard violations
    softPenalty,
    healthScore,
    scheduledHours,
    totalRequestedHours,
    unscheduledAllocations: [],
  };
}

// ---------------------------------------------------------------------------
// 4. Soft Constraint Penalty Evaluator
// ---------------------------------------------------------------------------
function calculateSoftPenalties(
  sessions: ClassSession[],
  problem: CompiledProblem,
  profile: OptimizationProfile = 'BALANCED'
): SoftPenaltyBreakdown {
  let facultyGapsPenalty = 0;
  let facultyConsecutivePenalty = 0;
  let studentWorkloadImbalancePenalty = 0;
  let courseDistributionPenalty = 0;
  let roomCapacityFitPenalty = 0;
  let facultyPreferenceBonus = 0;

  // Map sessions by faculty & day and section & day
  const facultyDayMap = new Map<string, number[]>();
  const sectionDayMap = new Map<string, number[]>();
  const sectionCourseDayMap = new Map<string, number>();

  for (const sess of sessions) {
    const slotRef = problem.slots.find(s => s.day === sess.day && s.timeSlotId === sess.timeSlotId);
    if (!slotRef) continue;

    const facKey = `${sess.facultyId}_${sess.day}`;
    if (!facultyDayMap.has(facKey)) facultyDayMap.set(facKey, []);
    facultyDayMap.get(facKey)!.push(slotRef.periodIdx);

    const secKey = `${sess.sectionId}_${sess.day}`;
    if (!sectionDayMap.has(secKey)) sectionDayMap.set(secKey, []);
    sectionDayMap.get(secKey)!.push(slotRef.periodIdx);

    const courseKey = `${sess.sectionId}_${sess.courseId}_${sess.day}`;
    sectionCourseDayMap.set(courseKey, (sectionCourseDayMap.get(courseKey) || 0) + 1);

    // Room Capacity Fit: Reward tight capacity fits
    const room = problem.rooms.find(r => r.id === sess.roomId);
    const section = problem.sections.find(s => s.id === sess.sectionId);
    if (room && section) {
      const unusedChairs = room.capacity - section.studentCount;
      if (unusedChairs > 40) {
        roomCapacityFitPenalty += 1.0;
      }
    }
  }

  // 1. Faculty Gap & Consecutive Class Penalties
  for (const periods of facultyDayMap.values()) {
    periods.sort((a, b) => a - b);

    if (periods.length > 1) {
      let gapCount = 0;
      for (let i = 0; i < periods.length - 1; i++) {
        const diff = periods[i + 1] - periods[i] - 1;
        if (diff > 0) gapCount += diff;
      }
      facultyGapsPenalty += gapCount * (profile === 'FACULTY_FOCUSED' ? 12.0 : 2.0);
    }

    let consecutive = 1;
    for (let i = 1; i < periods.length; i++) {
      if (periods[i] === periods[i - 1] + 1) {
        consecutive++;
        if (consecutive > 3) {
          facultyConsecutivePenalty += (profile === 'FACULTY_FOCUSED' ? 6.0 : 3.0);
        }
      } else {
        consecutive = 1;
      }
    }
  }

  // 2. Student Gap, Workload Imbalance & Course Clumping Penalties
  let studentGapsPenalty = 0;
  for (const periods of sectionDayMap.values()) {
    periods.sort((a, b) => a - b);
    if (periods.length > 1) {
      let gapCount = 0;
      for (let i = 0; i < periods.length - 1; i++) {
        const diff = periods[i + 1] - periods[i] - 1;
        if (diff > 0) gapCount += diff;
      }
      studentGapsPenalty += gapCount * (profile === 'STUDENT_FOCUSED' ? 12.0 : 2.0);
    }

    if (periods.length > 5) {
      studentWorkloadImbalancePenalty += (periods.length - 5) * (profile === 'STUDENT_FOCUSED' ? 6.0 : 3.0);
    } else if (periods.length === 1) {
      studentWorkloadImbalancePenalty += (profile === 'STUDENT_FOCUSED' ? 3.0 : 1.0);
    }
  }

  for (const count of sectionCourseDayMap.values()) {
    if (count > 1) {
      courseDistributionPenalty += (count - 1) * (profile === 'STUDENT_FOCUSED' ? 10.0 : 5.0);
    }
  }

  const totalPenalty = Math.max(
    0,
    facultyGapsPenalty +
      facultyConsecutivePenalty +
      studentGapsPenalty +
      studentWorkloadImbalancePenalty +
      courseDistributionPenalty +
      roomCapacityFitPenalty -
      facultyPreferenceBonus
  );

  return {
    facultyGapsPenalty: Number(facultyGapsPenalty.toFixed(1)),
    facultyConsecutivePenalty: Number(facultyConsecutivePenalty.toFixed(1)),
    studentGapsPenalty: Number(studentGapsPenalty.toFixed(1)),
    studentWorkloadImbalancePenalty: Number(studentWorkloadImbalancePenalty.toFixed(1)),
    courseDistributionPenalty: Number(courseDistributionPenalty.toFixed(1)),
    roomCapacityFitPenalty: Number(roomCapacityFitPenalty.toFixed(1)),
    facultyPreferenceBonus: Number(facultyPreferenceBonus.toFixed(1)),
    totalPenalty: Number(totalPenalty.toFixed(1)),
  };
}

// ---------------------------------------------------------------------------
// 5. Phase B: Neighborhood Local Search Optimization
// ---------------------------------------------------------------------------
function optimizeCandidatesPhaseB(
  candidates: GeneratedCandidate[],
  problem: CompiledProblem,
  prng: SeededPRNG,
  remainingBudgetMs: number,
  profile: OptimizationProfile = 'BALANCED'
) {
  const endBy = performance.now() + Math.max(50, remainingBudgetMs);

  for (const candidate of candidates) {
    if (performance.now() > endBy) break;

    // Local Search Neighborhood Swap: Attempt swapping timeslots of two sessions of the same section
    let currentSessions = [...candidate.sessions];
    let currentScore = candidate.healthScore;

    for (let iteration = 0; iteration < 100; iteration++) {
      if (performance.now() > endBy) break;
      if (currentSessions.length < 2) break;

      const idxA = Math.floor(prng.next() * currentSessions.length);
      const idxB = Math.floor(prng.next() * currentSessions.length);
      if (idxA === idxB) continue;

      const sessA = currentSessions[idxA];
      const sessB = currentSessions[idxB];

      // Only swap single-hour lectures / tutorials (never break 2-hour labs!)
      if (sessA.type === 'Lab' || sessA.type === 'Practical' || sessB.type === 'Lab' || sessB.type === 'Practical') {
        continue;
      }
      if (sessA.type !== sessB.type) continue;

      // Swap day & timeslot
      const swappedSessions = currentSessions.map((s, i) => {
        if (i === idxA) return { ...s, day: sessB.day, timeSlotId: sessB.timeSlotId };
        if (i === idxB) return { ...s, day: sessA.day, timeSlotId: sessA.timeSlotId };
        return s;
      });

      // Verify hard constraints on swapped state
      if (!validateHardConstraintsFast(swappedSessions, problem)) continue;

      // Compute new soft penalty with current profile
      const newPenalty = calculateSoftPenalties(swappedSessions, problem, profile);
      const newScore = Math.max(10, Math.min(100, Math.round(100 - newPenalty.totalPenalty)));

      if (newScore > currentScore) {
        currentSessions = swappedSessions;
        currentScore = newScore;
        candidate.sessions = currentSessions;
        candidate.healthScore = currentScore;
        candidate.softPenalty = newPenalty;
      }
    }
  }
}

function validateHardConstraintsFast(sessions: ClassSession[], problem: CompiledProblem): boolean {
  const facOccupancy = new Map<string, boolean>();
  const roomOccupancy = new Map<string, boolean>();
  const secOccupancy = new Map<string, boolean>();

  for (const s of sessions) {
    const keySlot = `${s.day}_${s.timeSlotId}`;

    const facKey = `${s.facultyId}_${keySlot}`;
    if (facOccupancy.has(facKey)) return false;
    facOccupancy.set(facKey, true);

    const roomKey = `${s.roomId}_${keySlot}`;
    if (roomOccupancy.has(roomKey)) return false;
    roomOccupancy.set(roomKey, true);

    const secKey = `${s.sectionId}_${keySlot}`;
    if (secOccupancy.has(secKey)) return false;
    secOccupancy.set(secKey, true);
  }

  return true;
}
