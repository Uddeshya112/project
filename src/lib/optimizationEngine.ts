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
  /** Existing locked sessions that must remain immutable. */
  pinnedSessions?: ClassSession[];
  /** Optional inter-building travel times in minutes; unspecified pairs default to 10. */
  buildingTravelMinutes?: Record<string, number>;
  /** Explicit soft-constraint overrides; values supersede profile defaults and AcademicConstraint values. */
  softWeights?: Partial<SoftWeightConfig>;
}

export interface SoftPenaltyBreakdown {
  facultyGapsPenalty: number;
  facultyConsecutivePenalty: number;
  studentGapsPenalty: number;
  studentWorkloadImbalancePenalty: number;
  courseDistributionPenalty: number;
  roomCapacityFitPenalty: number;
  facultyPreferenceBonus: number;
  studentConsecutivePenalty: number;
  travelPenalty: number;
  courseSpreadPenalty: number;
  repeatedPeriodPenalty: number;
  byFaculty: Record<string, number>;
  bySection: Record<string, number>;
  totalPenalty: number;
}

export interface SoftWeightConfig {
  facultyGap: number;
  facultyConsecutive: number;
  studentGap: number;
  studentWorkload: number;
  studentConsecutive: number;
  courseDistribution: number;
  repeatedCoursePeriod: number;
  roomCapacityFit: number;
  facultyPreferenceBonus: number;
  travel: number;
}

const DEFAULT_SOFT_WEIGHTS_BY_PROFILE: Record<OptimizationProfile, SoftWeightConfig> = {
  BALANCED: {
    facultyGap: 2, facultyConsecutive: 3, studentGap: 2, studentWorkload: 3,
    studentConsecutive: 3, courseDistribution: 5, repeatedCoursePeriod: 2,
    roomCapacityFit: 1, facultyPreferenceBonus: 1, travel: 1
  },
  STUDENT_FOCUSED: {
    facultyGap: 2, facultyConsecutive: 3, studentGap: 12, studentWorkload: 6,
    studentConsecutive: 5, courseDistribution: 10, repeatedCoursePeriod: 3,
    roomCapacityFit: 1, facultyPreferenceBonus: 1, travel: 1
  },
  FACULTY_FOCUSED: {
    facultyGap: 12, facultyConsecutive: 6, studentGap: 2, studentWorkload: 3,
    studentConsecutive: 2, courseDistribution: 5, repeatedCoursePeriod: 2,
    roomCapacityFit: 1, facultyPreferenceBonus: 1, travel: 1
  }
};

function resolveSoftWeights(
  constraints: AcademicConstraint[],
  profile: OptimizationProfile,
  overrides: Partial<SoftWeightConfig> = {}
): SoftWeightConfig {
  const base = { ...DEFAULT_SOFT_WEIGHTS_BY_PROFILE[profile] };
  const aliasMap: Record<keyof SoftWeightConfig, string[]> = {
    facultyGap: ['FACULTY_GAP', 'SOFT_FACULTY_GAP', 'MAX_FACULTY_GAPS'],
    facultyConsecutive: ['FACULTY_CONSECUTIVE', 'SOFT_FACULTY_CONSECUTIVE'],
    studentGap: ['STUDENT_GAP', 'SOFT_STUDENT_GAP', 'MIN_STUDENT_GAPS'],
    studentWorkload: ['STUDENT_WORKLOAD', 'SOFT_STUDENT_WORKLOAD'],
    studentConsecutive: ['STUDENT_CONSECUTIVE', 'MAX_STUDENT_CONSECUTIVE'],
    courseDistribution: ['COURSE_DISTRIBUTION', 'COURSE_SPREAD', 'SOFT_COURSE_DISTRIBUTION'],
    repeatedCoursePeriod: ['REPEATED_COURSE_PERIOD', 'SAME_COURSE_PERIOD'],
    roomCapacityFit: ['ROOM_CAPACITY_FIT', 'ROOM_UTILIZATION'],
    facultyPreferenceBonus: ['FACULTY_PREFERENCE_BONUS', 'FACULTY_PREFERENCES'],
    travel: ['BUILDING_TRAVEL', 'ROOM_TRAVEL', 'TRAVEL_TIME'],
  };
  for (const key of Object.keys(aliasMap) as (keyof SoftWeightConfig)[]) {
    const aliases = aliasMap[key];
    const constraint = constraints.find(c => c.isActive && c.type === 'Soft' && aliases.includes((c.code || '').toUpperCase()));
    const parsed = constraint ? Number(constraint.parameterValue) : NaN;
    if (Number.isFinite(parsed)) base[key] = Math.max(0, parsed);
    const override = Number(overrides[key]);
    if (Number.isFinite(override)) base[key] = Math.max(0, override);
  }
  return base;
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
  optimizationMethod?: 'Constructive Bitset MRV' | 'Simulated Annealing';
  objectiveValue?: number;
  bestBound?: number | null;
  optimalityGap?: number | null;
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
  durationPeriods: number;
  feasibleLabBlocks: number[][]; // atomic contiguous blocks; 2 or 3 periods for labs
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
  const activeFaculty = facultyMembers.filter(f => f.status === 'Active');
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

    if (!faculty.subjectsQualified.includes(course.code) && !faculty.subjectsQualified.includes(course.id)) {
      infeasibilityReasons.push(
        `Allocation ${alloc.id}: Faculty ${faculty.name} is not qualified to teach ${course.code}.`
      );
      continue;
    }
    const durationPeriods = Number.isInteger(alloc.durationPeriods) && (alloc.durationPeriods ?? 0) > 0
      ? Number(alloc.durationPeriods)
      : (alloc.sessionType === 'Lab' || alloc.sessionType === 'Practical' ? 2 : 1);
    if ((alloc.sessionType === 'Lab' || alloc.sessionType === 'Practical') && ![2, 3].includes(durationPeriods)) {
      infeasibilityReasons.push(`Allocation ${alloc.id} (${course.code}): lab duration must be 2 or 3 periods, got ${durationPeriods}.`);
      continue;
    }
    if (alloc.sessionType !== 'Lab' && alloc.sessionType !== 'Practical' && durationPeriods !== 1) {
      infeasibilityReasons.push(`Allocation ${alloc.id} (${course.code}): ${alloc.sessionType} activities must occupy exactly 1 period.`);
      continue;
    }
    if (alloc.hoursPerWeek % durationPeriods !== 0) {
      infeasibilityReasons.push(`Allocation ${alloc.id} (${course.code}): ${alloc.hoursPerWeek} weekly hours cannot be partitioned into ${durationPeriods}-period atomic blocks.`);
      continue;
    }

    // Accumulate total section load for whole-class lectures; subgroups share time slots concurrently
    if (!alloc.subSectionId) {
      const currentSecHours = (sectionHoursAccumulator.get(section.id) || 0) + alloc.hoursPerWeek;
      sectionHoursAccumulator.set(section.id, currentSecHours);
    }

    // Find candidate rooms capable of holding this allocation
    const candidateRoomsIndices: number[] = [];
    activeRooms.forEach((r, rIdx) => {
      const isLabActivity = alloc.sessionType === 'Lab' || alloc.sessionType === 'Practical';
      const isLabRoom = r.type === 'ComputerLab' || r.type === 'HardwareLab';
      const isTeachingRoom = r.type === 'LectureHall' || r.type === 'SeminarRoom' || r.type === 'TutorialRoom';
      const requiredCapacity = subSectionObj
        ? subSectionObj.studentCount
        : (alloc.subSectionId ? Math.ceil(section.studentCount / 2) : section.studentCount);
      const equipmentSatisfied = course.requiredEquipment.every(
        requiredEquipment => r.equipment.includes(requiredEquipment)
      );

      const typeSatisfied = isLabActivity ? isLabRoom : isTeachingRoom;
      if (typeSatisfied && r.capacity >= requiredCapacity && equipmentSatisfied) {
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

    // Compile every valid atomic lab/practical start as a complete contiguous block.
    const feasibleLabBlocks: number[][] = [];
    if (alloc.sessionType === 'Lab' || alloc.sessionType === 'Practical') {
      const slotByIndex = new Map<number, SlotRef>(slots.map(s => [s.slotIdx, s]));
      for (const start of slots) {
        const block: number[] = [];
        let valid = true;
        for (let offset = 0; offset < durationPeriods; offset++) {
          const current = slotByIndex.get(start.slotIdx + offset);
          if (!current || current.day !== start.day || lunchSlotIndices.has(current.slotIdx) || !feasibleSlotIndices.includes(current.slotIdx)) {
            valid = false;
            break;
          }
          const previous = offset === 0 ? undefined : slotByIndex.get(start.slotIdx + offset - 1);
          if (previous) {
            const previousTs = academicYear.timeSlots?.find(t => t.id === previous.timeSlotId);
            const currentTs = academicYear.timeSlots?.find(t => t.id === current.timeSlotId);
            const contiguous = previous.periodIdx + 1 === current.periodIdx && previousTs?.endTime === currentTs?.startTime;
            if (!contiguous) { valid = false; break; }
          }
          block.push(current.slotIdx);
        }
        if (valid && block.length === durationPeriods) feasibleLabBlocks.push(block);
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
    if (fac && totalFacHours > fac.maxDirectTeachingHours) {
      infeasibilityReasons.push(
        `Faculty ${fac.name}: Assigned teaching load ${totalFacHours} hrs/week exceeds direct-teaching cap ${fac.maxDirectTeachingHours} hrs/week.`
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
  const profile = options.optimizationProfile || 'BALANCED';
  const softWeights = resolveSoftWeights(constraints, profile, options.softWeights);

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
  const sectionElectiveGroupCounts = Array.from({ length: numSections }, () => new Map<number, Map<string, number>>());

  const scheduleAssignments = new Array<{ allocIdx: number; roomIdx: number } | null>(totalSlots).fill(null);
  const allocHoursAssigned = new Array<number>(problem.allocations.length).fill(0);
  const allocAssignedSlots = Array.from({ length: problem.allocations.length }, () => [] as { slotIdx: number; roomIdx: number }[]);

  const pinnedSessions = (options.pinnedSessions || []).filter(s => s.isLocked && s.status !== 'Cancelled');
  const pinnedAllocationHours = new Map<string, number>();
  for (const pin of pinnedSessions) {
    const key = pin.courseId + '|' + pin.sectionId + '|' + pin.facultyId + '|' + (pin.subSectionId || '');
    pinnedAllocationHours.set(key, (pinnedAllocationHours.get(key) || 0) + (pin.durationPeriods || 1));
  }
  for (const pin of pinnedSessions) {
    const slotIndex = problem.slots.findIndex(s => s.day === pin.day && s.timeSlotId === pin.timeSlotId);
    const roomIndex = problem.rooms.findIndex(r => r.id === pin.roomId);
    const allocIndex = problem.allocations.findIndex(a =>
      a.course.id === pin.courseId && a.section.id === pin.sectionId && a.faculty.id === pin.facultyId &&
      (a.allocation.subSectionId || '') === (pin.subSectionId || ''));
    if (slotIndex < 0) throw new Error('Pinned session ' + pin.id + ' references an invalid time slot.');
    if (roomIndex < 0) throw new Error('Pinned session ' + pin.id + ' references an unavailable/unknown room.');
    if (allocIndex < 0) throw new Error('Pinned session ' + pin.id + ' has no matching course allocation.');
    const allocation = problem.allocations[allocIndex];
    const block = Array.from({ length: pin.durationPeriods || 1 }, (_, offset) => slotIndex + offset);
    if (block.some(idx => idx >= totalSlots)) throw new Error('Pinned session ' + pin.id + ' exceeds the configured timetable grid.');
    const blockBit = block.reduce((mask, idx) => mask | (1n << BigInt(idx)), 0n);
    if ((facultyOccupancy[allocation.facultyIdx] & blockBit) !== 0n || (roomOccupancy[roomIndex] & blockBit) !== 0n) throw new Error('Pinned session ' + pin.id + ' conflicts with another pinned assignment.');
    facultyOccupancy[allocation.facultyIdx] |= blockBit;
    roomOccupancy[roomIndex] |= blockBit;
    if (allocation.subSectionIdx !== undefined) subSectionOccupancy[allocation.subSectionIdx] |= blockBit;
    else if (pin.type === 'Elective' && pin.electiveGroupId) {
      const groups = sectionElectiveGroupCounts[allocation.sectionIdx].get(slotIndex) || new Map<string, number>();
      groups.set(pin.electiveGroupId, (groups.get(pin.electiveGroupId) || 0) + 1);
      sectionElectiveGroupCounts[allocation.sectionIdx].set(slotIndex, groups);
    } else sectionWholeOccupancy[allocation.sectionIdx] |= blockBit;
    allocHoursAssigned[allocation.allocIdx] += pin.durationPeriods || 1;
    block.forEach(idx => allocAssignedSlots[allocation.allocIdx].push({ slotIdx: idx, roomIdx: roomIndex }));
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
        profile,
        pinnedSessions,
        softWeights,
        options.buildingTravelMinutes
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
      currentAlloc.durationPeriods > 1 &&
      currentAlloc.feasibleLabBlocks.length > 0;

    if (isLabAlloc) {
      // Branch 1: Atomic multi-period lab/practical block scheduling.
      const candidateBlocks = [...currentAlloc.feasibleLabBlocks];
      if (candidatesFound.length > 0) {
        for (let i = candidateBlocks.length - 1; i > 0; i--) {
          const j = Math.floor(prng.next() * (i + 1));
          [candidateBlocks[i], candidateBlocks[j]] = [candidateBlocks[j], candidateBlocks[i]];
        }
      }

      for (const block of candidateBlocks) {
        const blockBit = block.reduce((mask, idx) => mask | (1n << BigInt(idx)), 0n);
        constraintChecksCount += block.length;
        if ((facultyOccupancy[facIdx] & blockBit) !== 0n) { candidatesPruned++; continue; }
        if (isSubgroupAlloc) {
          const subSecIdx = currentAlloc.subSectionIdx!;
          if ((sectionWholeOccupancy[secIdx] & blockBit) !== 0n || (subSectionOccupancy[subSecIdx] & blockBit) !== 0n) { candidatesPruned++; continue; }
        } else if ((sectionWholeOccupancy[secIdx] & blockBit) !== 0n || block.some(idx => sectionSubgroupCounts[secIdx][idx] > 0)) {
          candidatesPruned++; continue;
        }

        let chosenRoomIdx = -1;
        for (const rIdx of currentAlloc.candidateRooms) {
          constraintChecksCount += block.length;
          if ((roomOccupancy[rIdx] & blockBit) === 0n) { chosenRoomIdx = rIdx; break; }
        }
        if (chosenRoomIdx === -1) { candidatesPruned++; continue; }

        facultyOccupancy[facIdx] |= blockBit;
        roomOccupancy[chosenRoomIdx] |= blockBit;
        if (isSubgroupAlloc) {
          subSectionOccupancy[currentAlloc.subSectionIdx!] |= blockBit;
          for (const idx of block) sectionSubgroupCounts[secIdx][idx]++;
        } else {
          sectionWholeOccupancy[secIdx] |= blockBit;
        }
        allocHoursAssigned[currentAlloc.allocIdx] += currentAlloc.durationPeriods;
        for (const idx of block) allocAssignedSlots[currentAlloc.allocIdx].push({ slotIdx: idx, roomIdx: chosenRoomIdx });

        const success = solvePhaseA(allocOrderIdx);
        if (success) return true;

        backtracksCount++;
        facultyOccupancy[facIdx] &= ~blockBit;
        roomOccupancy[chosenRoomIdx] &= ~blockBit;
        if (isSubgroupAlloc) {
          subSectionOccupancy[currentAlloc.subSectionIdx!] &= ~blockBit;
          for (const idx of block) sectionSubgroupCounts[secIdx][idx]--;
        } else {
          sectionWholeOccupancy[secIdx] &= ~blockBit;
        }
        allocHoursAssigned[currentAlloc.allocIdx] -= currentAlloc.durationPeriods;
        for (let i = 0; i < block.length; i++) allocAssignedSlots[currentAlloc.allocIdx].pop();
      }

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
      profile,
      softWeights,
      options.buildingTravelMinutes
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
  profile: OptimizationProfile = 'BALANCED',
  pinnedSessionsForCandidate: ClassSession[] = [],
  softWeights: SoftWeightConfig = DEFAULT_SOFT_WEIGHTS_BY_PROFILE[profile],
  buildingTravelMinutes?: Record<string, number>
): GeneratedCandidate {
  const sessions: ClassSession[] = [];
  let scheduledHours = 0;
  let sessionCounter = 1;

  for (let i = 0; i < problem.allocations.length; i++) {
    const internalAlloc = problem.allocations[i];
    const assigned = allocAssignedSlots[internalAlloc.allocIdx];

    for (let offset = 0; offset < assigned.length; offset++) {
      const item = assigned[offset];
      const slotRef = problem.slots[item.slotIdx];
      const room = problem.rooms[item.roomIdx];
      const isBlock = internalAlloc.durationPeriods > 1;
      const blockIndex = isBlock ? Math.floor(offset / internalAlloc.durationPeriods) : offset;
      const blockId = isBlock
        ? 'cand-' + candidateNum + '-alloc-' + internalAlloc.allocIdx + '-block-' + (blockIndex + 1)
        : undefined;
      const pinned = pinnedSessionsForCandidate.find(pin =>
        pin.courseId === internalAlloc.course.id &&
        pin.sectionId === internalAlloc.section.id &&
        pin.facultyId === internalAlloc.faculty.id &&
        (pin.subSectionId || '') === (internalAlloc.allocation.subSectionId || '') &&
        pin.day === slotRef.day && pin.timeSlotId === slotRef.timeSlotId && pin.roomId === room.id
      );

      sessions.push(pinned ? { ...pinned } : {
        id: `sess-cand${candidateNum}-${sessionCounter++}`,
        courseId: internalAlloc.course.id,
        facultyId: internalAlloc.faculty.id,
        sectionId: internalAlloc.section.id,
        subSectionId: internalAlloc.allocation.subSectionId,
        roomId: room.id,
        day: slotRef.day,
        timeSlotId: slotRef.timeSlotId,
        type: internalAlloc.sessionType as any,
        durationPeriods: internalAlloc.durationPeriods,
        ...(blockId ? { blockId } : {}),
        status: 'Planned',
        version: 1,
      });

      scheduledHours++;
    }
  }

  const totalRequestedHours = problem.allocations.reduce((sum, a) => sum + a.requiredHours, 0);
  const softPenalty = calculateSoftPenalties(sessions, problem, profile, softWeights, buildingTravelMinutes);

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
  profile: OptimizationProfile = 'BALANCED',
  softWeights: SoftWeightConfig = DEFAULT_SOFT_WEIGHTS_BY_PROFILE[profile],
  buildingTravelMinutes?: Record<string, number>
): SoftPenaltyBreakdown {
  let facultyGapsPenalty = 0;
  let facultyConsecutivePenalty = 0;
  let studentGapsPenalty = 0;
  let studentWorkloadImbalancePenalty = 0;
  let courseDistributionPenalty = 0;
  let roomCapacityFitPenalty = 0;
  let facultyPreferenceBonus = 0;
  let studentConsecutivePenalty = 0;
  let travelPenalty = 0;
  let courseSpreadPenalty = 0;
  let repeatedPeriodPenalty = 0;

  const byFaculty: Record<string, number> = {};
  const bySection: Record<string, number> = {};
  const addFaculty = (id: string, value: number) => { byFaculty[id] = (byFaculty[id] || 0) + value; };
  const addSection = (id: string, value: number) => { bySection[id] = (bySection[id] || 0) + value; };

  const slotByKey = new Map(problem.slots.map(s => [s.day + '|' + s.timeSlotId, s]));
  const roomById = new Map(problem.rooms.map(r => [r.id, r]));
  const facultyById = new Map(problem.faculty.map(f => [f.id, f]));
  const sectionById = new Map(problem.sections.map(s => [s.id, s]));
  const sectionDayMap = new Map<string, number[]>();
  const facultyDayMap = new Map<string, number[]>();
  const courseDays = new Map<string, Set<number>>();
  const coursePeriods = new Map<string, Map<number, Set<number>>>();
  const sectionDaySessions = new Map<string, ClassSession[]>();

  for (const sess of sessions) {
    const slot = slotByKey.get(sess.day + '|' + sess.timeSlotId);
    if (!slot) continue;

    const fd = facultyDayMap.get(sess.facultyId + '|' + sess.day) || [];
    fd.push(slot.periodIdx);
    facultyDayMap.set(sess.facultyId + '|' + sess.day, fd);

    const sd = sectionDayMap.get(sess.sectionId + '|' + sess.day) || [];
    sd.push(slot.periodIdx);
    sectionDayMap.set(sess.sectionId + '|' + sess.day, sd);

    const courseKey = sess.sectionId + '|' + (sess.subSectionId || 'ALL') + '|' + sess.courseId;
    const days = courseDays.get(courseKey) || new Set<number>();
    days.add(slot.dayIdx);
    courseDays.set(courseKey, days);
    const periodMap = coursePeriods.get(courseKey) || new Map<number, Set<number>>();
    const samePeriodDays = periodMap.get(slot.periodIdx) || new Set<number>();
    samePeriodDays.add(slot.dayIdx);
    periodMap.set(slot.periodIdx, samePeriodDays);
    coursePeriods.set(courseKey, periodMap);

    const sdKey = sess.sectionId + '|' + sess.day;
    const daySessions = sectionDaySessions.get(sdKey) || [];
    daySessions.push(sess);
    sectionDaySessions.set(sdKey, daySessions);

    const room = roomById.get(sess.roomId);
    const section = sectionById.get(sess.sectionId);
    if (room && section && room.capacity - section.studentCount > 40) {
      roomCapacityFitPenalty += softWeights.roomCapacityFit;
      addSection(sess.sectionId, softWeights.roomCapacityFit);
    }

    const faculty = facultyById.get(sess.facultyId);
    if (faculty && faculty.preferences.preferredDays.includes(sess.day) && faculty.preferences.preferredPeriods.includes(slot.periodIdx + 1)) {
      facultyPreferenceBonus += softWeights.facultyPreferenceBonus;
      addFaculty(sess.facultyId, -softWeights.facultyPreferenceBonus);
    }
  }

  for (const [key, periods] of facultyDayMap) {
    periods.sort((a,b)=>a-b);
    const facultyId = key.split('|')[0];
    let consecutive = 1;
    for(let i=1;i<periods.length;i++){
      const gap=periods[i]-periods[i-1]-1;
      const intermediate=problem.slots.find(s=>s.periodIdx===periods[i-1]+1);
      if(gap>0 && !intermediate?.isLunch){
        const p=gap*softWeights.facultyGap;
        facultyGapsPenalty+=p; addFaculty(facultyId,p);
      }
      if(periods[i]===periods[i-1]+1){ consecutive++; if(consecutive>3){facultyConsecutivePenalty+=softWeights.facultyConsecutive; addFaculty(facultyId,softWeights.facultyConsecutive);} }
      else consecutive=1;
    }
  }

  for (const [key, periods] of sectionDayMap) {
    periods.sort((a,b)=>a-b);
    const sectionId=key.split('|')[0];
    let consecutive=1;
    for(let i=1;i<periods.length;i++){
      const gap=periods[i]-periods[i-1]-1;
      const intermediate=problem.slots.find(s=>s.periodIdx===periods[i-1]+1);
      if(gap>0 && !intermediate?.isLunch){const p=gap*softWeights.studentGap; studentGapsPenalty+=p; addSection(sectionId,p);}
      if(periods[i]===periods[i-1]+1){consecutive++; if(consecutive>3){studentConsecutivePenalty+=softWeights.studentConsecutive; addSection(sectionId,softWeights.studentConsecutive);}}
      else consecutive=1;
    }
    if(periods.length>5){const p=(periods.length-5)*softWeights.studentWorkload; studentWorkloadImbalancePenalty+=p; addSection(sectionId,p);}
  }

  for(const [key,days] of courseDays){
    const count=sessions.filter(s=>(s.sectionId+'|'+(s.subSectionId||'ALL')+'|'+s.courseId)===key).length;
    const sample=sessions.find(s=>(s.sectionId+'|'+(s.subSectionId||'ALL')+'|'+s.courseId)===key);
    const blocks=Math.max(1,sample?.durationPeriods||1);
    const desired=Math.min(3,Math.max(1,Math.ceil(count/blocks)));
    if(days.size<desired){const p=(desired-days.size)*softWeights.courseDistribution; courseDistributionPenalty+=p; courseSpreadPenalty+=p; addSection(key.split('|')[0],p);}
  }

  for(const [key,periodMap] of coursePeriods){
    for(const daySet of periodMap.values()) if(daySet.size>1){const p=(daySet.size-1)*softWeights.repeatedCoursePeriod; repeatedPeriodPenalty+=p; addSection(key.split('|')[0],p);}
  }

  for(const [key,arr] of sectionDaySessions){
    arr.sort((a,b)=>(slotByKey.get(a.day+'|'+a.timeSlotId)?.periodIdx??0)-(slotByKey.get(b.day+'|'+b.timeSlotId)?.periodIdx??0));
    for(let i=0;i<arr.length-1;i++){
      const pa=slotByKey.get(arr[i].day+'|'+arr[i].timeSlotId)?.periodIdx;
      const pb=slotByKey.get(arr[i+1].day+'|'+arr[i+1].timeSlotId)?.periodIdx;
      if(pa===undefined||pb!==pa+1) continue;
      const ra=roomById.get(arr[i].roomId), rb=roomById.get(arr[i+1].roomId);
      if(!ra||!rb||ra.building===rb.building) continue;
      const buildingA = ra.building;
      const buildingB = rb.building;
      const pair = buildingA + '|' + buildingB;
      const reversePair = buildingB + '|' + buildingA;
      const minutes = Math.max(10, Number(buildingTravelMinutes?.[pair] ?? buildingTravelMinutes?.[reversePair] ?? 10));
      const p=(minutes/10)*softWeights.travel;
      travelPenalty+=p; addSection(key.split('|')[0],p);
    }
  }

  const totalPenalty=Math.max(0,
    facultyGapsPenalty+facultyConsecutivePenalty+studentGapsPenalty+
    studentWorkloadImbalancePenalty+courseDistributionPenalty+
    roomCapacityFitPenalty+studentConsecutivePenalty+travelPenalty+
    repeatedPeriodPenalty-facultyPreferenceBonus
  );
  const round=(n:number)=>Number(n.toFixed(1));
  return {
    facultyGapsPenalty:round(facultyGapsPenalty),
    facultyConsecutivePenalty:round(facultyConsecutivePenalty),
    studentGapsPenalty:round(studentGapsPenalty),
    studentWorkloadImbalancePenalty:round(studentWorkloadImbalancePenalty),
    courseDistributionPenalty:round(courseDistributionPenalty),
    roomCapacityFitPenalty:round(roomCapacityFitPenalty),
    facultyPreferenceBonus:round(facultyPreferenceBonus),
    studentConsecutivePenalty:round(studentConsecutivePenalty),
    travelPenalty:round(travelPenalty),
    courseSpreadPenalty:round(courseSpreadPenalty),
    repeatedPeriodPenalty:round(repeatedPeriodPenalty),
    byFaculty:Object.fromEntries(Object.entries(byFaculty).map(([k,v])=>[k,round(v)])),
    bySection:Object.fromEntries(Object.entries(bySection).map(([k,v])=>[k,round(v)])),
    totalPenalty:round(totalPenalty)
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
  profile: OptimizationProfile = 'BALANCED',
  softWeights: SoftWeightConfig = DEFAULT_SOFT_WEIGHTS_BY_PROFILE[profile],
  buildingTravelMinutes?: Record<string, number>
) {
  const endBy = performance.now() + Math.max(50, remainingBudgetMs);

  for (const candidate of candidates) {
    if (performance.now() > endBy || candidate.sessions.length < 2) break;

    let currentSessions = candidate.sessions.map(session => ({ ...session }));
    let currentPenalty = candidate.softPenalty.totalPenalty;
    let bestSessions = currentSessions.map(session => ({ ...session }));
    let bestPenalty = currentPenalty;
    let acceptedMoves = 0;
    let iterations = 0;
    const initialTemperature = Math.max(1, currentPenalty * 0.25);

    const movable = () => currentSessions
      .map((session, index) => ({ session, index }))
      .filter(({ session }) =>
        !session.isLocked &&
        session.durationPeriods === 1 &&
        session.type !== 'Lab' &&
        session.type !== 'Practical'
      );

    while (performance.now() < endBy) {
      const movableSessions = movable();
      if (movableSessions.length < 2) break;

      const aPick = movableSessions[Math.floor(prng.next() * movableSessions.length)];
      const bPick = movableSessions[Math.floor(prng.next() * movableSessions.length)];
      if (!aPick || !bPick || aPick.index === bPick.index) continue;

      const a = aPick.session;
      const b = bPick.session;
      if (a.day === b.day && a.timeSlotId === b.timeSlotId) continue;

      const proposal = currentSessions.map((session, index) => {
        if (index === aPick.index) return { ...session, day: b.day, timeSlotId: b.timeSlotId };
        if (index === bPick.index) return { ...session, day: a.day, timeSlotId: a.timeSlotId };
        return session;
      });

      if (!validateHardConstraintsFast(proposal, problem)) continue;

      const proposedPenalty = calculateSoftPenalties(
        proposal,
        problem,
        profile,
        softWeights,
        buildingTravelMinutes
      ).totalPenalty;
      const delta = proposedPenalty - currentPenalty;
      const progress = Math.min(1, iterations / 5000);
      const temperature = Math.max(0.05, initialTemperature * Math.pow(0.995, iterations) * (1 - 0.5 * progress));
      const accept = delta <= 0 || prng.next() < Math.exp(-delta / temperature);

      iterations++;
      if (!accept) continue;

      currentSessions = proposal;
      currentPenalty = proposedPenalty;
      acceptedMoves++;

      if (currentPenalty < bestPenalty) {
        bestPenalty = currentPenalty;
        bestSessions = currentSessions.map(session => ({ ...session }));
      }
    }

    if (bestPenalty < candidate.softPenalty.totalPenalty) {
      const bestBreakdown = calculateSoftPenalties(
        bestSessions,
        problem,
        profile,
        softWeights,
        buildingTravelMinutes
      );
      candidate.sessions = bestSessions;
      candidate.softPenalty = bestBreakdown;
      candidate.healthScore = Math.max(10, Math.min(100, Math.round(100 - bestBreakdown.totalPenalty)));
      candidate.objectiveValue = bestBreakdown.totalPenalty;
      candidate.optimizationMethod = 'Simulated Annealing';
      candidate.bestBound = null;
      candidate.optimalityGap = null;
      candidate.unscheduledAllocations = [];
      candidate.hardConstraintViolations = 0;
    } else {
      candidate.optimizationMethod = 'Constructive Bitset MRV';
    }

    candidate.softPenalty.totalPenalty = Number(candidate.softPenalty.totalPenalty.toFixed(1));
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
