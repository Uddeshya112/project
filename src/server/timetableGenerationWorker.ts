import { parentPort, workerData } from 'node:worker_threads';
import { executeOptimizationEngine, type BudgetMode } from '../lib/optimizationEngine';
import { validateTimetableIndependently } from '../lib/independentValidator';
import type {
  AcademicConstraint,
  AcademicYearConfig,
  Course,
  CourseAllocation,
  Faculty,
  GenerationRoutine,
  OptimizationProfile,
  Room,
  StudentSection,
} from '../types';

type WorkerPayload = {
  academicYear: AcademicYearConfig;
  allocations: CourseAllocation[];
  facultyMembers: Faculty[];
  rooms: Room[];
  sections: StudentSection[];
  courses: Course[];
  constraints: AcademicConstraint[];
  budgetMode: BudgetMode;
  timeBudgetMs: number;
  routines: Array<{
    id: string;
    label: string;
    description?: string;
    optimizationProfile: OptimizationProfile;
    seed: number;
  }>;
};

const payload = workerData as WorkerPayload;

function emit(message: Record<string, unknown>) {
  parentPort?.postMessage(message);
}

function buildRoutine(
  cfg: WorkerPayload['routines'][number],
  candidate: any,
  validation: ReturnType<typeof validateTimetableIndependently>,
  rooms: Room[]
): GenerationRoutine {
  const roomBookings = new Set(candidate.sessions.map((s: any) => s.roomId + '|' + s.day + '|' + s.timeSlotId));
  const labRooms = new Set(rooms.filter(r => r.type === 'ComputerLab' || r.type === 'HardwareLab').map(r => r.id));
  const labBookings = new Set(
    candidate.sessions
      .filter((s: any) => labRooms.has(s.roomId))
      .map((s: any) => s.roomId + '|' + s.day + '|' + s.timeSlotId)
  );
  const activeRooms = rooms.filter(r => r.isAvailable).length;
  const teachingPeriods = payload.academicYear.timeSlots.filter(ts => !ts.isBreak && !ts.isLunch).length;
  const dayCount = payload.academicYear.workingDays.length || 1;
  const denominator = Math.max(1, activeRooms * teachingPeriods * dayCount);

  return {
    id: cfg.id,
    label: cfg.label,
    description: cfg.description,
    optimizationProfile: cfg.optimizationProfile,
    sessions: candidate.sessions,
    validation: {
      valid: validation.isValid && validation.canPublish,
      hardViolations: validation.hardViolationsCount,
      unscheduled: Math.max(0, validation.requiredSessionsCount - validation.scheduledSessionsCount),
      studentConflicts: validation.violations.filter(v => v.code === 'GROUP_COLLISION' || v.code === 'SUBGROUP_COLLISION' || v.code === 'CROSS_COHORT_COLLISION').length,
      facultyConflicts: validation.violations.filter(v => v.code === 'FACULTY_COLLISION').length,
      roomConflicts: validation.violations.filter(v => v.code === 'ROOM_COLLISION').length,
      capacityViolations: validation.violations.filter(v => v.code === 'CAPACITY_SHORTAGE').length,
      availabilityViolations: validation.violations.filter(v => v.code === 'FACULTY_UNAVAILABLE' || v.code === 'FACULTY_INACTIVE' || v.code === 'ROOM_UNAVAILABLE' || v.code === 'BREAK_PERIOD_VIOLATION' || v.code === 'NON_WORKING_DAY').length,
      blockingReasons: validation.violations.filter(v => v.severity === 'CRITICAL').map(v => v.message),
    },
    metrics: {
      studentGaps: validation.metrics.totalStudentGaps,
      facultyGaps: validation.metrics.totalFacultyGaps,
      roomUtilization: Number(((roomBookings.size / denominator) * 100).toFixed(2)),
      labUtilization: Number(((labBookings.size / Math.max(1, labRooms.size * teachingPeriods * dayCount)) * 100).toFixed(2)),
      sameCourseSameDayCount: validation.metrics.sameCourseSameDayCount,
      sameCourseConsecutiveCount: validation.metrics.sameCourseConsecutiveCount,
      avgStudentDailyLoad: validation.metrics.avgStudentDailyLoad,
      maxStudentDailyLoad: validation.metrics.maxStudentDailyLoad,
      avgFacultyDailyLoad: validation.metrics.avgFacultyDailyLoad,
      maxFacultyDailyLoad: validation.metrics.maxFacultyDailyLoad,
      courseDistributionQualityRate: validation.metrics.courseDistributionQualityRate,
    },
    healthScore: candidate.healthScore,
  };
}

try {
  const routines: Array<GenerationRoutine & { candidate: unknown; softPenalty: unknown; seed: number }> = [];
  for (let i = 0; i < payload.routines.length; i++) {
    const cfg = payload.routines[i];
    emit({ type: 'progress', progress: Math.round((i / payload.routines.length) * 100), phase: 'solving', routine: cfg.label });

    const result = executeOptimizationEngine(
      payload.academicYear,
      payload.allocations,
      payload.facultyMembers,
      payload.rooms,
      payload.sections,
      payload.courses,
      payload.constraints,
      {
        budgetMode: payload.budgetMode,
        optimizationProfile: cfg.optimizationProfile,
        timeBudgetMs: payload.timeBudgetMs,
        seed: cfg.seed,
        maxCandidates: 1,
      }
    );

    if (!result.bestCandidate) {
      routines.push({
        id: cfg.id,
        label: cfg.label,
        description: cfg.description,
        optimizationProfile: cfg.optimizationProfile,
        sessions: [],
        validation: {
          valid: false,
          hardViolations: result.metrics.hardConstraintViolations,
          unscheduled: payload.allocations.reduce((sum, a) => sum + a.hoursPerWeek, 0),
          studentConflicts: 0,
          facultyConflicts: 0,
          roomConflicts: 0,
          capacityViolations: 0,
          availabilityViolations: 0,
          blockingReasons: result.infeasibilityDiagnostics,
        },
        metrics: { studentGaps: 0, facultyGaps: 0, roomUtilization: 0, labUtilization: 0 },
        healthScore: 0,
        candidate: null,
        softPenalty: null,
        seed: cfg.seed,
      });
      continue;
    }

    const validation = validateTimetableIndependently(result.bestCandidate.sessions, {
      academicYear: payload.academicYear,
      allocations: payload.allocations,
      facultyMembers: payload.facultyMembers,
      rooms: payload.rooms,
      sections: payload.sections,
      courses: payload.courses,
      constraints: payload.constraints,
    });
    const routine = buildRoutine(cfg, result.bestCandidate, validation, payload.rooms);
    routines.push({ ...routine, candidate: result.bestCandidate, softPenalty: result.bestCandidate.softPenalty, seed: cfg.seed });
    emit({ type: 'progress', progress: Math.round(((i + 1) / payload.routines.length) * 100), phase: 'validated', routine: cfg.label });
  }

  emit({ type: 'completed', routines });
} catch (error) {
  emit({ type: 'failed', error: error instanceof Error ? error.message : String(error) });
}
