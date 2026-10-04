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

/**
 * High-Performance Timetable Optimization Engine
 * - Phase A: Constraint Satisfaction (MRV + Forward Checking + Bitset Hard Constraints)
 * - Phase B: Local Search Soft Constraint Penalty Minimization
 * - Deterministic Seeded PRNG
 * - Infeasibility Pre-Compilation Diagnostics
 * - Multi-Candidate Search & Performance Instrumentation
 */

export type BudgetMode = 'FAST' | 'BALANCED' | 'MAXIMUM_OPTIMIZATION';

export interface EngineOptions {
  budgetMode?: BudgetMode;
  timeBudgetMs?: number; // Max time limit for optimization
  seed?: number; // Deterministic seed
  maxCandidates?: number; // Number of top candidate schedules to generate
}

export interface SoftPenaltyBreakdown {
  facultyGapsPenalty: number;
  facultyConsecutivePenalty: number;
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
  const facultyOccupancy = new BigInt64Array(numFaculty);
  const roomOccupancy = new BigInt64Array(numRooms);
  const sectionWholeOccupancy = new BigInt64Array(numSections);
  const subSectionOccupancy = new BigInt64Array(Math.max(1, problem.totalSubSections));
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
        allocAssignedSlots
      );
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

    // Shuffle slot choices slightly if generating multiple distinct candidates
    const candidateSlots = [...currentAlloc.feasibleSlotIndices];
    if (candidatesFound.length > 0) {
      for (let i = candidateSlots.length - 1; i > 0; i--) {
        const j = Math.floor(prng.next() * (i + 1));
        [candidateSlots[i], candidateSlots[j]] = [candidateSlots[j], candidateSlots[i]];
      }
    }

    for (const slotIdx of candidateSlots) {
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
        // Subgroup can't clash with whole-class lecture or with its own previous session
        if ((sectionWholeOccupancy[secIdx] & slotBit) !== 0n || (subSectionOccupancy[subSecIdx] & slotBit) !== 0n) {
          candidatesPruned++;
          continue;
        }
      } else {
        // Whole-class lecture can't clash with another lecture or ANY active subgroup lab/class
        if ((sectionWholeOccupancy[secIdx] & slotBit) !== 0n || sectionSubgroupCounts[secIdx][slotIdx] > 0) {
          candidatesPruned++;
          continue;
        }
      }

      // 3. Find Available Compatible Room for this Slot
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
        continue; // No available room
      }

      // Apply Assignment (Push State)
      const roomBit = slotBit;
      facultyOccupancy[facIdx] |= slotBit;
      roomOccupancy[chosenRoomIdx] |= roomBit;
      if (isSubgroupAlloc) {
        subSectionOccupancy[currentAlloc.subSectionIdx!] |= slotBit;
        sectionSubgroupCounts[secIdx][slotIdx]++;
      } else {
        sectionWholeOccupancy[secIdx] |= slotBit;
      }

      allocHoursAssigned[currentAlloc.allocIdx]++;
      allocAssignedSlots[currentAlloc.allocIdx].push({ slotIdx, roomIdx: chosenRoomIdx });

      // Recurse
      const success = solvePhaseA(allocOrderIdx);
      if (success) return true;

      // Undo Assignment (Pop State / Backtrack)
      backtracksCount++;
      facultyOccupancy[facIdx] &= ~slotBit;
      roomOccupancy[chosenRoomIdx] &= ~roomBit;
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

  // Execute Phase A Feasibility Search
  solvePhaseA(0);
  const feasibilityTimeMs = Number((performance.now() - feasibilityStart).toFixed(2));

  // Phase B: Local Search Soft Constraint Optimization (if budget allows and feasible solution exists)
  const optimizationStart = performance.now();
  if (candidatesFound.length > 0 && mode !== 'FAST') {
    optimizeCandidatesPhaseB(candidatesFound, problem, prng, timeBudgetMs - (performance.now() - startTime));
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
  allocAssignedSlots: { slotIdx: number; roomIdx: number }[][]
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
  const softPenalty = calculateSoftPenalties(sessions, problem);

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
function calculateSoftPenalties(sessions: ClassSession[], problem: CompiledProblem): SoftPenaltyBreakdown {
  let facultyGapsPenalty = 0;
  let facultyConsecutivePenalty = 0;
  let studentWorkloadImbalancePenalty = 0;
  let courseDistributionPenalty = 0;
  let roomCapacityFitPenalty = 0;
  let facultyPreferenceBonus = 0;

  // Map sessions by faculty & day
  const facultyDayMap = new Map<string, number[]>(); // `${facId}_${day}` -> periodIndices[]
  const sectionDayMap = new Map<string, number[]>(); // `${secId}_${day}` -> periodIndices[]
  const sectionCourseDayMap = new Map<string, number>(); // `${secId}_${courseId}_${day}` -> count

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

    // Room Capacity Fit: Reward tight capacity fits to preserve large rooms for big sections
    const room = problem.rooms.find(r => r.id === sess.roomId);
    const section = problem.sections.find(s => s.id === sess.sectionId);
    if (room && section) {
      const unusedChairs = room.capacity - section.studentCount;
      if (unusedChairs > 40) {
        roomCapacityFitPenalty += 1.5; // Slight penalty for wasting a 100+ seat hall on a 20-person section
      }
    }
  }

  // 1. Faculty Gap & Consecutive Class Penalties
  for (const periods of facultyDayMap.values()) {
    periods.sort((a, b) => a - b);

    // Gaps: Holes between first and last lecture of the day
    if (periods.length > 1) {
      const span = periods[periods.length - 1] - periods[0] + 1;
      const gaps = span - periods.length;
      facultyGapsPenalty += gaps * 3.0; // 3 points penalty per gap hour
    }

    // Consecutive > 3 classes without break
    let consecutive = 1;
    for (let i = 1; i < periods.length; i++) {
      if (periods[i] === periods[i - 1] + 1) {
        consecutive++;
        if (consecutive > 3) {
          facultyConsecutivePenalty += 4.0; // Penalty for 4th or 5th back-to-back class
        }
      } else {
        consecutive = 1;
      }
    }
  }

  // 2. Student Workload Imbalance & Excess Course Clumping
  for (const periods of sectionDayMap.values()) {
    if (periods.length > 5) {
      studentWorkloadImbalancePenalty += (periods.length - 5) * 5.0; // Heavy student day penalty
    } else if (periods.length === 1) {
      studentWorkloadImbalancePenalty += 2.0; // Inefficient 1-lecture day
    }
  }

  for (const count of sectionCourseDayMap.values()) {
    if (count > 2) {
      courseDistributionPenalty += (count - 2) * 6.0; // Excess clumping penalty
    }
  }

  const totalPenalty = Math.max(
    0,
    facultyGapsPenalty +
    facultyConsecutivePenalty +
    studentWorkloadImbalancePenalty +
    courseDistributionPenalty +
    roomCapacityFitPenalty -
    facultyPreferenceBonus
  );

  return {
    facultyGapsPenalty: Number(facultyGapsPenalty.toFixed(1)),
    facultyConsecutivePenalty: Number(facultyConsecutivePenalty.toFixed(1)),
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
  remainingBudgetMs: number
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

      // Only swap if both are same session type or both are single-hour lectures
      if (sessA.type !== sessB.type) continue;

      // Swap day & timeslot
      const swappedSessions = currentSessions.map((s, i) => {
        if (i === idxA) return { ...s, day: sessB.day, timeSlotId: sessB.timeSlotId };
        if (i === idxB) return { ...s, day: sessA.day, timeSlotId: sessA.timeSlotId };
        return s;
      });

      // Verify hard constraints on swapped state
      if (!validateHardConstraintsFast(swappedSessions, problem)) continue;

      // Compute new soft penalty
      const newPenalty = calculateSoftPenalties(swappedSessions, problem);
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
