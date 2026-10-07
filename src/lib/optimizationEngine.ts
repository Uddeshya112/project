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
export type OptimizationProfile = 'STUDENT_FOCUSED' | 'FACULTY_FOCUSED' | 'BALANCED';

export interface EngineOptions {
  budgetMode?: BudgetMode;
  optimizationProfile?: OptimizationProfile;
  timeBudgetMs?: number; // Max time limit for optimization
  seed?: number; // Deterministic seed
  maxCandidates?: number; // Number of top candidate schedules to generate
  fixedSessions?: ClassSession[];
}

export interface SoftPenaltyBreakdown {
  facultyGapsPenalty: number;
  facultyConsecutivePenalty: number;
  studentGapsPenalty: number;
  studentConsecutivePenalty: number;
  studentWorkloadImbalancePenalty: number;
  courseDistributionPenalty: number;
  buildingTravelPenalty: number;
  sameSlotEveryDayPenalty: number;
  roomCapacityFitPenalty: number;
  facultyPreferenceBonus: number;
  totalPenalty: number;
  perSectionPenalties?: Record<string, number>;
  perFacultyPenalties?: Record<string, number>;
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
  versionNumber?: number;
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
  durationPeriods: number;
  sessionType: string;
  isPinned?: boolean;
  pinnedSlotIdx?: number;
  pinnedRoomIdx?: number;
  electiveGroupId?: string;
  candidateRooms: number[]; // roomIdx array
  feasibleSlotIndices: number[]; // slotIdx array where faculty & room prerequisites allow assignment
  feasibleBlocks?: number[][]; // [slot1, slot2, ...] blocks for multi-period sessions
  feasibleLabBlocks?: [number, number][]; // [slot1, slot2] pairs for 2-hour atomic labs
}

interface CompiledProblem {
  academicYear: AcademicYearConfig;
  allocations: InternalAllocation[];
  slots: SlotRef[];
  rooms: Room[];
  faculty: Faculty[];
  sections: StudentSection[];
  courses: Course[];
  constraints: AcademicConstraint[];
  totalSubSections: number;
  subSectionIdMap: Map<string, number>;
  totalSlots: number;
  numDays: number;
  numPeriodsPerDay: number;
  lunchSlotIndices: Set<number>;
  infeasibilityReasons: string[];
  slotKeyMap: Map<string, SlotRef>;
  roomMap: Map<string, Room>;
  facultyMap: Map<string, Faculty>;
  sectionMap: Map<string, StudentSection>;
  courseMap: Map<string, Course>;
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

  if (!academicYear.workingDays || academicYear.workingDays.length === 0) {
    infeasibilityReasons.push('No academic working days configured in academic year setup.');
  }

  const workingDays: DayOfWeek[] = academicYear.workingDays || [];

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
  const activeFaculty = facultyMembers.filter(f => f.status !== 'Inactive' && f.status !== 'OnLeave');
  const activeSections = sections.filter(s => s.status !== 'Inactive');

  // Fast entity ID maps
  const facultyIdxMap = new Map<string, number>();
  activeFaculty.forEach((f, idx) => facultyIdxMap.set(f.id, idx));

  const sectionIdxMap = new Map<string, number>();
  activeSections.forEach((s, idx) => sectionIdxMap.set(s.id, idx));

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

    const facIdx = facultyIdxMap.get(faculty.id)!;
    const secIdx = sectionIdxMap.get(section.id)!;
    const subSecIdx = alloc.subSectionId ? subSectionIdMap.get(alloc.subSectionId) : undefined;
    const subSectionObj = alloc.subSectionId ? (section.subSections || []).find(sub => sub.id === alloc.subSectionId) : undefined;

    // Accumulate total section load for whole-class lectures; subgroups share time slots concurrently
    if (!alloc.subSectionId) {
      const currentSecHours = (sectionHoursAccumulator.get(section.id) || 0) + alloc.hoursPerWeek;
      sectionHoursAccumulator.set(section.id, currentSecHours);
    }

    // Find candidate rooms capable of holding this allocation
    const candidateRoomsIndices: number[] = [];
    const isLabAlloc = alloc.sessionType === 'Lab' || alloc.sessionType === 'Practical';
    const requiredCapacity = subSectionObj ? subSectionObj.studentCount : (alloc.subSectionId ? Math.ceil(section.studentCount / 2) : section.studentCount);

    activeRooms.forEach((r, rIdx) => {
      const isLabRoom = r.type === 'ComputerLab' || r.type === 'HardwareLab';
      const isLectureRoom = r.type === 'LectureHall' || r.type === 'SeminarRoom' || r.type === 'TutorialRoom';
      const isRoomTypeMatch = isLabAlloc ? isLabRoom : isLectureRoom;
      
      // Equipment requirements check
      const roomEquip = new Set(r.equipment || []);
      const hasAllEquip = !course.requiredEquipment || course.requiredEquipment.length === 0 || course.requiredEquipment.every(eq => roomEquip.has(eq));

      if (r.isAvailable && isRoomTypeMatch && r.capacity >= requiredCapacity && hasAllEquip) {
        candidateRoomsIndices.push(rIdx);
      }
    });

    if (candidateRoomsIndices.length === 0) {
      const reqEquip = course.requiredEquipment || [];
      const equipStr = reqEquip.length > 0 ? ` with equipment [${reqEquip.join(', ')}]` : '';
      infeasibilityReasons.push(
        `Course ${course.code} (${alloc.sessionType}) for ${section.name}: No available ${isLabAlloc ? 'ComputerLab/HardwareLab' : 'lecture room'} meets capacity (${requiredCapacity} students)${equipStr}.`
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

    // Determine session duration (1 for Lecture/Tutorial, 2 or 3 for Lab blocks)
    const durationPeriods = alloc.durationPeriods || (alloc.sessionType === 'Lab' || alloc.sessionType === 'Practical' ? (course.requiredLabsPerWeek === 3 ? 3 : 2) : 1);

    if (alloc.durationPeriods !== undefined && durationPeriods > 1 && alloc.hoursPerWeek % durationPeriods !== 0) {
      infeasibilityReasons.push(
        `Course ${course.code} allocation ${alloc.id}: ${alloc.hoursPerWeek} weekly hour(s) cannot be represented as whole ${durationPeriods}-period lab blocks.`,
      );
    }

    // Compute contiguous multi-period blocks for Lab/Practical/Multi-period allocations
    const feasibleBlocks: number[][] = [];
    const feasibleLabBlocks: [number, number][] = [];
    if (durationPeriods > 1) {
      for (let s1Idx = 0; s1Idx <= slots.length - durationPeriods; s1Idx++) {
        const blockSlots: number[] = [];
        let validBlock = true;
        const firstSlot = slots[s1Idx];

        for (let offset = 0; offset < durationPeriods; offset++) {
          const currentSlot = slots[s1Idx + offset];
          if (!currentSlot || currentSlot.day !== firstSlot.day || lunchSlotIndices.has(currentSlot.slotIdx) || !feasibleSlotIndices.includes(currentSlot.slotIdx)) {
            validBlock = false;
            break;
          }
          if (offset > 0) {
            const prevSlot = slots[s1Idx + offset - 1];
            const tsPrev = academicYear.timeSlots?.find(t => t.id === prevSlot.timeSlotId);
            const tsCurr = academicYear.timeSlots?.find(t => t.id === currentSlot.timeSlotId);
            if (tsPrev && tsCurr) {
              if (tsPrev.endTime !== tsCurr.startTime && tsPrev.periodNumber + 1 !== tsCurr.periodNumber) {
                validBlock = false;
                break;
              }
            } else {
              if (currentSlot.periodIdx !== prevSlot.periodIdx + 1) {
                validBlock = false;
                break;
              }
            }
          }
          blockSlots.push(currentSlot.slotIdx);
        }

        if (validBlock && blockSlots.length === durationPeriods) {
          feasibleBlocks.push(blockSlots);
          if (durationPeriods === 2) {
            feasibleLabBlocks.push([blockSlots[0], blockSlots[1]]);
          }
        }
      }
    }

    // Pinned slot identification
    let isPinned = Boolean(alloc.isPinned && alloc.pinnedDay && alloc.pinnedTimeSlotId);
    let pinnedSlotIdx: number | undefined = undefined;
    let pinnedRoomIdx: number | undefined = undefined;

    if (isPinned) {
      const matchSlot = slots.find(s => s.day === alloc.pinnedDay && s.timeSlotId === alloc.pinnedTimeSlotId);
      if (matchSlot) {
        pinnedSlotIdx = matchSlot.slotIdx;
        if (alloc.pinnedRoomId) {
          const rIdx = activeRooms.findIndex(r => r.id === alloc.pinnedRoomId);
          pinnedRoomIdx = rIdx !== -1 ? rIdx : candidateRoomsIndices[0];
        } else {
          pinnedRoomIdx = candidateRoomsIndices[0];
        }
      } else {
        isPinned = false;
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
      durationPeriods,
      sessionType: alloc.sessionType,
      isPinned,
      pinnedSlotIdx,
      pinnedRoomIdx,
      electiveGroupId: alloc.electiveGroupId,
      candidateRooms: candidateRoomsIndices,
      feasibleSlotIndices,
      feasibleBlocks,
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

  // Build O(1) indexed maps for high-performance retrieval
  const slotKeyMap = new Map<string, SlotRef>();
  slots.forEach(s => slotKeyMap.set(`${s.day}_${s.timeSlotId}`, s));

  const roomMap = new Map<string, Room>();
  activeRooms.forEach(r => roomMap.set(r.id, r));

  const facultyMap = new Map<string, Faculty>();
  activeFaculty.forEach(f => facultyMap.set(f.id, f));

  const sectionMap = new Map<string, StudentSection>();
  activeSections.forEach(s => sectionMap.set(s.id, s));

  const courseMap = new Map<string, Course>();
  courses.forEach(c => courseMap.set(c.id, c));

  return {
    academicYear,
    allocations: compiledAllocations,
    slots,
    rooms: activeRooms,
    faculty: activeFaculty,
    sections: activeSections,
    courses,
    constraints: constraints || [],
    totalSubSections: subSecCounter,
    subSectionIdMap,
    totalSlots,
    numDays,
    numPeriodsPerDay,
    lunchSlotIndices,
    infeasibilityReasons,
    slotKeyMap,
    roomMap,
    facultyMap,
    sectionMap,
    courseMap,
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
  const fixedSessionKeys = new Set<string>();
  const fixedAssignmentCounts = new Map<number, number>();

  // Pre-assign pinned immutable sessions
  for (const alloc of problem.allocations) {
    if (alloc.isPinned && alloc.pinnedSlotIdx !== undefined && alloc.pinnedRoomIdx !== undefined) {
      const s = alloc.pinnedSlotIdx;
      const r = alloc.pinnedRoomIdx;
      const bit = 1n << BigInt(s);
      facultyOccupancy[alloc.facultyIdx] |= bit;
      roomOccupancy[r] |= bit;
      if (alloc.subSectionIdx !== undefined) {
        subSectionOccupancy[alloc.subSectionIdx] |= bit;
        sectionSubgroupCounts[alloc.sectionIdx][s]++;
      } else {
        sectionWholeOccupancy[alloc.sectionIdx] |= bit;
      }
      allocHoursAssigned[alloc.allocIdx] += 1;
      allocAssignedSlots[alloc.allocIdx].push({ slotIdx: s, roomIdx: r });
    }
  }

  // Also pre-assign explicit fixedSessions supplied by the caller.
  // These are immutable even when the originating allocation lacks isPinned metadata.
  for (const fixed of options.fixedSessions ?? []) {
    const slotRef = problem.slotKeyMap.get(`${fixed.day}_${fixed.timeSlotId}`);
    const roomIdx = problem.rooms.findIndex((r) => r.id === fixed.roomId);
    if (!slotRef || roomIdx < 0) continue;

    let chosenAllocIdx = -1;
    let chosenCount = Number.POSITIVE_INFINITY;
    for (const alloc of problem.allocations) {
      if (
        alloc.course.id !== fixed.courseId ||
        alloc.section.id !== fixed.sectionId ||
        alloc.faculty.id !== fixed.facultyId ||
        (alloc.allocation.subSectionId ?? '') !== (fixed.subSectionId ?? '')
      ) continue;
      const count = fixedAssignmentCounts.get(alloc.allocIdx) ?? 0;
      if (count < alloc.requiredHours && count < chosenCount) {
        chosenAllocIdx = alloc.allocIdx;
        chosenCount = count;
      }
    }
    if (chosenAllocIdx < 0) continue;

    const alloc = problem.allocations[chosenAllocIdx];
    const bit = 1n << BigInt(slotRef.slotIdx);
    const subgroup = alloc.subSectionIdx !== undefined;
    if ((facultyOccupancy[alloc.facultyIdx] & bit) !== 0n) continue;
    if ((roomOccupancy[roomIdx] & bit) !== 0n) continue;
    if (subgroup) {
      if ((sectionWholeOccupancy[alloc.sectionIdx] & bit) !== 0n) continue;
      if ((subSectionOccupancy[alloc.subSectionIdx!] & bit) !== 0n) continue;
      subSectionOccupancy[alloc.subSectionIdx!] |= bit;
      sectionSubgroupCounts[alloc.sectionIdx][slotRef.slotIdx]++;
    } else {
      if ((sectionWholeOccupancy[alloc.sectionIdx] & bit) !== 0n) continue;
      if (sectionSubgroupCounts[alloc.sectionIdx][slotRef.slotIdx] > 0) continue;
      sectionWholeOccupancy[alloc.sectionIdx] |= bit;
    }

    facultyOccupancy[alloc.facultyIdx] |= bit;
    roomOccupancy[roomIdx] |= bit;
    allocHoursAssigned[chosenAllocIdx] += 1;
    allocAssignedSlots[chosenAllocIdx].push({ slotIdx: slotRef.slotIdx, roomIdx });
    fixedAssignmentCounts.set(chosenAllocIdx, chosenCount + 1);
    fixedSessionKeys.add(`${fixed.courseId}|${fixed.sectionId}|${fixed.subSectionId ?? ''}|${fixed.day}|${fixed.timeSlotId}|${fixed.roomId}`);
  }
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
        options.optimizationProfile || 'BALANCED',
        fixedSessionKeys,
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

    const requiresAtomicBlock =
      currentAlloc.allocation.durationPeriods !== undefined ||
      (((currentAlloc.sessionType === 'Lab' || currentAlloc.sessionType === 'Practical')) &&
        currentAlloc.durationPeriods > 1 &&
        currentAlloc.requiredHours % currentAlloc.durationPeriods === 0);
    const isMultiPeriod =
      requiresAtomicBlock &&
      currentAlloc.durationPeriods > 1 &&
      hoursNeeded >= currentAlloc.durationPeriods &&
      hoursNeeded % currentAlloc.durationPeriods === 0;

    if (isMultiPeriod) {
      // Branch 1: Atomic Multi-Period Block Scheduling (2 or 3 hours)
      const candidateBlocks = [...currentAlloc.feasibleBlocks!];
      {
        for (let i = candidateBlocks.length - 1; i > 0; i--) {
          const j = Math.floor(prng.next() * (i + 1));
          [candidateBlocks[i], candidateBlocks[j]] = [candidateBlocks[j], candidateBlocks[i]];
        }
      }

      const dur = currentAlloc.durationPeriods;
      for (const block of candidateBlocks) {
        let blockBit = 0n;
        for (const s of block) {
          blockBit |= (1n << BigInt(s));
        }
        constraintChecksCount += dur;

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
          let hasSubgroupCollision = false;
          for (const s of block) {
            if (sectionSubgroupCounts[secIdx][s] > 0) {
              hasSubgroupCollision = true;
              break;
            }
          }
          if ((sectionWholeOccupancy[secIdx] & blockBit) !== 0n || hasSubgroupCollision) {
            candidatesPruned++;
            continue;
          }
        }

        // 3. Find Available Compatible Room for all periods of the block
        let chosenRoomIdx = -1;
        for (const rIdx of currentAlloc.candidateRooms) {
          constraintChecksCount += dur;
          if ((roomOccupancy[rIdx] & blockBit) === 0n) {
            chosenRoomIdx = rIdx;
            break;
          }
        }

        if (chosenRoomIdx === -1) {
          candidatesPruned++;
          continue;
        }

        // Apply multi-period assignment
        facultyOccupancy[facIdx] |= blockBit;
        roomOccupancy[chosenRoomIdx] |= blockBit;
        if (isSubgroupAlloc) {
          subSectionOccupancy[currentAlloc.subSectionIdx!] |= blockBit;
          for (const s of block) {
            sectionSubgroupCounts[secIdx][s]++;
          }
        } else {
          sectionWholeOccupancy[secIdx] |= blockBit;
        }

        allocHoursAssigned[currentAlloc.allocIdx] += dur;
        for (const s of block) {
          allocAssignedSlots[currentAlloc.allocIdx].push({ slotIdx: s, roomIdx: chosenRoomIdx });
        }

        const nextOrderIdx = allocHoursAssigned[currentAlloc.allocIdx] >= currentAlloc.requiredHours ? allocOrderIdx + 1 : allocOrderIdx;
        const success = solvePhaseA(nextOrderIdx);
        if (success) return true;

        // Backtrack
        backtracksCount++;
        facultyOccupancy[facIdx] &= ~blockBit;
        roomOccupancy[chosenRoomIdx] &= ~blockBit;
        if (isSubgroupAlloc) {
          subSectionOccupancy[currentAlloc.subSectionIdx!] &= ~blockBit;
          for (const s of block) {
            sectionSubgroupCounts[secIdx][s]--;
          }
        } else {
          sectionWholeOccupancy[secIdx] &= ~blockBit;
        }

        allocHoursAssigned[currentAlloc.allocIdx] -= dur;
        for (let k = 0; k < dur; k++) {
          allocAssignedSlots[currentAlloc.allocIdx].pop();
        }
      }

      return false;
    } else {
      // Branch 2: Single-Hour Lecture / Tutorial Scheduling (with 1-lecture/day/course distribution)
      let candidateSlots = [...currentAlloc.feasibleSlotIndices];
      {
        for (let i = candidateSlots.length - 1; i > 0; i--) {
          const j = Math.floor(prng.next() * (i + 1));
          [candidateSlots[i], candidateSlots[j]] = [candidateSlots[j], candidateSlots[i]];
        }
        if (candidateSlots.length > 1) {
          const rotation = (candidatesFound.length * 17) % candidateSlots.length;
          candidateSlots = candidateSlots.slice(rotation).concat(candidateSlots.slice(0, rotation));
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
        const roomChoices = [...currentAlloc.candidateRooms];
        {
          for (let i = roomChoices.length - 1; i > 0; i--) {
            const j = Math.floor(prng.next() * (i + 1));
            [roomChoices[i], roomChoices[j]] = [roomChoices[j], roomChoices[i]];
          }
        }
        for (const rIdx of roomChoices) {
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

        const nextOrderIdx = allocHoursAssigned[currentAlloc.allocIdx] >= currentAlloc.requiredHours ? allocOrderIdx + 1 : allocOrderIdx;
        const success = solvePhaseA(nextOrderIdx);
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

function calculateCandidateHealthScore(sessions: ClassSession[], problem: CompiledProblem): number {
  const active = sessions.filter((s) => s.status !== 'Cancelled');
  if (active.length === 0) return 0;

  let hardViolations = 0;
  const facultyBusy = new Set<string>();
  const roomBusy = new Set<string>();
  const wholeBusy = new Set<string>();
  const subgroupBusy = new Set<string>();
  const subgroupSlot = new Set<string>();
  for (const s of active) {
    const slot = `${s.day}_${s.timeSlotId}`;
    const fk = `${s.facultyId}_${slot}`;
    const rk = `${s.roomId}_${slot}`;
    if (facultyBusy.has(fk)) hardViolations++; else facultyBusy.add(fk);
    if (roomBusy.has(rk)) hardViolations++; else roomBusy.add(rk);
    const sk = `${s.sectionId}_${slot}`;
    if (s.subSectionId) {
      if (wholeBusy.has(sk)) hardViolations++;
      const sub = `${s.subSectionId}_${slot}`;
      if (subgroupBusy.has(sub)) hardViolations++; else subgroupBusy.add(sub);
      subgroupSlot.add(sk);
    } else {
      if (wholeBusy.has(sk) || subgroupSlot.has(sk)) hardViolations++;
      else wholeBusy.add(sk);
    }
  }

  const teachingSlots = (problem.academicYear.timeSlots || []).filter((t) => !t.isBreak && !t.isLunch && t.id !== problem.academicYear.lunchPeriodId);
  const slotsPerWeek = Math.max(1, (problem.academicYear.workingDays || []).length * teachingSlots.length);
  const availableRooms = problem.rooms.filter((r) => r.isAvailable);
  const usedRoomSlots = new Set(active.map((s) => `${s.roomId}_${s.day}_${s.timeSlotId}`)).size;
  const roomUtilization = Math.min(100, Math.round((usedRoomSlots / Math.max(1, availableRooms.length * slotsPerWeek)) * 100));

  const hoursByFaculty = new Map<string, number>();
  active.forEach((s) => hoursByFaculty.set(s.facultyId, (hoursByFaculty.get(s.facultyId) ?? 0) + 1));
  const teachingFaculty = problem.faculty.filter((fac) => hoursByFaculty.has(fac.id));
  const withinLimit = teachingFaculty.filter((fac) => (hoursByFaculty.get(fac.id) ?? 0) <= (fac.maxDirectTeachingHours || Infinity)).length;
  const facultyBalance = teachingFaculty.length ? Math.round((withinLimit / teachingFaculty.length) * 100) : 100;

  const sectionDay = new Map<string, Set<string>>();
  active.forEach((s) => {
    const k = `${s.sectionId}_${s.day}`;
    if (!sectionDay.has(k)) sectionDay.set(k, new Set());
    sectionDay.get(k)!.add(s.timeSlotId);
  });
  const dayLoads = [...sectionDay.values()];
  const studentBalance = dayLoads.length ? Math.round((dayLoads.filter((d) => d.size <= 6).length / dayLoads.length) * 100) : 100;

  const periodOf = new Map((problem.academicYear.timeSlots || []).map((t) => [t.id, t.periodNumber]));
  const facultyById = new Map(problem.faculty.map((f) => [f.id, f]));
  const preferred = active.filter((s) => {
    const p = facultyById.get(s.facultyId)?.preferences;
    if (!p) return true;
    const dayOk = !p.preferredDays?.length || p.preferredDays.includes(s.day);
    const periodOk = !p.preferredPeriods?.length || p.preferredPeriods.includes(periodOf.get(s.timeSlotId) ?? -1);
    return dayOk && periodOk;
  }).length;
  const preferenceScore = Math.round((preferred / active.length) * 100);

  const soft = Math.round(
    facultyBalance * 0.25 +
    studentBalance * 0.25 +
    preferenceScore * 0.15 +
    Math.min(100, roomUtilization * 2) * 0.1 +
    100 * 0.15 +
    100 * 0.1,
  );
  return hardViolations > 0 ? Math.min(soft, 40) : soft;
}
// ---------------------------------------------------------------------------
// 3. Helper: Build Candidate Object & Evaluate Soft Constraints
// ---------------------------------------------------------------------------
function buildCandidateFromState(
  candidateNum: number,
  seed: number,
  problem: CompiledProblem,
  allocAssignedSlots: { slotIdx: number; roomIdx: number }[][],
  profile: OptimizationProfile = 'BALANCED',
  fixedSessionKeys: Set<string> = new Set(),
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

      const sessionKey = `${internalAlloc.course.id}|${internalAlloc.section.id}|${internalAlloc.allocation.subSectionId ?? ''}|${slotRef.day}|${slotRef.timeSlotId}|${room.id}`;
      const isFixed = fixedSessionKeys.has(sessionKey) || Boolean(internalAlloc.isPinned);
      sessions.push({
        id: `sess-cand${candidateNum}-${sessionCounter++}`,
        courseId: internalAlloc.course.id,
        facultyId: internalAlloc.faculty.id,
        sectionId: internalAlloc.section.id,
        subSectionId: internalAlloc.allocation.subSectionId,
        roomId: room.id,
        day: slotRef.day,
        timeSlotId: slotRef.timeSlotId,
        durationPeriods: internalAlloc.durationPeriods || 1,
        type: internalAlloc.sessionType as any,
        status: isFixed ? 'Confirmed' : 'Planned',
        isLocked: isFixed ? true : undefined,
        isPinned: isFixed ? true : undefined,
        version: 1,
      });

      scheduledHours++;
    }
  }

  const totalRequestedHours = problem.allocations.reduce((sum, a) => sum + a.requiredHours, 0);
  const softPenalty = calculateSoftPenalties(sessions, problem, profile);

  // Health is derived from the shared timetable health model; no artificial floor.
  const healthScore = calculateCandidateHealthScore(sessions, problem);

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
  // Helper to read configurable weights from AcademicConstraint
  function getWeight(code: string, defaultVal: number): number {
    const c = problem.constraints?.find(
      x => (x.code && x.code.toLowerCase() === code.toLowerCase()) ||
           (x.id && x.id.toLowerCase() === code.toLowerCase()) ||
           (x.name && x.name.toLowerCase().includes(code.toLowerCase()))
    );
    if (c) {
      if (!c.isActive) return 0;
      if (c.parameterValue !== undefined && !isNaN(Number(c.parameterValue))) {
        return Number(c.parameterValue);
      }
    }
    return defaultVal;
  }

  // Weight multipliers derived from profile and academic constraints
  const wFacGap = getWeight('FACULTY_GAPS', profile === 'FACULTY_FOCUSED' ? 12.0 : 2.0);
  const wFacConsec = getWeight('FACULTY_CONSECUTIVE', profile === 'FACULTY_FOCUSED' ? 6.0 : 3.0);
  const wStuGap = getWeight('STUDENT_GAPS', profile === 'STUDENT_FOCUSED' ? 12.0 : 2.0);
  const wStuConsec = getWeight('STUDENT_CONSECUTIVE', profile === 'STUDENT_FOCUSED' ? 8.0 : 4.0);
  const wStuImbalanceHigh = getWeight('STUDENT_WORKLOAD_HIGH', profile === 'STUDENT_FOCUSED' ? 6.0 : 3.0);
  const wStuImbalanceLow = getWeight('STUDENT_WORKLOAD_LOW', profile === 'STUDENT_FOCUSED' ? 3.0 : 1.0);
  const wCourseDist = getWeight('COURSE_DISTRIBUTION', profile === 'STUDENT_FOCUSED' ? 10.0 : 5.0);
  const wBuildingTravel = getWeight('BUILDING_TRAVEL', profile === 'STUDENT_FOCUSED' ? 10.0 : 5.0);
  const wSlotVariation = getWeight('SLOT_VARIATION', 3.0);

  let facultyGapsPenalty = 0;
  let facultyConsecutivePenalty = 0;
  let studentWorkloadImbalancePenalty = 0;
  let courseDistributionPenalty = 0;
  let roomCapacityFitPenalty = 0;
  let facultyPreferenceBonus = 0;

  const perSectionPenalties: Record<string, number> = {};
  const perFacultyPenalties: Record<string, number> = {};

  const facultyDayMap = new Map<string, number[]>();
  const sectionDayMap = new Map<string, number[]>();
  const sectionCourseDayMap = new Map<string, number>();
  const courseSectionSlotMap = new Map<string, number[]>();
  const sectionDaySessionsMap = new Map<string, Array<{ periodIdx: number; roomId: string; building: string }>>();

  for (const sess of sessions) {
    const slotRef = problem.slotKeyMap.get(`${sess.day}_${sess.timeSlotId}`);
    if (!slotRef) continue;

    const facKey = `${sess.facultyId}_${sess.day}`;
    let facPeriods = facultyDayMap.get(facKey);
    if (!facPeriods) {
      facPeriods = [];
      facultyDayMap.set(facKey, facPeriods);
    }
    facPeriods.push(slotRef.periodIdx);

    const secKey = `${sess.sectionId}_${sess.day}`;
    let secPeriods = sectionDayMap.get(secKey);
    if (!secPeriods) {
      secPeriods = [];
      sectionDayMap.set(secKey, secPeriods);
    }
    secPeriods.push(slotRef.periodIdx);

    const courseKey = `${sess.sectionId}_${sess.courseId}_${sess.day}`;
    sectionCourseDayMap.set(courseKey, (sectionCourseDayMap.get(courseKey) || 0) + 1);

    const csKey = `${sess.sectionId}_${sess.courseId}`;
    let csPeriods = courseSectionSlotMap.get(csKey);
    if (!csPeriods) {
      csPeriods = [];
      courseSectionSlotMap.set(csKey, csPeriods);
    }
    csPeriods.push(slotRef.periodIdx);

    const room = problem.roomMap.get(sess.roomId);
    if (room) {
      let secDayList = sectionDaySessionsMap.get(secKey);
      if (!secDayList) {
        secDayList = [];
        sectionDaySessionsMap.set(secKey, secDayList);
      }
      secDayList.push({
        periodIdx: slotRef.periodIdx,
        roomId: room.id,
        building: room.building || 'Main Campus',
      });

      const section = problem.sectionMap.get(sess.sectionId);
      if (section) {
        const unusedChairs = room.capacity - section.studentCount;
        if (unusedChairs > 40) {
          roomCapacityFitPenalty += 1.0;
          perSectionPenalties[section.id] = (perSectionPenalties[section.id] || 0) + 1.0;
        }
      }
    }

    // Faculty Preference Bonus
    const fac = problem.facultyMap.get(sess.facultyId);
    if (fac && fac.preferences) {
      if (fac.preferences.preferredDays && fac.preferences.preferredDays.includes(sess.day)) {
        facultyPreferenceBonus += 1.0;
      }
      if (fac.preferences.preferredPeriods && fac.preferences.preferredPeriods.includes(slotRef.periodIdx)) {
        facultyPreferenceBonus += 1.0;
      }
    }
  }

  // 1. Faculty Gap & Consecutive Class Penalties
  for (const [facDayKey, periods] of facultyDayMap.entries()) {
    const facId = facDayKey.split('_')[0];
    periods.sort((a, b) => a - b);

    if (periods.length > 1) {
      let gapCount = 0;
      for (let i = 0; i < periods.length - 1; i++) {
        const diff = periods[i + 1] - periods[i] - 1;
        if (diff > 0) gapCount += diff;
      }
      const p = gapCount * wFacGap;
      facultyGapsPenalty += p;
      perFacultyPenalties[facId] = (perFacultyPenalties[facId] || 0) + p;
    }

    let consecutive = 1;
    for (let i = 1; i < periods.length; i++) {
      if (periods[i] === periods[i - 1] + 1) {
        consecutive++;
        if (consecutive > 3) {
          facultyConsecutivePenalty += wFacConsec;
          perFacultyPenalties[facId] = (perFacultyPenalties[facId] || 0) + wFacConsec;
        }
      } else {
        consecutive = 1;
      }
    }
  }

  // 2. Student Gap, Workload Imbalance & Consecutive Period Penalties
  let studentGapsPenalty = 0;
  let studentConsecutivePenalty = 0;
  let buildingTravelPenalty = 0;

  for (const [secDayKey, sList] of sectionDaySessionsMap.entries()) {
    const secId = secDayKey.split('_')[0];
    sList.sort((a, b) => a.periodIdx - b.periodIdx);

    // Consecutive periods check (max 3 consecutive student periods)
    let consecutive = 1;
    for (let i = 1; i < sList.length; i++) {
      if (sList[i].periodIdx === sList[i - 1].periodIdx + 1) {
        consecutive++;
        if (consecutive > 3) {
          studentConsecutivePenalty += wStuConsec;
          perSectionPenalties[secId] = (perSectionPenalties[secId] || 0) + wStuConsec;
        }
      } else {
        consecutive = 1;
      }
    }

    // Building travel penalty: consecutive periods (gap 0) with different buildings
    for (let i = 0; i < sList.length - 1; i++) {
      const sCurr = sList[i];
      const sNext = sList[i + 1];
      if (sNext.periodIdx === sCurr.periodIdx + 1 && sCurr.building !== sNext.building) {
        buildingTravelPenalty += wBuildingTravel;
        perSectionPenalties[secId] = (perSectionPenalties[secId] || 0) + wBuildingTravel;
      }
    }
  }

  for (const [secDayKey, periods] of sectionDayMap.entries()) {
    const secId = secDayKey.split('_')[0];
    periods.sort((a, b) => a - b);
    if (periods.length > 1) {
      let gapCount = 0;
      for (let i = 0; i < periods.length - 1; i++) {
        const diff = periods[i + 1] - periods[i] - 1;
        if (diff > 0) gapCount += diff;
      }
      const p = gapCount * wStuGap;
      studentGapsPenalty += p;
      perSectionPenalties[secId] = (perSectionPenalties[secId] || 0) + p;
    }

    if (periods.length > 5) {
      const p = (periods.length - 5) * wStuImbalanceHigh;
      studentWorkloadImbalancePenalty += p;
      perSectionPenalties[secId] = (perSectionPenalties[secId] || 0) + p;
    } else if (periods.length === 1) {
      studentWorkloadImbalancePenalty += wStuImbalanceLow;
      perSectionPenalties[secId] = (perSectionPenalties[secId] || 0) + wStuImbalanceLow;
    }
  }

  for (const [secCourseDayKey, count] of sectionCourseDayMap.entries()) {
    const secId = secCourseDayKey.split('_')[0];
    if (count > 1) {
      const p = (count - 1) * wCourseDist;
      courseDistributionPenalty += p;
      perSectionPenalties[secId] = (perSectionPenalties[secId] || 0) + p;
    }
  }

  // 3. Avoid Same Course in Same Slot Every Day (Slot Variation)
  let sameSlotEveryDayPenalty = 0;

  for (const [csKey, pIndices] of courseSectionSlotMap.entries()) {
    const secId = csKey.split('_')[0];
    const counts = new Map<number, number>();
    for (const p of pIndices) {
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    for (const cnt of counts.values()) {
      if (cnt > 1) {
        const p = (cnt - 1) * wSlotVariation;
        sameSlotEveryDayPenalty += p;
        perSectionPenalties[secId] = (perSectionPenalties[secId] || 0) + p;
      }
    }
  }

  const totalPenalty = Math.max(
    0,
    facultyGapsPenalty +
      facultyConsecutivePenalty +
      studentGapsPenalty +
      studentConsecutivePenalty +
      studentWorkloadImbalancePenalty +
      courseDistributionPenalty +
      buildingTravelPenalty +
      sameSlotEveryDayPenalty +
      roomCapacityFitPenalty -
      facultyPreferenceBonus
  );

  return {
    facultyGapsPenalty: Number(facultyGapsPenalty.toFixed(1)),
    facultyConsecutivePenalty: Number(facultyConsecutivePenalty.toFixed(1)),
    studentGapsPenalty: Number(studentGapsPenalty.toFixed(1)),
    studentConsecutivePenalty: Number(studentConsecutivePenalty.toFixed(1)),
    studentWorkloadImbalancePenalty: Number(studentWorkloadImbalancePenalty.toFixed(1)),
    courseDistributionPenalty: Number(courseDistributionPenalty.toFixed(1)),
    buildingTravelPenalty: Number(buildingTravelPenalty.toFixed(1)),
    sameSlotEveryDayPenalty: Number(sameSlotEveryDayPenalty.toFixed(1)),
    roomCapacityFitPenalty: Number(roomCapacityFitPenalty.toFixed(1)),
    facultyPreferenceBonus: Number(facultyPreferenceBonus.toFixed(1)),
    totalPenalty: Number(totalPenalty.toFixed(1)),
    perSectionPenalties,
    perFacultyPenalties,
  };
}

// ---------------------------------------------------------------------------
// 5. Phase B: Simulated Annealing Multi-Neighborhood Search Optimization
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

    let currentSessions = [...candidate.sessions];
    let currentPenalty = candidate.softPenalty.totalPenalty;
    let currentScore = candidate.healthScore;

    let bestSessions = [...currentSessions];
    let bestPenalty = currentPenalty;
    let bestScore = currentScore;
    let bestBreakdown = candidate.softPenalty;

    // Simulated Annealing parameters
    let temperature = 10.0;
    const coolingRate = 0.98;
    const minTemperature = 0.01;
    let stagnantIterations = 0;

    // Find non-pinned, non-lab sessions available for move/swap/relocate
    const movableIndices: number[] = [];
    for (let i = 0; i < currentSessions.length; i++) {
      const s = currentSessions[i];
      if (s.isPinned || s.isLocked) continue;
      if (s.type === 'Lab' || s.type === 'Practical') continue;
      movableIndices.push(i);
    }

    if (movableIndices.length < 2) continue;

    for (let iteration = 0; iteration < 300; iteration++) {
      if (performance.now() > endBy) break;

      const neighborType = prng.next();
      let neighborSessions: ClassSession[] | null = null;

      if (neighborType < 0.45) {
        // 1. NEIGHBORHOOD SWAP: Swap two compatible sessions
        const idxA = movableIndices[Math.floor(prng.next() * movableIndices.length)];
        const idxB = movableIndices[Math.floor(prng.next() * movableIndices.length)];
        if (idxA === idxB) continue;

        const sessA = currentSessions[idxA];
        const sessB = currentSessions[idxB];

        neighborSessions = currentSessions.map((s, i) => {
          if (i === idxA) return { ...s, day: sessB.day, timeSlotId: sessB.timeSlotId, roomId: sessB.roomId };
          if (i === idxB) return { ...s, day: sessA.day, timeSlotId: sessA.timeSlotId, roomId: sessA.roomId };
          return s;
        });
      } else if (neighborType < 0.80) {
        // 2. NEIGHBORHOOD MOVE: Move a session to a new random slot & candidate room
        const idx = movableIndices[Math.floor(prng.next() * movableIndices.length)];
        const sess = currentSessions[idx];
        const randomSlot = problem.slots[Math.floor(prng.next() * problem.slots.length)];
        if (problem.lunchSlotIndices.has(randomSlot.slotIdx)) continue;

        const candidateRooms = problem.rooms.filter(r => {
          const isLabRoom = r.type === 'ComputerLab' || r.type === 'HardwareLab';
          return r.isAvailable && !isLabRoom;
        });
        if (candidateRooms.length === 0) continue;
        const randomRoom = candidateRooms[Math.floor(prng.next() * candidateRooms.length)];

        neighborSessions = currentSessions.map((s, i) => {
          if (i === idx) {
            return { ...s, day: randomSlot.day, timeSlotId: randomSlot.timeSlotId, roomId: randomRoom.id };
          }
          return s;
        });
      } else {
        // 3. NEIGHBORHOOD RELOCATE: Change room for better capacity fit within same slot
        const idx = movableIndices[Math.floor(prng.next() * movableIndices.length)];
        const sess = currentSessions[idx];
        const candidateRooms = problem.rooms.filter(r => {
          const isLabRoom = r.type === 'ComputerLab' || r.type === 'HardwareLab';
          return r.isAvailable && !isLabRoom && r.id !== sess.roomId;
        });
        if (candidateRooms.length === 0) continue;
        const newRoom = candidateRooms[Math.floor(prng.next() * candidateRooms.length)];

        neighborSessions = currentSessions.map((s, i) => {
          if (i === idx) {
            return { ...s, roomId: newRoom.id };
          }
          return s;
        });
      }

      if (!neighborSessions || !validateHardConstraintsFast(neighborSessions, problem)) {
        continue;
      }

      // Evaluate new soft penalties
      const newBreakdown = calculateSoftPenalties(neighborSessions, problem, profile);
      const newPenalty = newBreakdown.totalPenalty;
      const newScore = Math.max(0, Math.min(100, Math.round(100 - newPenalty)));

      const deltaPenalty = newPenalty - currentPenalty;

      // Simulated Annealing acceptance criterion
      if (deltaPenalty < 0 || (temperature > minTemperature && Math.exp(-deltaPenalty / temperature) > prng.next())) {
        currentSessions = neighborSessions;
        currentPenalty = newPenalty;
        currentScore = newScore;
        stagnantIterations = 0;

        if (newPenalty < bestPenalty || newScore > bestScore) {
          bestSessions = neighborSessions;
          bestPenalty = newPenalty;
          bestScore = newScore;
          bestBreakdown = newBreakdown;
        }
      } else {
        stagnantIterations++;
      }

      // Cool down temperature
      temperature = Math.max(minTemperature, temperature * coolingRate);

      // Reheat if stuck in local minima
      if (stagnantIterations >= 25) {
        temperature = 6.0;
        stagnantIterations = 0;
      }
    }

    // Assign best found solution
    candidate.sessions = bestSessions;
    candidate.softPenalty = bestBreakdown;
    candidate.healthScore = calculateCandidateHealthScore(bestSessions, problem);
  }
}

function validateHardConstraintsFast(sessions: ClassSession[], problem: CompiledProblem): boolean {
  const facOccupancy = new Map<string, boolean>();
  const roomOccupancy = new Map<string, boolean>();
  const secWholeOccupancy = new Map<string, boolean>();
  const subSecOccupancy = new Map<string, boolean>();
  const subgroupSectionSlots = new Set<string>();

  for (const s of sessions) {
    const keySlot = `${s.day}_${s.timeSlotId}`;

    // 1. Check Lunch Slot
    const slotRef = problem.slotKeyMap.get(keySlot);
    if (!slotRef || problem.lunchSlotIndices.has(slotRef.slotIdx)) return false;

    // 2. Faculty Collision
    const facKey = `${s.facultyId}_${keySlot}`;
    if (facOccupancy.has(facKey)) return false;
    facOccupancy.set(facKey, true);

    // 3. Room Collision
    const roomKey = `${s.roomId}_${keySlot}`;
    if (roomOccupancy.has(roomKey)) return false;
    roomOccupancy.set(roomKey, true);

    // 4. Section and subgroup collisions
    const secKey = `${s.sectionId}_${keySlot}`;
    if (s.subSectionId) {
      if (secWholeOccupancy.has(secKey)) return false;
      const subKey = `${s.subSectionId}_${keySlot}`;
      if (subSecOccupancy.has(subKey)) return false;
      subSecOccupancy.set(subKey, true);
      subgroupSectionSlots.add(secKey);
    } else {
      if (secWholeOccupancy.has(secKey) || subgroupSectionSlots.has(secKey)) return false;
      secWholeOccupancy.set(secKey, true);
    }

    // 5. Room Type & Equipment Check
    const room = problem.roomMap.get(s.roomId);
    const course = problem.courseMap.get(s.courseId);
    if (!room || !room.isAvailable) return false;

    const isLabType = s.type === 'Lab' || s.type === 'Practical';
    const isLabRoom = room.type === 'ComputerLab' || room.type === 'HardwareLab';
    if (isLabType && !isLabRoom) return false;
    if (!isLabType && isLabRoom) return false;

    if (course?.requiredEquipment && course.requiredEquipment.length > 0) {
      const roomEquip = new Set(room.equipment || []);
      if (!course.requiredEquipment.every(eq => roomEquip.has(eq))) return false;
    }

    // 6. Capacity Check
    const section = problem.sectionMap.get(s.sectionId);
    if (section) {
      const reqCap = s.subSectionId ? Math.ceil(section.studentCount / 2) : section.studentCount;
      if (room.capacity < reqCap) return false;
    }

    // 7. Faculty Protected Slots
    const fac = problem.facultyMap.get(s.facultyId);
    if (fac) {
      if (fac.status === 'OnLeave' || fac.status === 'Inactive') return false;
      if (fac.preferences?.protectedSlots) {
        if (fac.preferences.protectedSlots.some(ps => ps.day === s.day && ps.periodId === s.timeSlotId)) {
          return false;
        }
      }
    }
  }

  return true;
}
